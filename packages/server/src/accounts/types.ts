// Types des comptes, partagés avec l'interface web (import de types uniquement, aucun code serveur embarqué).
import type { GameOutcome, RoundRecord, VariantId } from '@poker/engine';

export interface AccountPublic {
  id: string;
  nickname: string;
  avatar: string | null;
}
export interface AccountPrivate extends AccountPublic {
  email: string;
  notifyEmail: boolean;
  createdAt: number;
}

/** Partie terminée, telle qu'archivée : uniquement des informations devenues publiques à la fin. */
export interface FinishedGame {
  code: string;
  name: string;
  endedAt: number;
  stakeCents: number;
  targetPoints: number;
  /** Tous les joueurs de la salle (assis ou non) ; `accountId` nul pour un invité. */
  players: { playerId: string; accountId: string | null; nickname: string; avatar: string | null }[];
  /** Joueurs assis à la table en fin de partie (ceux qui ont versé leur mise). */
  seated: string[];
  outcome: GameOutcome;
  history: RoundRecord[];
}
export interface GameSummary {
  id: string;
  name: string;
  endedAt: number;
  won: boolean;
  netCents: number;
  rounds: number;
  opponents: string[];
  winnerNickname: string;
}
export interface VariantStats {
  variant: VariantId;
  played: number;
  won: number;
  points: number;
}
export interface Bankroll {
  totalCents: number;
  games: number;
  series: { endedAt: number; netCents: number; cumulativeCents: number; name: string }[];
}
export interface FavoritePlayer extends AccountPublic {
  online: boolean;
}

export interface GameDetail extends FinishedGame {
  /** Identifiant du joueur consultant dans cette partie. */
  you: string;
  favoriteRounds: number[];
}
export interface FavoriteRound {
  gameId: string;
  gameName: string;
  endedAt: number;
  you: string;
  players: FinishedGame['players'];
  round: RoundRecord;
}
