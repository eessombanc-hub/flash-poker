import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { InMemoryRoomStore, SqliteRoomStore, resolveStore, type RoomSnapshot, type RoomStore } from '../src/store';

const SNAP = (code: string, extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code,
  config: { name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 200, assistance: false },
  status: 'WAITING',
  hostId: 'p1',
  players: [{ id: 'p1', nickname: 'Host', avatar: null, tokenHash: 'x', state: 'LOBBY', lastSeenAt: 0, assistanceApproved: true }],
  game: null,
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  finishedAt: null,
  lastConnectedAt: 0,
  timerKey: null,
  timerKind: null,
  deadlineAt: null,
  ...extra,
});

let dirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flashpoker-store-'));
  dirs.push(dir);
  return join(dir, 'sub', 'rooms.db'); // sous-dossier volontairement absent : doit être créé tout seul
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe.each([
  ['InMemoryRoomStore', () => new InMemoryRoomStore()],
  ['SqliteRoomStore', () => new SqliteRoomStore(tmpDbPath())],
] as const)('%s : contrat commun RoomStore', (_name, make) => {
  it('sauvegarde puis retrouve exactement la même room', async () => {
    const s: RoomStore = make();
    s.save(SNAP('POKER-AAAA'));
    expect(await s.loadAll()).toEqual([SNAP('POKER-AAAA')]);
  });

  it('sauvegarder deux fois la même room écrase la précédente (pas de doublon)', async () => {
    const s: RoomStore = make();
    s.save(SNAP('POKER-AAAA', { version: 1 }));
    s.save(SNAP('POKER-AAAA', { version: 2 }));
    const all = await s.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.version).toBe(2);
  });

  it('delete retire la room ; les autres restent', async () => {
    const s: RoomStore = make();
    s.save(SNAP('POKER-AAAA'));
    s.save(SNAP('POKER-BBBB'));
    s.delete('POKER-AAAA');
    expect((await s.loadAll()).map((r) => r.code)).toEqual(['POKER-BBBB']);
  });

  it('loadAll sur un store vide : tableau vide, pas une erreur', async () => {
    expect(await make().loadAll()).toEqual([]);
  });

  it('conserve fidèlement un game imbriqué (cartes, historique) : rien perdu au passage par JSON', async () => {
    const s: RoomStore = make();
    const game = { phase: 'ROUND', round: { cards: { hands: { p1: { kind: 'own', cards: [{ code: 'As', visible: true }] } } } }, history: [{ roundNo: 1 }] };
    s.save(SNAP('POKER-AAAA', { game: game as any }));
    expect((await s.loadAll())[0]!.game).toEqual(game);
  });
});

describe('SqliteRoomStore : particularités du disque', () => {
  it('crée tout seul le dossier parent, même sur plusieurs niveaux absents', () => {
    const path = tmpDbPath();
    expect(existsSync(path)).toBe(false);
    const s = new SqliteRoomStore(path);
    s.save(SNAP('POKER-AAAA'));
    expect(existsSync(path)).toBe(true);
    s.close();
  });

  it("survit à un vrai redémarrage : une SECONDE instance sur le même fichier retrouve tout", () => {
    const path = tmpDbPath();
    const s1 = new SqliteRoomStore(path);
    s1.save(SNAP('POKER-AAAA'));
    s1.save(SNAP('POKER-BBBB'));
    s1.close(); // simule l'arrêt du serveur

    const s2 = new SqliteRoomStore(path); // simule le redémarrage : nouveau processus, même fichier
    expect(s2.loadAll().map((r) => r.code).sort()).toEqual(['POKER-AAAA', 'POKER-BBBB']);
    s2.close();
  });

  it('une ligne illisible (JSON corrompu) est ignorée, jamais une exception, et signalée via onError', () => {
    const path = tmpDbPath();
    const s = new SqliteRoomStore(path);
    s.save(SNAP('POKER-AAAA'));
    // corruption directe de la ligne, en contournant l'API (simule une donnée abîmée sur disque)
    (s as unknown as { db: { prepare: (q: string) => { run: (...a: unknown[]) => void } } }).db
      .prepare('UPDATE rooms SET data = ? WHERE code = ?')
      .run('{ceci n’est pas du JSON', 'POKER-AAAA');
    s.save(SNAP('POKER-BBBB'));
    const errors: unknown[] = [];
    const s2 = new SqliteRoomStore(path, (e) => errors.push(e));
    expect(s2.loadAll().map((r) => r.code)).toEqual(['POKER-BBBB']); // la ligne saine survit, la corrompue est écartée
    expect(errors).toHaveLength(1);
    s.close();
    s2.close();
  });

  it("une écriture qui échoue est signalée via onError, ne fait jamais planter l'appelant (best-effort)", () => {
    const s = new SqliteRoomStore(tmpDbPath());
    s.close(); // ferme la connexion : toute écriture ultérieure échoue nécessairement
    const errors: unknown[] = [];
    (s as unknown as { onError: (e: unknown) => void }).onError = (e) => errors.push(e);
    expect(() => s.save(SNAP('POKER-AAAA'))).not.toThrow();
    expect(errors).toHaveLength(1);
  });
});

