import type { CardEngineSnapshot, CardEngineView, PlayerId } from '../core/cardEngine';
import type { Rng } from '../core/rng';

export type VariantId = 'CLOSED_1' | 'CLOSED_2' | 'AVIATION' | 'AVIA_6' | 'V6_3' | 'V6_1' | 'MORPION' | 'LE10';
export const VARIANT_IDS: readonly VariantId[] = ['V6_3', 'V6_1', 'CLOSED_1', 'CLOSED_2', 'AVIATION', 'AVIA_6', 'MORPION', 'LE10'];

export const VARIANT_LABELS: Record<VariantId, string> = {
  V6_3: '6-3',
  V6_1: '6-1',
  CLOSED_1: 'Poker fermé — 1 change',
  CLOSED_2: 'Poker fermé — 2 changes',
  AVIATION: 'Aviation',
  AVIA_6: 'Avia 6',
  MORPION: 'Morpion',
  LE10: 'Le 10',
};

/** Fermé 2 changes et Le 10 ne sont jouables que de 2 à 5 joueurs (grisés à 6). */
export function isVariantAvailable(variant: VariantId, tableSize: number): boolean {
  if (!Number.isInteger(tableSize) || tableSize < 2 || tableSize > 6) return false;
  return variant === 'CLOSED_2' || variant === 'LE10' ? tableSize <= 5 : true;
}

export type RuleErrorCode =
  | 'BAD_COMMAND'
  | 'BAD_CARD'
  | 'UNKNOWN_PLAYER'
  | 'NOT_AWAITED'
  | 'NOT_YOUR_TURN'
  | 'TOO_MANY_CARDS'
  | 'DUPLICATE_CARD'
  | 'CARD_NOT_IN_HAND'
  | 'INCOMPLETE_SELECTION'
  | 'ALREADY_VALIDATED'
  | 'ROUND_OVER'
  | 'VARIANT_UNAVAILABLE'
  | 'BAD_TABLE_SIZE'
  | 'BAD_CONFIG'
  | 'WRONG_PHASE'
  | 'GAME_OVER'
  | 'BAD_INSURANCE'
  | 'INSURANCE_NOT_ELIGIBLE'
  | 'INSURANCE_ALREADY_INSURED'
  | 'INSURANCE_PENDING'
  | 'INSURANCE_LIMIT'
  | 'INSURANCE_PAIR_DECLINED'
  | 'NO_PENDING_INSURANCE'
  | 'EXCLUDED'
  | 'PLAYER_EXISTS'
  | 'TABLE_FULL';

/** Commande refusée par les règles : l'état n'est jamais modifié. */
export class RuleError extends Error {
  constructor(
    readonly code: RuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuleError';
  }
}

/**
 * Résultat d'une manche. Les points hors 6-3 valent 1 ; le Hold'em de départage
 * (`TIE`) est joué ensuite par `resolveRoundResult`.
 */
export type RoundResult =
  | { kind: 'WINNER'; winner: PlayerId; points: number; detail?: Record<string, unknown> }
  | { kind: 'TIE'; tied: PlayerId[] }
  | { kind: 'NO_WINNER'; reason: string }
  | { kind: 'INSTANT_VICTORY'; winner: PlayerId; line: 1 | 2 | 3 };

export type RoundCommand =
  /** Brouillon de sélection (cartes à jeter / à changer / paire désignée / paire du Morpion). Modifiable jusqu'à validation.
   * `line` (Morpion uniquement) : index 0-7 de l'alignement choisi parmi les 9 cartes communes (3 lignes, 3 colonnes,
   * 2 diagonales) ; `null` efface le choix, `undefined` le laisse inchangé. */
  | { type: 'SELECT'; player: PlayerId; cards: string[]; line?: number | null }
  /** Verrouille la sélection et permet de clore la phase plus tôt. */
  | { type: 'VALIDATE'; player: PlayerId }
  /** Échéance du minuteur de 60 s, décidée par le serveur (l'engine n'a pas d'horloge). */
  | { type: 'TIMEOUT' }
  /** 6-1 et Le 10 : le joueur désigné retourne sa prochaine carte. */
  | { type: 'REVEAL'; player: PlayerId };

export interface RoundEvent {
  type: string;
  /** PLAYER : à envoyer au seul `audience`. PUBLIC : à tous. */
  visibility: 'PUBLIC' | 'PLAYER';
  audience?: PlayerId;
  data: Record<string, unknown>;
}

export interface RoundView {
  variant: VariantId;
  phase: string;
  awaiting: PlayerId[];
  cards: CardEngineView;
  info: Record<string, unknown>;
  result: RoundResult | null;
}

export interface RoundSnapshot {
  variant: VariantId;
  players: PlayerId[];
  cards: CardEngineSnapshot;
  state: unknown;
  outcome: RoundResult | null;
}

export interface RoundContext {
  /** Joueurs dans l'ordre des positions : UTG en premier. */
  players: readonly PlayerId[];
  rng: Rng;
  /** TESTS UNIQUEMENT : premières cartes tirées (codes "As", "Td"…). */
  stackedDeck?: readonly string[];
  /** Partie « avec assistance » (réglage fixé pour toute la partie) : un simple indicateur du nom de la
   * combinaison déjà formée est exposé au joueur, jamais de suggestion. Faux par défaut. */
  assistance?: boolean;
}

export interface Round {
  readonly variant: VariantId;
  readonly players: readonly PlayerId[];
  phase(): string;
  /** Identifie CHAQUE phase à minuteur (change, défausse, ligne, retournement) : le serveur relance 60 s quand elle change. */
  phaseKey(): string;
  /** Joueurs dont une action est attendue maintenant. */
  awaiting(): PlayerId[];
  /** Joueurs à avertir à 10 s de l'échéance (message neutre, sans aide). */
  warnings(): PlayerId[];
  apply(cmd: RoundCommand): RoundEvent[];
  result(): RoundResult | null;
  view(viewer: PlayerId | null): RoundView;
  snapshot(): RoundSnapshot;
  checkInvariants(): void;
}
