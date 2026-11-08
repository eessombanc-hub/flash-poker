import type { BjAction, BjRoundView, HandResult, TablePreset, TableRules } from '@poker/engine';

/** Profil de Blackjack d'un joueur : jetons virtuels (sans valeur monétaire), XP, niveau, statistiques. */
export interface BjProfile {
  chips: number;
  xp: number;
  level: number;
  title: string;
  /** XP acquise dans le niveau actuel, et XP à acquérir pour le suivant. */
  xpIntoLevel: number;
  xpForNext: number;
  rounds: number;
  hands: number;
  handsWon: number;
  handsLost: number;
  handsPushed: number;
  blackjacks: number;
  doublesWon: number;
  splitsWon: number;
  netChips: number;
  streak: number;
  bestStreak: number;
  maxChips: number;
  /** Taux de réussite : mains gagnées / mains jouées (0 à 1). */
  winRate: number;
  /** Prochaine recharge gratuite si le solde est trop bas, sinon null. */
  refillAt: number | null;
}

export interface BjChallenge {
  id: string;
  label: string;
  goal: number;
  progress: number;
  done: boolean;
  rewardChips: number;
  rewardXp: number;
}
export interface BjAchievement {
  id: string;
  label: string;
  description: string;
  rewardChips: number;
  unlockedAt: number | null;
}

export interface BjActive {
  table: string;
  rules: TableRules;
  bet: number;
  round: BjRoundView;
  legal: BjAction[];
  /** Hash publié AVANT la manche ; la graine correspondante est révélée à la fin. */
  commitment: string;
  startedAt: number;
  /** Jetons encore libres (hors mises engagées sur la manche). */
  freeChips: number;
}

export interface BjHistoryItem {
  id: number;
  endedAt: number;
  table: string;
  decks: number;
  bet: number;
  net: number;
  wagered: number;
  dealer: string[];
  hands: { cards: string[]; bet: number; result: HandResult | null; net: number }[];
  /** Équité : graine révélée et engagement publié avant la manche. */
  seed: string;
  commitment: string;
}

export interface BjResult {
  net: number;
  xpGained: number;
  level: { from: number; to: number; reward: number } | null;
  challengesDone: BjChallenge[];
  achievements: BjAchievement[];
  seed: string;
  commitment: string;
}

export interface BjOverview {
  profile: BjProfile;
  tables: TablePreset[];
  challenges: BjChallenge[];
  achievements: BjAchievement[];
  active: BjActive | null;
  history: BjHistoryItem[];
}

export interface BjLeaderboardEntry {
  rank: number;
  nickname: string;
  avatar: string | null;
  level: number;
  title: string;
  xp: number;
  chips: number;
  rounds: number;
  winRate: number;
}
export type BjLeaderboardKind = 'xp' | 'chips';
