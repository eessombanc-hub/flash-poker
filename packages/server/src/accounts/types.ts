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
  stakeChips: number;
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
  netChips: number;
  rounds: number;
  opponents: string[];
  winnerNickname: string;
}
export type MasteryLevel = 'beginner' | 'initiate' | 'confirmed' | 'expert' | 'master';
/** Seuils d'un niveau : manches jouées et rendement minimal (victoires obtenues / victoires attendues). */
export interface MasteryStep {
  level: MasteryLevel;
  rounds: number;
  skill: number;
}
export interface VariantProgress {
  level: MasteryLevel;
  /** Victoires attendues si le hasard seul décidait (somme de 1/joueurs par manche). */
  expectedWins: number;
  /** Victoires obtenues / attendues ; null tant qu'aucune manche n'est jouée. 1,00 = niveau du hasard. */
  skill: number | null;
  /** Manches gagnées d'affilée en ce moment, et record. */
  streak: number;
  bestStreak: number;
  /** Dix dernières manches, la plus récente en dernier (W = gagnée, N = non gagnée). */
  recent: ('W' | 'N')[];
  /** Palier suivant (null au niveau maximal) et avancement vers lui, de 0 à 1. */
  next: MasteryStep | null;
  progress: number;
}
export interface VariantStats extends VariantProgress {
  variant: VariantId;
  played: number;
  won: number;
  points: number;
}
export interface Bankroll {
  totalChips: number;
  games: number;
  series: { endedAt: number; netChips: number; cumulativeChips: number; name: string }[];
}
/**
 * Portefeuille de jetons d'un compte : solde de départ + gains/pertes des parties + recharges.
 * Sous le seuil, une recharge unique remonte le solde au plafond de recharge après le délai d'attente.
 */
export interface Wallet {
  balance: number;
  startingChips: number;
  /** Sous ce solde, la recharge est programmée (c'est aussi la mise maximale d'une partie). */
  threshold: number;
  refillTo: number;
  refillDelayMs: number;
  /** Horodatage de la prochaine recharge ; null si le solde est suffisant. */
  nextRefillAt: number | null;
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

/** Invitation envoyée par e-mail, et son état. */
export interface SentInvite {
  email: string;
  sentAt: number;
  /** Pseudo choisi par l'invité s'il a créé son compte, sinon null (en attente). */
  joinedAs: string | null;
}
export interface InviteOverview {
  /** Lien personnel à partager (SMS, messagerie…) ; chemin relatif à l'adresse du jeu. */
  code: string;
  /** Invitations par e-mail, des plus récentes aux plus anciennes. */
  sent: SentInvite[];
  /** Joueurs inscrits grâce à vos invitations (lien ou e-mail). */
  joined: AccountPublic[];
  /** Invitations par e-mail encore possibles aujourd'hui. */
  remainingToday: number;
  mailEnabled: boolean;
}


export type { DailyChallenge, Engagement, Trophy } from './engagement';

/** Ligne du classement hebdomadaire entre favoris : parties gagnées sur les sept derniers jours. */
export interface LeaderboardRow extends AccountPublic {
  wins: number;
  games: number;
  you: boolean;
}
