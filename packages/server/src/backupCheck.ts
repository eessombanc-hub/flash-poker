import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountDb } from './accounts/db';
import { decryptSnapshot } from './backup';

/**
 * Contrôle d'une sauvegarde sans toucher à la base en service : déchiffrement, intégrité SQLite, ouverture par le code
 * actuel (donc compatibilité du schéma) et décompte des lignes par table. Aucune donnée personnelle n'est lue ni affichée.
 */
export interface BackupReport {
  ok: boolean;
  sizeKb: number;
  integrity: string;
  /** Le code actuel ouvre la base sans erreur (migrations comprises). */
  opensWithCurrentCode: boolean;
  tables: Record<string, number>;
  /** Date du compte le plus récent et de la dernière partie, pour juger la fraîcheur de la sauvegarde. */
  newestAccountAt: number | null;
  newestGameAt: number | null;
  problems: string[];
}

const TABLE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function maxOf(db: DatabaseSync, table: string, col: string): number | null {
  try {
    const row = db.prepare(`SELECT MAX(${col}) AS m FROM ${table}`).get() as { m: number | null } | undefined;
    return row?.m ?? null;
  } catch {
    return null;
  }
}

export function inspectSnapshot(plain: Uint8Array): BackupReport {
  const dir = mkdtempSync(join(tmpdir(), 'fp-restore-'));
  const file = join(dir, 'restauration.db');
  const problems: string[] = [];
  const report: BackupReport = { ok: false, sizeKb: Math.round(plain.length / 1024), integrity: '', opensWithCurrentCode: false, tables: {}, newestAccountAt: null, newestGameAt: null, problems };
  try {
    writeFileSync(file, plain);
    const raw = new DatabaseSync(file, { readOnly: true });
    try {
      report.integrity = String((raw.prepare('PRAGMA integrity_check').get() as Record<string, unknown>).integrity_check ?? '');
      if (report.integrity !== 'ok') problems.push(`Contrôle d'intégrité SQLite : ${report.integrity}`);
      const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name).filter((n) => TABLE_RE.test(n));
      for (const n of names) report.tables[n] = Number((raw.prepare(`SELECT COUNT(*) AS c FROM ${n}`).get() as { c: number }).c);
      report.newestAccountAt = maxOf(raw, 'users', 'created_at');
      report.newestGameAt = maxOf(raw, 'games', 'ended_at');
    } finally {
      raw.close();
    }
    if (!('users' in report.tables)) problems.push('La table des comptes est absente : ce n’est pas une base de comptes Flash Poker.');
    else if (report.tables.users === 0) problems.push('La base ne contient aucun compte : vérifiez qu’il s’agit bien de la sauvegarde de production.');
    try {
      const db = new AccountDb(file);
      db.db.close();
      report.opensWithCurrentCode = true;
    } catch (e) {
      problems.push(`Le code actuel n’ouvre pas cette base : ${(e as Error).message}`);
    }
  } catch (e) {
    problems.push((e as Error).message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  report.ok = problems.length === 0;
  return report;
}

/** Déchiffre puis contrôle ; une phrase de passe fausse est un problème signalé, pas une exception. */
export function inspectEncrypted(blob: Uint8Array, passphrase: string): BackupReport {
  try {
    return inspectSnapshot(decryptSnapshot(blob, passphrase));
  } catch (e) {
    return { ok: false, sizeKb: Math.round(blob.length / 1024), integrity: '', opensWithCurrentCode: false, tables: {}, newestAccountAt: null, newestGameAt: null, problems: [(e as Error).message] };
  }
}

const fmtDate = (ms: number | null): string => (ms == null ? 'aucune' : new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));

export function formatReport(r: BackupReport): string {
  const lines = [
    `Taille de la base : ${r.sizeKb} Ko`,
    `Intégrité SQLite : ${r.integrity || 'non lue'}`,
    `Ouverture par le code actuel : ${r.opensWithCurrentCode ? 'oui' : 'non'}`,
    `Compte le plus récent : ${fmtDate(r.newestAccountAt)}`,
    `Dernière partie de poker : ${fmtDate(r.newestGameAt)}`,
    '',
    'Lignes par table :',
    ...Object.entries(r.tables).map(([n, c]) => `  ${n.padEnd(22)} ${c}`),
    '',
    r.ok ? 'RÉSULTAT : la sauvegarde est lisible et cohérente. Comparez le nombre de comptes avec celui que vous attendez.' : `RÉSULTAT : problème détecté.\n${r.problems.map((p) => `  - ${p}`).join('\n')}`,
  ];
  return lines.join('\n');
}
