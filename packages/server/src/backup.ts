import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Sauvegarde durable de la base des comptes, sans disque payant : un instantané chiffré (AES-256-GCM) est déposé
 * dans un dépôt GitHub privé, puis relu au démarrage quand le fichier local a disparu (plan gratuit de Render :
 * le disque est effacé à chaque redéploiement ou réveil). GitHub ne voit jamais que des octets chiffrés.
 *
 * Règle de sûreté : si la restauration échoue autrement que par « aucune sauvegarde encore », les envois sont
 * suspendus. Une base vide ne doit jamais écraser une bonne sauvegarde.
 */
export interface BackupConfig {
  repo: string;
  token: string;
  passphrase: string;
  path: string;
  branch?: string;
  intervalMs: number;
}

export function resolveBackup(env: NodeJS.ProcessEnv): BackupConfig | null {
  const repo = env.BACKUP_GITHUB_REPO?.trim();
  const token = env.BACKUP_GITHUB_TOKEN?.trim();
  const passphrase = env.BACKUP_PASSPHRASE;
  if (!repo || !token || !passphrase) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('BACKUP_GITHUB_REPO doit avoir la forme « compte/depot ».');
  const seconds = Number(env.BACKUP_INTERVAL_SECONDS ?? 60);
  return {
    repo,
    token,
    passphrase,
    path: env.BACKUP_PATH?.trim() || 'comptes.db.enc',
    ...(env.BACKUP_BRANCH?.trim() ? { branch: env.BACKUP_BRANCH.trim() } : {}),
    intervalMs: Number.isFinite(seconds) ? Math.max(15, Math.min(3600, seconds)) * 1000 : 60_000,
  };
}

const MAGIC = Buffer.from('FPB1');

export function encryptSnapshot(plain: Uint8Array, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  const body = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** Lève une erreur si la phrase de passe est fausse ou si le contenu a été altéré. */
export function decryptSnapshot(blob: Uint8Array, passphrase: string): Buffer {
  const b = Buffer.from(blob);
  if (b.length < 48 || !b.subarray(0, 4).equals(MAGIC)) throw new Error('Format de sauvegarde inconnu.');
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, b.subarray(4, 20), 32), b.subarray(20, 32));
  decipher.setAuthTag(b.subarray(32, 48));
  try {
    return gunzipSync(Buffer.concat([decipher.update(b.subarray(48)), decipher.final()]));
  } catch {
    throw new Error('Déchiffrement impossible : phrase de passe incorrecte ou sauvegarde altérée.');
  }
}

type FetchFn = typeof fetch;

export class GithubBackup {
  private sha: string | null = null;
  private lastHash = '';
  /** Faux tant que l'état distant n'a pas été lu avec succès : aucun envoi ne doit partir avant. */
  pushEnabled = false;

  constructor(
    private readonly cfg: BackupConfig,
    private readonly fetchFn: FetchFn = fetch,
    private readonly log: (s: string) => void = console.log,
  ) {}

