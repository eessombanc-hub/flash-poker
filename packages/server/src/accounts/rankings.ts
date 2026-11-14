import { VARIANT_IDS } from '@poker/engine';
import type { DatabaseSync } from 'node:sqlite';
import { canonicalNames, CLUB_MIN_MEMBERS, declaredMembers } from './clubs';
import type { FinishedGame } from './types';

/**
 * Classements par type de jeu (semaine, mois, total). Un journal de résultats daté (table rank_log) alimente tout :
 * une ligne par joueur, par jeu et par événement (partie de poker, main de blackjack, partie de Tableau).
 */
export const RANK_PERIODS = ['week', 'month', 'season', 'all'] as const;
export type RankPeriod = (typeof RANK_PERIODS)[number];
/** `poker` = parties de poker (victoires de partie) ; `V6_3`… = manches gagnées dans une variante ; puis blackjack et Tableau. */
export const RANK_GAMES = ['poker', ...VARIANT_IDS, 'blackjack', 'tableau:classic', 'tableau:hand5'] as const;
export type RankGame = (typeof RANK_GAMES)[number];

export interface RankRow {
  rank: number;
  nickname: string;
  avatar: string | null;
  /** Club déclaré par le joueur (nom d'usage), ou null. */
  club: string | null;
  wins: number;
  played: number;
  /** Gain net en jetons (blackjack uniquement). */
  net: number | null;
  you: boolean;
}
/** Une ligne du classement des clubs sur un jeu et une période : total des membres du club. */
export interface ClubGameRow {
  rank: number;
  name: string;
  members: number;
  /** Membres ayant joué sur la période. */
  active: number;
  wins: number;
  played: number;
  net: number | null;
  you: boolean;
}
export interface ClubGameRanking {
  game: RankGame;
  period: RankPeriod;
  since: number;
  until: number | null;
  rows: ClubGameRow[];
  mine: ClubGameRow | null;
  clubs: number;
}
export interface Ranking {
  game: RankGame;
  period: RankPeriod;
  /** Début de la période (0 pour le total) et prochaine remise à zéro (null pour le total), en millisecondes. */
  since: number;
  until: number | null;
  rows: RankRow[];
  /** Position du joueur quand il n'est pas dans le haut du classement ; null s'il n'a pas encore joué sur la période. */
  mine: RankRow | null;
}

const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', hourCycle: 'h23', minute: 'numeric', second: 'numeric' });
function parts(ms: number): { y: number; m: number; d: number; dow: number; offset: number } {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(String(p.weekday));
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), dow, offset: asUtc - Math.floor(ms / 1000) * 1000 };
}
/** Minuit à Paris du jour civil donné (le décalage d'été ou d'hiver est celui qui règne à cet instant). */
function parisMidnight(y: number, m: number, d: number): number {
  const naive = Date.UTC(y, m, d);
  let t = naive - parts(naive).offset;
  t = naive - parts(t).offset;
  return t;
}
/** Début de la semaine (lundi 00 h) ou du mois (le 1er, 00 h), heure de Paris, et début de la suivante. */
export function periodBounds(now: number, period: RankPeriod): { since: number; until: number | null } {
  if (period === 'all') return { since: 0, until: null };
  if (period === 'season') {
    const s = seasonAt(now);
    return { since: s.start, until: s.end };
  }
  const p = parts(now);
  if (period === 'week') {
    const since = parisMidnight(p.y, p.m, p.d - p.dow);
    return { since, until: parisMidnight(p.y, p.m, p.d - p.dow + 7) };
  }
  return { since: parisMidnight(p.y, p.m, 1), until: parisMidnight(p.y, p.m + 1, 1) };
}

/**
 * Saison : un trimestre civil, heure de Paris (janvier-mars, avril-juin, juillet-septembre, octobre-décembre).
 * Les points, les hauts faits et les classements de saison repartent de zéro à chaque changement de trimestre.
 */
