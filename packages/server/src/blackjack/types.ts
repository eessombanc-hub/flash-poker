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

// ---------- Tables à plusieurs (1 à 6 places, humains et CPU) ----------
export type SeatKind = 'human' | 'cpu';
export type TableStatus = 'LOBBY' | 'BETTING' | 'PLAYING' | 'DONE';

export interface BjSeatDto {
  idx: number;
  kind: SeatKind;
  /** Place humaine encore libre (en attente d'un joueur). */
  open: boolean;
  nickname: string;
  avatar: string | null;
  /** Titre, cadre et emblème équipés, absents quand le joueur ne porte rien. */
  cosmetics: import('../accounts/cosmetics').Equipped | null;
  /** Solde affiché (jetons virtuels). */
  chips: number;
  ready: boolean;
  /** Mise de la prochaine manche (ou de la manche en cours). */
  bet: number;
  /** Ne participe pas à la manche en cours (arrivé en cours de route, solde trop bas, parti). */
  sittingOut: boolean;
  you: boolean;
}

export interface BjTableDto {
  code: string;
  version: number;
  status: TableStatus;
  tableId: string;
  tableName: string;
  rules: import('@poker/engine').TableRules;
  limits: { minBet: number; maxBet: number };
  seats: BjSeatDto[];
  hostSeat: number;
  /** Ma place, ou null (spectateur). */
  me: number | null;
  roundNo: number;
  round: null | {
    view: import('@poker/engine').TableRoundView;
    /** Place de la table (idx) de chaque joueur de la manche, dans l'ordre de `view.seats`. */
    participants: number[];
    /** Place dont c'est le tour, ou -1. */
    turnSeat: number;
    deadlineAt: number | null;
    legal: BjAction[];
    commitment: string;
    /** Graine révélée une fois la manche terminée. */
    seed: string | null;
  };
  /** Mon bilan de la manche terminée (jetons, XP, niveau, défis). */
  result: BjResult | null;
  /** Échéance de la phase de mise ou de l'enchaînement automatique, le cas échéant. */
  phaseDeadlineAt: number | null;
  now: number;
}

export type BjTableReply = BjTableDto | { unchanged: true; version: number };