  private url(): string {
    const path = this.cfg.path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${this.cfg.repo}/contents/${path}`;
  }

  private headers(accept = 'application/vnd.github+json'): Record<string, string> {
    return { authorization: `Bearer ${this.cfg.token}`, accept, 'x-github-api-version': '2022-11-28', 'user-agent': 'flash-poker-backup' };
  }

  private ref(): string {
    return this.cfg.branch ? `?ref=${encodeURIComponent(this.cfg.branch)}` : '';
  }

  /** Renvoie la sauvegarde déchiffrée, ou null s'il n'en existe pas encore. Toute autre situation lève une erreur. */
  async fetchLatest(): Promise<Buffer | null> {
    const meta = await this.fetchFn(this.url() + this.ref(), { headers: this.headers() });
    if (meta.status === 404) {
      this.sha = null;
      return null;
    }
    if (!meta.ok) throw new Error(`GitHub a répondu ${meta.status} (lecture de la sauvegarde).`);
    this.sha = ((await meta.json()) as { sha: string }).sha;
    const raw = await this.fetchFn(this.url() + this.ref(), { headers: this.headers('application/vnd.github.raw+json') });
    if (!raw.ok) throw new Error(`GitHub a répondu ${raw.status} (téléchargement de la sauvegarde).`);
    return decryptSnapshot(new Uint8Array(await raw.arrayBuffer()), this.cfg.passphrase);
  }

  /** Dépose l'instantané ; ignore les doublons exacts. Retente une fois si le dépôt a changé entre-temps. */
  async push(snapshot: Uint8Array): Promise<boolean> {
    if (!this.pushEnabled) return false;
    const hash = createHash('sha256').update(snapshot).digest('hex');
    if (hash === this.lastHash) return false;
    const body = (sha: string | null) =>
      JSON.stringify({ message: 'Sauvegarde automatique', content: encryptSnapshot(snapshot, this.cfg.passphrase).toString('base64'), ...(sha ? { sha } : {}), ...(this.cfg.branch ? { branch: this.cfg.branch } : {}) });
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.fetchFn(this.url(), { method: 'PUT', headers: { ...this.headers(), 'content-type': 'application/json' }, body: body(this.sha) });
      if (res.ok) {
        this.sha = ((await res.json()) as { content: { sha: string } }).content.sha;
        this.lastHash = hash;
        return true;
      }
      if ((res.status === 409 || res.status === 422) && attempt === 0) {
        const meta = await this.fetchFn(this.url() + this.ref(), { headers: this.headers() });
        this.sha = meta.ok ? ((await meta.json()) as { sha: string }).sha : null;
        continue;
      }
      throw new Error(`GitHub a répondu ${res.status} (envoi de la sauvegarde).`);
    }
    return false;
  }

  /** Mémorise l'empreinte de ce qui vient d'être restauré, pour ne pas le renvoyer tel quel. */
  markRestored(snapshot: Uint8Array): void {
    this.lastHash = createHash('sha256').update(snapshot).digest('hex');
  }
}

/**
 * À appeler avant d'ouvrir la base. Restaure le fichier local s'il est absent.
 * Renvoie la sauvegarde active, ou null si la sauvegarde n'est pas configurée.
 */
export async function restoreIfNeeded(cfg: BackupConfig | null, dbPath: string, fetchFn: FetchFn = fetch, log: (s: string) => void = console.log): Promise<GithubBackup | null> {
  if (!cfg) return null;
  const backup = new GithubBackup(cfg, fetchFn, log);
  if (existsSync(dbPath)) {
    // Fichier local présent (poste de développement, disque conservé) : il fait foi, rien à restaurer.
    try {
      await backup.fetchLatest();
      backup.pushEnabled = true;
    } catch (e) {
      log(`⚠ Sauvegarde : lecture distante impossible (${(e as Error).message}). Envois suspendus jusqu'au prochain démarrage.`);
    }
    return backup;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const snap = await backup.fetchLatest();
      if (snap) {
        mkdirSync(dirname(dbPath), { recursive: true });
        writeFileSync(dbPath, snap);
        backup.markRestored(snap);
        log(`Sauvegarde : base des comptes restaurée (${Math.round(snap.length / 1024)} Ko).`);
      } else {
        log('Sauvegarde : aucune sauvegarde distante, démarrage sur une base neuve.');
      }
      backup.pushEnabled = true;
      return backup;
    } catch (e) {
      log(`⚠ Sauvegarde : restauration impossible (essai ${attempt}/3) : ${(e as Error).message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  log('⚠ Sauvegarde : envois suspendus pour ne pas écraser la sauvegarde existante. Corrigez la configuration puis redémarrez.');
  return backup;
}

/** Instantané cohérent de la base ouverte (VACUUM INTO), lu en mémoire. */
export function snapshotDb(db: DatabaseSync): Buffer {
  const tmp = join(tmpdir(), `fp-snap-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    return readFileSync(tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Lance l'envoi périodique et l'envoi final à l'arrêt. Renvoie une fonction d'arrêt. */
export function startBackupLoop(backup: GithubBackup, db: DatabaseSync, intervalMs: number, log: (s: string) => void = console.log): { flush: () => Promise<void>; stop: () => void } {
  let busy = false;
  const flush = async () => {
    if (busy) return;
    busy = true;
    try {
      if (await backup.push(snapshotDb(db))) log('Sauvegarde : instantané envoyé.');
    } catch (e) {
      log(`⚠ Sauvegarde : envoi échoué (${(e as Error).message}). Nouvel essai au prochain cycle.`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void flush(), intervalMs);
  timer.unref();
  return { flush, stop: () => clearInterval(timer) };
}
