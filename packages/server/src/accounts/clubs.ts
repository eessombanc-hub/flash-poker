import type { DatabaseSync } from 'node:sqlite';
import { isOffensiveName } from '../moderation';

/**
 * Clubs : un joueur peut indiquer le club auquel il appartient, en texte libre. Deux écritures qui ne diffèrent que par
 * la casse, les accents ou la ponctuation (« Amical Poker Club », « amical poker-club ») désignent le même club ;
 * le nom affiché est celui du premier membre inscrit.
 */
export const CLUB_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'&-]{1,29}$/u;
/** Un club n'apparaît au classement qu'à partir de ce nombre de membres déclarés. */
export const CLUB_MIN_MEMBERS = 2;

export function clubKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type ClubCheck = { ok: true; name: string | null } | { ok: false; message: string };

/** Nettoie et valide la saisie : vide = quitter son club. */
export function checkClubName(raw: string | null): ClubCheck {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: true, name: null };
  if (!CLUB_NAME_RE.test(name) || clubKey(name).length < 2) return { ok: false, message: 'Le nom du club compte de 2 à 30 caractères : lettres, chiffres, espaces et . _ \' & -' };
  if (isOffensiveName(name)) return { ok: false, message: 'Ce nom de club n’est pas accepté' };
  return { ok: true, name };
}

export function clubOf(db: DatabaseSync, userId: string): string | null {
  const r = db.prepare('SELECT key FROM club_member WHERE user_id = ?').get(userId) as { key: string } | undefined;
  return r ? (canonicalNames(db).get(r.key) ?? null) : null;
}

export function setClub(db: DatabaseSync, userId: string, name: string | null, now: number): void {
  if (name === null) {
    db.prepare('DELETE FROM club_member WHERE user_id = ?').run(userId);
    return;
  }
  const key = clubKey(name);
  const same = db.prepare('SELECT 1 FROM club_member WHERE user_id = ? AND key = ?').get(userId, key);
  if (same) return; // même club, seule l'écriture change : on garde l'ancienneté pour ne pas déplacer le nom affiché
  db.prepare('INSERT INTO club_member (user_id, name, key, since) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, key = excluded.key, since = excluded.since').run(userId, name, key, now);
}

/** Nom affiché de chaque club (clé → nom), celui du plus ancien membre. */
export function canonicalNames(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare('SELECT key, name FROM club_member ORDER BY since ASC, rowid ASC').all() as { key: string; name: string }[];
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.key)) m.set(r.key, r.name);
  return m;
}

export function declaredMembers(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare('SELECT key, COUNT(*) AS n FROM club_member GROUP BY key').all() as { key: string; n: number }[];
  return new Map(rows.map((r) => [r.key, Number(r.n)]));
}

export interface ClubRankRow {
  rank: number;
  name: string;
  /** Membres déclarés, et ceux qui ont joué sur la saison. */
  members: number;
  active: number;
  xp: number;
  /** Expérience moyenne par membre actif. */
  average: number;
  you: boolean;
}
export interface ClubRanking {
  rows: ClubRankRow[];
  mine: ClubRankRow | null;
  clubs: number;
  season: import('./rankings').Season;
}

/** Classe les clubs sur l'expérience cumulée de leurs membres actifs sur la saison. */
export function rankClubs(db: DatabaseSync, ladder: readonly { id: string; xp: number }[], me: string, season: import('./rankings').Season): ClubRanking {
  const keyOf = new Map((db.prepare('SELECT user_id, key FROM club_member').all() as { user_id: string; key: string }[]).map((r) => [r.user_id, r.key]));
  const names = canonicalNames(db);
  const declared = declaredMembers(db);
  const agg = new Map<string, { xp: number; active: number }>();
  for (const r of ladder) {
    const k = keyOf.get(r.id);
    if (!k || (declared.get(k) ?? 0) < CLUB_MIN_MEMBERS) continue;
    const a = agg.get(k) ?? { xp: 0, active: 0 };
    a.xp += r.xp;
    a.active++;
    agg.set(k, a);
  }
  const myKey = keyOf.get(me) ?? null;
  const sorted = [...agg.entries()].sort((a, b) => b[1].xp - a[1].xp || (names.get(a[0]) ?? '').localeCompare(names.get(b[0]) ?? ''));
  const toRow = ([k, a]: [string, { xp: number; active: number }], i: number): ClubRankRow => ({ rank: i + 1, name: names.get(k) ?? k, members: declared.get(k) ?? 0, active: a.active, xp: a.xp, average: Math.round(a.xp / a.active), you: k === myKey });
  const rows = sorted.slice(0, 20).map(toRow);
  const i = sorted.findIndex(([k]) => k === myKey);
  return { rows, mine: i >= 20 ? toRow(sorted[i]!, i) : null, clubs: sorted.length, season };
}