export interface Season {
  /** Ex. « 2026-T4 ». */
  id: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  start: number;
  end: number;
}
export function seasonAt(ms: number): Season {
  const p = parts(ms);
  const quarter = (Math.floor(p.m / 3) + 1) as Season['quarter'];
  const m0 = (quarter - 1) * 3;
  return { id: `${p.y}-T${quarter}`, year: p.y, quarter, start: parisMidnight(p.y, m0, 1), end: parisMidnight(p.y, m0 + 3, 1) };
}
/** Saisons de celle qui contient `firstMs` jusqu'à celle qui contient `nowMs`, de la plus ancienne à la plus récente. */
export function seasonsBetween(firstMs: number, nowMs: number): Season[] {
  const out: Season[] = [];
  let s = seasonAt(Math.min(firstMs, nowMs));
  const last = seasonAt(nowMs).id;
  for (let guard = 0; guard < 400; guard++) {
    out.push(s);
    if (s.id === last) break;
    s = seasonAt(s.end);
  }
  return out;
}

export interface RankEntry {
  userId: string;
  game: RankGame;
  ref: string;
  endedAt: number;
  played: number;
  won: number;
  score?: number;
}
export function logRank(db: DatabaseSync, e: RankEntry): void {
  db.prepare('INSERT OR IGNORE INTO rank_log (user_id, game, ref, ended_at, played, won, score) VALUES (?, ?, ?, ?, ?, ?, ?)').run(e.userId, e.game, e.ref, e.endedAt, e.played, e.won, e.score ?? 0);
}

/** Entrées de poker d'une partie terminée pour un joueur : la partie elle-même, puis chaque variante jouée. */
export function pokerEntries(g: FinishedGame, gameId: string, userId: string, playerId: string, won: boolean): RankEntry[] {
  const out: RankEntry[] = [{ userId, game: 'poker', ref: gameId, endedAt: g.endedAt, played: 1, won: won ? 1 : 0 }];
  const by = new Map<string, { played: number; won: number }>();
  for (const r of g.history) {
    if (!(playerId in r.points)) continue;
    const s = by.get(r.variant) ?? { played: 0, won: 0 };
    s.played++;
    if ((r.award.kind === 'POINTS' || r.award.kind === 'INSTANT_VICTORY') && r.award.winner === playerId) s.won++;
    by.set(r.variant, s);
  }
  for (const [variant, s] of by) out.push({ userId, game: variant as RankGame, ref: gameId, endedAt: g.endedAt, played: s.played, won: s.won });
  return out;
}

