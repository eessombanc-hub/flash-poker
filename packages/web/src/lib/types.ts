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
} from '@poker/server/src/accounts/types';
