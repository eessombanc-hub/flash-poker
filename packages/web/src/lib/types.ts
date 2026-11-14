// Types partagés avec le serveur : « import type » uniquement, effacés à la compilation.
// Le navigateur n'embarque donc aucun code du moteur ni du serveur (le serveur reste seul source de vérité).
export type { RoomView, SocialMessage, ThrowItem, UpdateMessage, PlayerPublic, RoomStatus, ClientCommand } from '@poker/server/src/protocol';
export type {
  GameView,
  RoundView,
  RoundEvent,
  RoundRecord,
  GameOutcome,
  VariantId,
  Insurance,
  InsuranceType,
  PendingInsurance,
  LineResult,
  LineDesignation,
  SideBet,
  SideBetPool,
  SideBetResult,
  RevealStep,
  NextReason,
  RevealStep10,
  NextReason10,
  TiebreakOutcome,
  TiebreakRound,
  RoundAward,
  OwnHandView,
  OpponentHandView,
  CardEngineView,
} from '@poker/engine';

export type PlayerId = string;
export type {
  AccountPrivate,
  AccountPublic,
  Bankroll,
  FavoritePlayer,
  FavoriteRound,
  FinishedGame,
  GameDetail,
  GameSummary,
  DailyChallenge,
  Engagement,
  InviteOverview,
  LeaderboardRow,
  RankGame,
  RankPeriod,
  RankRow,
  Ranking,
  SentInvite,
  Trophy,
  AchievementStatus,
  AchievementTier,
  LeagueId,
  LeagueStatus,
  ProgressionReply,
  XpRankRow,
  XpRanking,
  ClubRanking,
  ClubRankRow,
  Season,
  SeasonResult,
  Career,
  Equipped,
  Need,
  RewardKind,
  RewardStatus,
  RewardsReply,
  VariantStats,
  Wallet,
} from '@poker/server/src/accounts/types';

// Blackjack : mêmes types que le serveur (module indépendant du poker).
export type { BjProfile, BjChallenge, BjAchievement, BjActive, BjHistoryItem, BjResult, BjOverview, BjLeaderboardEntry, BjLeaderboardKind } from '@poker/server/src/blackjack/types';
export type { BjAction, HandResult, TablePreset, TableRules, Advice, Odds, BjRoundView, PlayerHand } from '@poker/engine';
export type { BjTableDto, BjTableReply, BjSeatDto, SeatKind, TableStatus } from '@poker/server/src/blackjack/types';
export type { TableRoundView } from '@poker/engine';

// Le Tableau : types du serveur (le navigateur n'embarque aucune règle ; il affiche ce que le serveur décide).
export type { TbGameDto, TbHistoryEntry, TbMode, TbQueueDto, TbStatus, TbPlayerDto } from '@poker/server/src/tableau/service';
export type { TbProfileDto, TbLeaderboardRow, TbRatingChange } from '@poker/server/src/tableau/stats';
export type { TableauView, TableauResult, ColumnHand, ColumnVerdict, AiLevel, TableauVariant, Placement as TableauPlacement, Seat as TableauSeat } from '@poker/engine';

export type FeedbackKind = 'bug' | 'idea' | 'comment';
export interface FeedbackItem {
  id: string;
  createdAt: number;
  kind: FeedbackKind;
  message: string;
  contact: string | null;
  nickname: string | null;
  context: string;
  status: 'open' | 'done';
}

export type StaffRole = 'moderator' | 'admin';
export interface StaffMe { role: StaffRole; name: string; root: boolean }
export interface StaffUser {
  id: string;
  nickname: string;
  role: 'user' | 'moderator' | 'admin';
  createdAt: number;
  club: string | null;
  muteLeft: number;
  banned: boolean;
  email?: string;
}
export interface StaffChatMessage { id: number; at: number; nickname: string; registered: boolean; text: string; authorId: string | null }
export interface StaffLogItem { id: number; at: number; actor: string; action: string; target: string; detail: string }
export interface StaffStats { accounts: number; newThisWeek: number; staff: number; mutes: number; bans: number; feedbackOpen: number }