/** Reconstitue le journal à partir des archives existantes (une seule fois, quand le journal est vide). */
export function backfillRankLog(db: DatabaseSync): void {
  const empty = (db.prepare('SELECT COUNT(*) AS n FROM rank_log').get() as { n: number }).n === 0;
  if (!empty) return;
  db.exec('BEGIN');
  try {
    const rows = db.prepare('SELECT ug.user_id, ug.game_id, ug.player_id, ug.won, g.data FROM user_games ug JOIN games g ON g.id = ug.game_id').all() as { user_id: string; game_id: string; player_id: string; won: number; data: string }[];
    for (const r of rows) for (const e of pokerEntries(JSON.parse(r.data) as FinishedGame, r.game_id, r.user_id, r.player_id, r.won === 1)) logRank(db, e);
    const bj = db.prepare('SELECT id, user_id, ended_at, net FROM bj_history').all() as { id: number; user_id: string; ended_at: number; net: number }[];
    for (const r of bj) logRank(db, { userId: r.user_id, game: 'blackjack', ref: `bj:${r.id}`, endedAt: r.ended_at, played: 1, won: r.net > 0 ? 1 : 0, score: r.net });
    // Tableau : pas d'historique daté ; les parties classées déjà jouées comptent dans le total uniquement (date 0).
    const tb = db.prepare('SELECT user_id, variant, ranked_games, ranked_wins FROM tb_profile WHERE ranked_games > 0').all() as { user_id: string; variant: string; ranked_games: number; ranked_wins: number }[];
    for (const r of tb) logRank(db, { userId: r.user_id, game: `tableau:${r.variant}` as RankGame, ref: 'legacy', endedAt: 0, played: r.ranked_games, won: r.ranked_wins });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const LIMIT = 20;
export function computeRanking(db: DatabaseSync, userId: string, game: RankGame, period: RankPeriod, now: number): Ranking {
  const { since, until } = periodBounds(now, period);
  const all = db
    .prepare(
      `SELECT u.id, u.nickname, u.avatar, SUM(l.won) AS wins, SUM(l.played) AS played, SUM(l.score) AS net
       FROM rank_log l JOIN users u ON u.id = l.user_id
       WHERE l.game = ? AND l.ended_at >= ? AND (? IS NULL OR l.ended_at < ?)
       GROUP BY u.id`,
    )
    .all(game, since, until, until) as { id: string; nickname: string; avatar: string | null; wins: number; played: number; net: number }[];
  const bj = game === 'blackjack';
  // Victoires (ou gain net au blackjack), puis moins de parties jouées, puis ordre alphabétique : le classement est stable.
  all.sort((a, b) => (bj ? b.net - a.net : 0) || b.wins - a.wins || a.played - b.played || a.nickname.localeCompare(b.nickname));
  const names = canonicalNames(db);
  const keyOf = new Map((db.prepare('SELECT user_id, key FROM club_member').all() as { user_id: string; key: string }[]).map((r) => [r.user_id, r.key]));
  const rows: RankRow[] = all.map((r, i) => ({ rank: i + 1, nickname: r.nickname, avatar: r.avatar ?? null, club: names.get(keyOf.get(r.id) ?? '') ?? null, wins: r.wins, played: r.played, net: bj ? r.net : null, you: r.id === userId }));
  const top = rows.slice(0, LIMIT);
  return { game, period, since, until, rows: top, mine: top.some((r) => r.you) ? null : (rows.find((r) => r.you) ?? null) };
}

/**
 * Classement des clubs sur un jeu : somme des victoires (ou du gain net au blackjack) des membres sur la période.
 * Seuls les clubs d'au moins deux membres déclarés sont classés ; à égalité, moins de parties jouées l'emporte.
 */
export function computeClubGameRanking(db: DatabaseSync, userId: string, game: RankGame, period: RankPeriod, now: number): ClubGameRanking {
  const { since, until } = periodBounds(now, period);
  const agg = db
    .prepare(
      `SELECT m.key AS key, SUM(l.won) AS wins, SUM(l.played) AS played, SUM(l.score) AS net, COUNT(DISTINCT l.user_id) AS active
       FROM rank_log l JOIN club_member m ON m.user_id = l.user_id
       WHERE l.game = ? AND l.ended_at >= ? AND (? IS NULL OR l.ended_at < ?)
       GROUP BY m.key`,
    )
    .all(game, since, until, until) as { key: string; wins: number; played: number; net: number; active: number }[];
  const names = canonicalNames(db);
  const declared = declaredMembers(db);
  const mineKey = (db.prepare('SELECT key FROM club_member WHERE user_id = ?').get(userId) as { key: string } | undefined)?.key ?? null;
  const bj = game === 'blackjack';
  const ranked = agg
    .filter((a) => (declared.get(a.key) ?? 0) >= CLUB_MIN_MEMBERS)
    .map((a) => ({ ...a, name: names.get(a.key) ?? a.key }))
    .sort((a, b) => (bj ? b.net - a.net : 0) || b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));
  const all: ClubGameRow[] = ranked.map((a, i) => ({ rank: i + 1, name: a.name, members: declared.get(a.key) ?? 0, active: a.active, wins: a.wins, played: a.played, net: bj ? a.net : null, you: a.key === mineKey }));
  const top = all.slice(0, LIMIT);
  return { game, period, since, until, rows: top, mine: top.some((r) => r.you) ? null : (all.find((r) => r.you) ?? null), clubs: all.length };
}
