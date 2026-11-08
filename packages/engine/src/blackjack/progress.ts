import type { BjRound } from './round';
import { sha256Hex } from './sha256';

/** Progression : niveaux, défis quotidiens, objectifs. Fonctions pures, partagées par le serveur (qui fait foi) et l'interface. */

// ---------- Niveaux ----------
/** XP cumulée pour atteindre un niveau : 0, 100, 300, 600, 1 000… (niveau 10 : 4 500). */
export function xpToReach(level: number): number {
  return 50 * (level - 1) * level;
}
export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
  return level;
}
export const LEVEL_TITLES: readonly { from: number; title: string }[] = [
  { from: 1, title: 'Novice' },
  { from: 3, title: 'Habitué' },
  { from: 5, title: 'Joueur' },
  { from: 8, title: 'Expert' },
  { from: 12, title: 'Maître de table' },
  { from: 20, title: 'Légende du tapis' },
];
export function levelTitle(level: number): string {
  return [...LEVEL_TITLES].reverse().find((t) => level >= t.from)!.title;
}
/** Récompense virtuelle à chaque passage de niveau, en jetons de Blackjack. */
export const levelUpReward = (level: number): number => 100 * level;

// ---------- Bilan d'une manche ----------
export interface RoundFacts {
  hands: number;
  handsWon: number;
  handsLost: number;
  handsPushed: number;
  blackjacks: number;
  doublesWon: number;
  splitsWon: number;
  net: number;
  /** Vrai si au moins une main a été gagnée (ou le Blackjack payé) : sert aux séries de victoires. */
  won: boolean;
  lost: boolean;
}

export function roundFacts(r: BjRound): RoundFacts {
  const f: RoundFacts = { hands: r.hands.length, handsWon: 0, handsLost: 0, handsPushed: 0, blackjacks: 0, doublesWon: 0, splitsWon: 0, net: r.net, won: false, lost: false };
  for (const h of r.hands) {
    if (h.result === 'WIN' || h.result === 'BLACKJACK') {
      f.handsWon++;
      if (h.result === 'BLACKJACK') f.blackjacks++;
      if (h.doubled) f.doublesWon++;
      if (h.fromSplit) f.splitsWon++;
    } else if (h.result === 'PUSH') f.handsPushed++;
    else f.handsLost++;
  }
  f.won = r.net > 0;
  f.lost = r.net < 0;
  return f;
}

/** XP d'une manche : participation, victoire, Blackjack. */
export function xpForRound(f: RoundFacts): number {
  return 10 + (f.won ? 15 : 0) + f.blackjacks * 25 + f.doublesWon * 5;
}

// ---------- Défis quotidiens ----------
export type ChallengeMetric = 'hands' | 'wins' | 'blackjacks' | 'doublesWon' | 'splitsWon' | 'netChips' | 'rounds';
export interface ChallengeDef {
  id: string;
  label: string;
  metric: ChallengeMetric;
  goal: number;
  rewardChips: number;
  rewardXp: number;
}
export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'jouer-8', label: 'Jouer 8 manches', metric: 'rounds', goal: 8, rewardChips: 100, rewardXp: 40 },
  { id: 'jouer-20', label: 'Jouer 20 manches', metric: 'rounds', goal: 20, rewardChips: 250, rewardXp: 100 },
  { id: 'gagner-5', label: 'Gagner 5 mains', metric: 'wins', goal: 5, rewardChips: 150, rewardXp: 60 },
  { id: 'gagner-10', label: 'Gagner 10 mains', metric: 'wins', goal: 10, rewardChips: 300, rewardXp: 120 },
  { id: 'blackjack-1', label: 'Réaliser un Blackjack naturel', metric: 'blackjacks', goal: 1, rewardChips: 200, rewardXp: 80 },
  { id: 'double-2', label: 'Gagner 2 mains doublées', metric: 'doublesWon', goal: 2, rewardChips: 200, rewardXp: 80 },
  { id: 'split-1', label: 'Gagner une main séparée', metric: 'splitsWon', goal: 1, rewardChips: 150, rewardXp: 60 },
  { id: 'gain-300', label: 'Cumuler 300 jetons de gain net', metric: 'netChips', goal: 300, rewardChips: 250, rewardXp: 100 },
];

/** Trois défis du jour, tirés de façon déterministe (identiques sur toute la journée pour un même joueur). */
export function dailyChallenges(userId: string, day: string): ChallengeDef[] {
  const picked: ChallengeDef[] = [];
  let i = 0;
  while (picked.length < 3) {
    const h = parseInt(sha256Hex(`bj-daily:${userId}:${day}:${i++}`).slice(0, 8), 16);
    const c = CHALLENGES[h % CHALLENGES.length]!;
    if (!picked.some((p) => p.id === c.id || p.metric === c.metric)) picked.push(c);
  }
  return picked;
}

/** Avancement d'un défi après une manche. `netChips` est cumulé net (une perte le fait reculer, jamais sous 0). */
export function challengeDelta(metric: ChallengeMetric, f: RoundFacts): number {
  switch (metric) {
    case 'rounds':
      return 1;
    case 'hands':
      return f.hands;
    case 'wins':
      return f.handsWon;
    case 'blackjacks':
      return f.blackjacks;
    case 'doublesWon':
      return f.doublesWon;
    case 'splitsWon':
      return f.splitsWon;
    case 'netChips':
      return f.net;
  }
}

// ---------- Objectifs à débloquer ----------
export interface BjStats {
  rounds: number;
  hands: number;
  handsWon: number;
  handsLost: number;
  handsPushed: number;
  blackjacks: number;
  doublesWon: number;
  splitsWon: number;
  netChips: number;
  bestStreak: number;
  streak: number;
  maxChips: number;
  level: number;
}
export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  rewardChips: number;
  test: (s: BjStats) => boolean;
}
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'premiere-victoire', label: 'Première victoire', description: 'Gagner une main.', rewardChips: 50, test: (s) => s.handsWon >= 1 },
  { id: 'dix-manches', label: 'Habitué', description: 'Jouer 10 manches.', rewardChips: 100, test: (s) => s.rounds >= 10 },
  { id: 'cent-manches', label: 'Pilier de table', description: 'Jouer 100 manches.', rewardChips: 500, test: (s) => s.rounds >= 100 },
  { id: 'premier-blackjack', label: 'Blackjack !', description: 'Réaliser un Blackjack naturel.', rewardChips: 100, test: (s) => s.blackjacks >= 1 },
  { id: 'serie-5', label: 'En série', description: '5 manches gagnées d’affilée.', rewardChips: 250, test: (s) => s.bestStreak >= 5 },
  { id: 'double-gagnant', label: 'Quitte ou double', description: 'Gagner une main doublée.', rewardChips: 100, test: (s) => s.doublesWon >= 1 },
  { id: 'separation', label: 'Deux fois plus de chances', description: 'Gagner une main issue d’une séparation.', rewardChips: 100, test: (s) => s.splitsWon >= 1 },
  { id: 'niveau-5', label: 'Joueur confirmé', description: 'Atteindre le niveau 5.', rewardChips: 300, test: (s) => s.level >= 5 },
  { id: 'niveau-10', label: 'Maître de table', description: 'Atteindre le niveau 10.', rewardChips: 1000, test: (s) => s.level >= 10 },
  { id: 'bankroll-5000', label: 'Gros portefeuille', description: 'Atteindre 5 000 jetons de Blackjack.', rewardChips: 0, test: (s) => s.maxChips >= 5000 },
];
export function newlyUnlocked(stats: BjStats, already: ReadonlySet<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.test(stats));
}