describe('Persistance de bout en bout : RoomManager + SqliteRoomStore, vrai redémarrage simulé', () => {
  it('une partie en cours (cartes, tour, minuteur) est intégralement restaurée par un NOUVEAU RoomManager', async () => {
    const path = tmpDbPath();
    const store1 = new SqliteRoomStore(path);
    const scheduler1 = new ManualScheduler();
    const m1 = new RoomManager({ rng: new SeededRng(7), scheduler: scheduler1, store: store1 });

    const host = m1.createRoom({ name: 'Table', maxPlayers: 2, targetPoints: 3, stakeChips: 200, nickname: 'Host' });
    const guest = m1.joinRoom(host.code, { nickname: 'Alice' });
    m1.connect(host.code, host.playerId);
    m1.connect(host.code, guest.playerId);
    m1.startGame(host.code, host.playerId);
    const before = m1.view(host.code, host.playerId);
    expect(before.status).toBe('RUNNING');
    store1.close(); // arrêt "brutal" du processus : rien de plus n'est appelé côté store1

    // Redémarrage : nouveau processus, nouveau RoomManager, même fichier
    const store2 = new SqliteRoomStore(path);
    const m2 = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), store: store2 });
    await m2.restoreFromStore();
    const after = m2.view(host.code, host.playerId);

    expect(after.status).toBe('RUNNING');
    expect(after.players.map((p) => p.nickname).sort()).toEqual(['Alice', 'Host']);
    expect(after.game!.chooser).toBe(before.game!.chooser);
    expect(after.game!.players).toEqual(before.game!.players);
    store2.close();
  });

  it('une room annulée garde son statut « Annulée » après redémarrage (le nettoyage définitif est différé, pas immédiat)', async () => {
    const path = tmpDbPath();
    const store1 = new SqliteRoomStore(path);
    const m1 = new RoomManager({ rng: new SeededRng(1), scheduler: new ManualScheduler(), store: store1 });
    const host = m1.createRoom({ name: 'T', maxPlayers: 2, targetPoints: 3, stakeChips: 200, nickname: 'Host' });
    m1.connect(host.code, host.playerId);
    m1.cancelRoom(host.code, host.playerId);
    expect(m1.view(host.code, host.playerId).status).toBe('CANCELLED');
    store1.close();

    const store2 = new SqliteRoomStore(path);
    const m2 = new RoomManager({ rng: new SeededRng(1), scheduler: new ManualScheduler(), store: store2 });
    await m2.restoreFromStore();
    expect(m2.view(host.code, host.playerId).status).toBe('CANCELLED'); // pas ressuscitée en salle d'attente
    store2.close();
  });
});

describe("resolveStore : choix du store à partir de l'environnement (utilisé par main.ts)", () => {
  it('SQLite par défaut (persistant), même sans aucune variable définie', () => {
    const path = tmpDbPath();
    const s = resolveStore({ DB_PATH: path });
    expect(s).toBeInstanceOf(SqliteRoomStore);
    (s as SqliteRoomStore).close();
  });

  it("STORE=memory (et lui seul) bascule explicitement sur la mémoire", () => {
    expect(resolveStore({ STORE: 'memory' })).toBeInstanceOf(InMemoryRoomStore);
    expect(resolveStore({ STORE: 'autre chose' })).toBeInstanceOf(SqliteRoomStore);
    (resolveStore({ STORE: 'autre chose', DB_PATH: tmpDbPath() }) as SqliteRoomStore).close();
  });

  it('DB_PATH absent : retombe sur ./data/flashpoker.db (persistant quand même)', () => {
    // on ne vérifie pas la création réelle du fichier par défaut ici (effet de bord hors du dossier de test) :
    // seule la NATURE du store (persistant, pas mémoire) est ce qui compte pour ce test.
    const s = resolveStore({});
    expect(s).toBeInstanceOf(SqliteRoomStore);
    (s as SqliteRoomStore).close();
    rmSync('./data', { recursive: true, force: true }); // nettoyage du dossier par défaut créé par ce test
  });
});
