import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type { GameSnapshot } from '@poker/engine';

// `node:sqlite` est encore expérimental : certains outils (Vite/Vitest dans la version utilisée ici) ne le
// reconnaissent pas dans leur liste de modules natifs et tentent de le résoudre comme un paquet npm s'il est
// importé de façon statique. On passe par `require` (natif Node, jamais analysé par Vite) pour l'obtenir ;
// seul le type est importé statiquement (effacé à la compilation, donc jamais vu par Vite).
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import type { PlayerState, RoomStatus } from './protocol';

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  targetPoints: number;
  stakeCents: number;
  /** Assistance proposée par l'hôte à la création (voir `RoomManager.approveAssistance`). */
  assistance: boolean;
  /** Salle privée : absente de la liste publique, accessible seulement par son code ou le lien d'invitation.
   * Absent des parties enregistrées avant son ajout : publique. */
  private?: boolean;
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  avatar: string | null;
  /** Compte du joueur inscrit, null pour un invité (absent des sauvegardes antérieures aux comptes). */
  accountId?: string | null;
  /** Empreinte SHA-256 du jeton : le jeton lui-même n'est jamais conservé. */
  tokenHash: string;
  state: PlayerState;
  lastSeenAt: number;
  /** Vote sur l'assistance proposée par l'hôte : true = approuve, false = refuse, null = pas encore répondu
   * (compte comme un refus au départ). Toujours true si `RoomConfig.assistance` est faux (rien à approuver). */
  assistanceApproved: boolean | null;
}

/** État complet et sérialisable d'une room (contient les cartes : usage serveur uniquement). */
export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  status: RoomStatus;
  hostId: string;
  players: PlayerSnapshot[];
  game: GameSnapshot | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  lastConnectedAt: number;
  timerKey: string | null;
  timerKind: 'VARIANT' | 'INSURANCE' | 'ROUND' | null;
  /** Échéance ABSOLUE (ms) : après un redémarrage, le minuteur reprend au temps restant. */
  deadlineAt: number | null;
}

/**
 * Persistance des rooms. Implémentation mémoire fournie ; un adaptateur PostgreSQL (JSONB) se branche ici.
 * Best-effort : une erreur d'écriture ne doit jamais interrompre une partie.
 */
export interface RoomStore {
  save(snapshot: RoomSnapshot): void | Promise<void>;
  delete(code: string): void | Promise<void>;
  loadAll(): RoomSnapshot[] | Promise<RoomSnapshot[]>;
}

export class InMemoryRoomStore implements RoomStore {
  private data = new Map<string, string>();
  save(snapshot: RoomSnapshot): void {
    this.data.set(snapshot.code, JSON.stringify(snapshot)); // sérialisation : garantit un état 100 % JSON
  }
  delete(code: string): void {
    this.data.delete(code);
  }
  loadAll(): RoomSnapshot[] {
    return [...this.data.values()].map((s) => JSON.parse(s) as RoomSnapshot);
  }
  size(): number {
    return this.data.size;
  }
}

/**
 * Persistance sur disque (SQLite, fichier local, sans serveur de base de données à administrer) : les parties
 * survivent à un redémarrage du serveur. Un seul fichier suffit sur n'importe quel VPS ; convient à une
 * instance unique. Passer à PostgreSQL (même interface `RoomStore`) le jour où plusieurs instances du serveur
 * doivent partager le même état (répartition de charge).
 * Écriture synchrone (module `node:sqlite`, intégré à Node.js — aucune dépendance externe, aucune compilation
 * native requise) : ne bloque jamais la boucle d'événements plus que quelques microsecondes pour une room
 * (quelques Ko de JSON) ; une erreur d'écriture est journalisée sans jamais interrompre la partie en mémoire
 * (best-effort, conforme à l'interface `RoomStore`).
 */
export class SqliteRoomStore implements RoomStore {
  private readonly db: DatabaseSyncType;

  constructor(path: string, private readonly onError: (e: unknown) => void = (e) => console.error('[SqliteRoomStore]', e)) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true }); // le dossier n'existe pas forcément encore
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL'); // écritures concurrentes sûres, meilleures performances
    this.db.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  }

  save(snapshot: RoomSnapshot): void {
    try {
      this.db.prepare('INSERT INTO rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(snapshot.code, JSON.stringify(snapshot), Date.now());
    } catch (e) {
      this.onError(e); // best-effort : la partie continue en mémoire même si l'écriture disque échoue
    }
  }

  delete(code: string): void {
    try {
      this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
    } catch (e) {
      this.onError(e);
    }
  }

  loadAll(): RoomSnapshot[] {
    const rows = this.db.prepare('SELECT code, data FROM rooms').all() as { code: string; data: string }[];
    const out: RoomSnapshot[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.data) as RoomSnapshot);
      } catch (e) {
        this.onError(new Error(`room ${row.code} : JSON illisible, ignorée (${String(e)})`));
      }
    }
    return out;
  }

  /** Ferme le fichier proprement (tests, arrêt propre du serveur). */
  close(): void {
    this.db.close();
  }
}

/**
 * Choix du store à partir des variables d'environnement : SQLite par défaut (persistant), mémoire uniquement
 * si `STORE=memory` est explicitement demandé (essai local jetable). Fonction pure, isolée de `main.ts` pour
 * rester testable sans démarrer un vrai serveur.
 */
export function resolveStore(env: Record<string, string | undefined>): RoomStore {
  if (env.STORE === 'memory') return new InMemoryRoomStore();
  return new SqliteRoomStore(env.DB_PATH ?? './data/flashpoker.db');
}
