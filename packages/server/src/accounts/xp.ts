import { VARIANT_IDS } from '@poker/engine';
import { parisDay, type GameFact } from './engagement';

/**
 * Points d'expérience, ligues et hauts faits. Tout est calculé à la lecture à partir de l'historique (parties de
 * poker, mains de blackjack, parties de Tableau) : aucun compteur à stocker, donc rien à resynchroniser, et un
 * joueur retrouve exactement sa progression après une restauration de sauvegarde.
 */

export const LEAGUES = [
  { id: 'bronze', floor: 0 },
  { id: 'silver', floor: 400 },
  { id: 'gold', floor: 1200 },
  { id: 'platinum', floor: 3000 },
  { id: 'diamond', floor: 6500 },
  { id: 'master', floor: 12000 },
  { id: 'legend', floor: 25000 },
] as const;
export type LeagueId = (typeof LEAGUES)[number]['id'];

export interface LeagueStatus {
  id: LeagueId;
  /** Rang de la ligue, 0 pour Bronze. */
  index: number;
  floor: number;
  /** Ligue suivante et son seuil ; null au sommet. */
  next: { id: LeagueId; floor: number } | null;
  /** Avancement vers la ligue suivante, de 0 à 1 (1 au sommet). */
  progress: number;
}

export function leagueFor(xp: number): LeagueStatus {
  let i = 0;
  for (let k = 1; k < LEAGUES.length; k++) if (xp >= LEAGUES[k]!.floor) i = k;
  const cur = LEAGUES[i]!;
  const nxt = LEAGUES[i + 1];
  const progress = nxt ? Math.max(0, Math.min(1, (xp - cur.floor) / (nxt.floor - cur.floor))) : 1;
  return { id: cur.id, index: i, floor: cur.floor, next: nxt ? { id: nxt.id, floor: nxt.floor } : null, progress: Math.round(progress * 100) / 100 };
}

/** Barème : ce que rapporte chaque événement. */
export const XP_RATES = {
  pokerGame: 20,
  pokerWin: 30,
  blackjackHand: 1,
  blackjackWin: 1,
  tableauGame: 15,
  tableauWin: 25,
  challenge: { play1: 10, play3: 20, win1: 20 },
} as const;

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export const TIER_XP: Record<AchievementTier, number> = { bronze: 15, silver: 40, gold: 120, platinum: 300 };

type Metric = 'games' | 'wins' | 'streak' | 'winRow' | 'challenges' | 'perfectDays' | 'bjHands' | 'bjWins' | 'tbGames' | 'tbWins' | 'variants' | 'variantWins';

interface Def {
  id: string;
  tier: AchievementTier;
  of: Metric;
  target: number;
}

const ALL_VARIANTS = VARIANT_IDS.length;

/** Les neuf premiers identifiants sont ceux des trophées d'origine : les joueurs gardent leurs acquis. */
export const ACHIEVEMENTS: readonly Def[] = [
  { id: 'first_game', tier: 'bronze', of: 'games', target: 1 },
  { id: 'games_10', tier: 'bronze', of: 'games', target: 10 },
  { id: 'games_50', tier: 'silver', of: 'games', target: 50 },
  { id: 'games_100', tier: 'gold', of: 'games', target: 100 },
  { id: 'games_250', tier: 'platinum', of: 'games', target: 250 },
  { id: 'first_win', tier: 'bronze', of: 'wins', target: 1 },
  { id: 'wins_10', tier: 'bronze', of: 'wins', target: 10 },
  { id: 'wins_25', tier: 'silver', of: 'wins', target: 25 },
  { id: 'wins_50', tier: 'gold', of: 'wins', target: 50 },
  { id: 'wins_100', tier: 'platinum', of: 'wins', target: 100 },
  { id: 'win_row_3', tier: 'silver', of: 'winRow', target: 3 },
  { id: 'win_row_5', tier: 'gold', of: 'winRow', target: 5 },
  { id: 'streak_3', tier: 'bronze', of: 'streak', target: 3 },
  { id: 'streak_7', tier: 'silver', of: 'streak', target: 7 },
  { id: 'streak_14', tier: 'gold', of: 'streak', target: 14 },
  { id: 'streak_30', tier: 'platinum', of: 'streak', target: 30 },
  { id: 'challenges_5', tier: 'bronze', of: 'challenges', target: 5 },
  { id: 'challenges_25', tier: 'silver', of: 'challenges', target: 25 },
  { id: 'challenges_100', tier: 'gold', of: 'challenges', target: 100 },
  { id: 'perfect_day', tier: 'silver', of: 'perfectDays', target: 1 },
  { id: 'perfect_days_7', tier: 'gold', of: 'perfectDays', target: 7 },
  { id: 'bj_hands_50', tier: 'bronze', of: 'bjHands', target: 50 },
  { id: 'bj_hands_250', tier: 'silver', of: 'bjHands', target: 250 },
  { id: 'bj_wins_50', tier: 'gold', of: 'bjWins', target: 50 },
  { id: 'tb_first', tier: 'bronze', of: 'tbGames', target: 1 },
  { id: 'tb_wins_10', tier: 'silver', of: 'tbWins', target: 10 },
  { id: 'explorer_3', tier: 'silver', of: 'variants', target: 3 },
  { id: 'explorer_all', tier: 'gold', of: 'variants', target: ALL_VARIANTS },
  { id: 'variant_wins_3', tier: 'silver', of: 'variantWins', target: 3 },
];

