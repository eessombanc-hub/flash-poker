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
  InviteOverview,
  SentInvite,
  VariantStats,
  Wallet,
} from '@poker/server/src/accounts/types';

// Blackjack : mêmes types que le serveur (module indépendant du poker).
export type { BjProfile, BjChallenge, BjAchievement, BjActive, BjHistoryItem, BjResult, BjOverview, BjLeaderboardEntry, BjLeaderboardKind } from '@poker/server/src/blackjack/types';
export type { BjAction, HandResult, TablePreset, TableRules, Advice, Odds, BjRoundView, PlayerHand } from '@poker/engine';
export type { BjTableDto, BjTableReply, BjSeatDto, SeatKind, TableStatus } from '@poker/server/src/blackjack/types';
export type { TableRoundView } from '@poker/engine';
