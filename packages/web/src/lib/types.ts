// Types partagés avec le serveur : « import type » uniquement, effacés à la compilation.
// Le navigateur n'embarque donc aucun code du moteur ni du serveur (le serveur reste seul source de vérité).
export type { RoomView, UpdateMessage, PlayerPublic, RoomStatus, ClientCommand } from '@poker/server/src/protocol';
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
  SentInvite,
  Trophy,
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