export interface XpFacts {
  /** Parties de poker terminées, avec leur date. */
  games: readonly GameFact[];
  bjHands: number;
  bjWins: number;
  tbGames: number;
  tbWins: number;
  /** Nombre de variantes de poker jouées, et gagnées au moins une fois. */
  variants: number;
  variantWins: number;
}

export interface AchievementStatus {
  id: string;
  tier: AchievementTier;
  value: number;
  target: number;
  unlocked: boolean;
  /** Points d'expérience que rapporte ce haut fait. */
  xp: number;
}

export interface Progression {
  xp: number;
  league: LeagueStatus;
  /** Origine des points : parties, défis du jour, hauts faits. */
  breakdown: { games: number; challenges: number; achievements: number };
  achievements: AchievementStatus[];
}

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export function computeProgression(f: XpFacts): Progression {
  const sorted = [...f.games].sort((a, b) => a.endedAt - b.endedAt);
  const byDay = new Map<string, { played: number; won: number }>();
  for (const g of sorted) {
    const k = parisDay(g.endedAt);
    const d = byDay.get(k) ?? { played: 0, won: 0 };
    d.played++;
    if (g.won) d.won++;
    byDay.set(k, d);
  }

  let challenges = 0;
  let challengeXp = 0;
  let perfectDays = 0;
  for (const d of byDay.values()) {
    const a = d.played >= 1;
    const b = d.played >= 3;
    const c = d.won >= 1;
    challenges += Number(a) + Number(b) + Number(c);
    challengeXp += (a ? XP_RATES.challenge.play1 : 0) + (b ? XP_RATES.challenge.play3 : 0) + (c ? XP_RATES.challenge.win1 : 0);
    if (a && b && c) perfectDays++;
  }

  const days = [...byDay.keys()].map(dayNumber).sort((x, y) => x - y);
  let bestStreak = 0;
  let run = 0;
  let prev = -Infinity;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }
  let winRow = 0;
  let bestWinRow = 0;
  for (const g of sorted) {
    winRow = g.won ? winRow + 1 : 0;
    bestWinRow = Math.max(bestWinRow, winRow);
  }

  const wins = sorted.filter((g) => g.won).length;
  const values: Record<Metric, number> = {
    games: sorted.length,
    wins,
    streak: bestStreak,
    winRow: bestWinRow,
    challenges,
    perfectDays,
    bjHands: f.bjHands,
    bjWins: f.bjWins,
    tbGames: f.tbGames,
    tbWins: f.tbWins,
    variants: f.variants,
    variantWins: f.variantWins,
  };
  const achievements: AchievementStatus[] = ACHIEVEMENTS.map((a) => ({ id: a.id, tier: a.tier, target: a.target, value: Math.min(values[a.of], a.target), unlocked: values[a.of] >= a.target, xp: TIER_XP[a.tier] }));

  const gamesXp =
    sorted.length * XP_RATES.pokerGame + wins * XP_RATES.pokerWin + f.bjHands * XP_RATES.blackjackHand + f.bjWins * XP_RATES.blackjackWin + f.tbGames * XP_RATES.tableauGame + f.tbWins * XP_RATES.tableauWin;
  const achievementXp = achievements.filter((a) => a.unlocked).reduce((n, a) => n + a.xp, 0);
  const xp = gamesXp + challengeXp + achievementXp;
  return { xp, league: leagueFor(xp), breakdown: { games: gamesXp, challenges: challengeXp, achievements: achievementXp }, achievements };
}
