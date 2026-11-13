import { LEAGUES, type LeagueId } from './xp';

/**
 * Galerie de récompenses : titres, cadres d'avatar et emblèmes, débloqués par l'expérience cumulée de toutes les
 * saisons, par le meilleur grade atteint, par le nombre de hauts faits obtenus ou par un haut fait précis. Les
 * conditions portent sur l'ensemble des saisons : une récompense gagnée le reste après la remise à zéro d'une saison.
 */
export type RewardKind = 'title' | 'frame' | 'emblem';
export const REWARD_KINDS: readonly RewardKind[] = ['title', 'frame', 'emblem'];

export type Need = { of: 'xp'; n: number } | { of: 'league'; league: LeagueId } | { of: 'feats'; n: number } | { of: 'seasons'; n: number } | { of: 'feat'; feat: string };

interface Def {
  id: string;
  kind: RewardKind;
  need: Need;
}

const xp = (n: number): Need => ({ of: 'xp', n });
const league = (l: LeagueId): Need => ({ of: 'league', league: l });
const feats = (n: number): Need => ({ of: 'feats', n });
const seasons = (n: number): Need => ({ of: 'seasons', n });
const feat = (f: string): Need => ({ of: 'feat', feat: f });

export const REWARDS: readonly Def[] = [
  { id: 'title.novice', kind: 'title', need: xp(0) },
  { id: 'title.regular', kind: 'title', need: xp(500) },
  { id: 'title.strategist', kind: 'title', need: feats(8) },
  { id: 'title.tactician', kind: 'title', need: league('gold') },
  { id: 'title.shark', kind: 'title', need: league('platinum') },
  { id: 'title.grandmaster', kind: 'title', need: league('master') },
  { id: 'title.legend', kind: 'title', need: league('legend') },
  { id: 'title.faithful', kind: 'title', need: seasons(2) },
  { id: 'title.veteran', kind: 'title', need: seasons(4) },
  { id: 'frame.bronze', kind: 'frame', need: league('bronze') },
  { id: 'frame.silver', kind: 'frame', need: league('silver') },
  { id: 'frame.gold', kind: 'frame', need: league('gold') },
  { id: 'frame.platinum', kind: 'frame', need: league('platinum') },
  { id: 'frame.diamond', kind: 'frame', need: league('diamond') },
  { id: 'frame.aurora', kind: 'frame', need: feats(15) },
  { id: 'frame.ember', kind: 'frame', need: feat('win_row_5') },
  { id: 'frame.jade', kind: 'frame', need: feat('perfect_days_7') },
  { id: 'emblem.spade', kind: 'emblem', need: xp(1000) },
  { id: 'emblem.heart', kind: 'emblem', need: xp(2500) },
  { id: 'emblem.diamond', kind: 'emblem', need: xp(5000) },
  { id: 'emblem.club', kind: 'emblem', need: xp(10000) },
  { id: 'emblem.crown', kind: 'emblem', need: feats(25) },
  { id: 'emblem.compass', kind: 'emblem', need: feat('explorer_all') },
  { id: 'emblem.chips', kind: 'emblem', need: feat('bj_wins_50') },
];
export const REWARD_BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

/** Cumul de toutes les saisons jouées. */
export interface CareerFacts {
  xp: number;
  /** Rang du meilleur grade atteint (0 = Bronze). */
  bestLeague: number;
  /** Hauts faits obtenus, toutes saisons confondues (un même haut fait compte une fois par saison). */
  feats: number;
  seasons: number;
  /** Identifiants des hauts faits obtenus au moins une fois. */
  featIds: ReadonlySet<string>;
}

export interface RewardStatus {
  id: string;
  kind: RewardKind;
  need: Need;
  unlocked: boolean;
  value: number;
  target: number;
}

const leagueIndex = (l: LeagueId): number => LEAGUES.findIndex((x) => x.id === l);

export function evaluateReward(d: Def, c: CareerFacts): RewardStatus {
  const n = d.need;
  let value: number;
  let target: number;
  switch (n.of) {
    case 'xp':
      (value = c.xp), (target = n.n);
      break;
    case 'league':
      (value = c.bestLeague), (target = leagueIndex(n.league));
      break;
    case 'feats':
      (value = c.feats), (target = n.n);
      break;
    case 'seasons':
      (value = c.seasons), (target = n.n);
      break;
    case 'feat':
      (value = c.featIds.has(n.feat) ? 1 : 0), (target = 1);
      break;
  }
  return { id: d.id, kind: d.kind, need: n, unlocked: value >= target, value: Math.min(value, target), target };
}

export const evaluateRewards = (c: CareerFacts): RewardStatus[] => REWARDS.map((d) => evaluateReward(d, c));
