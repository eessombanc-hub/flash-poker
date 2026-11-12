import type { LineResult, NextReason, NextReason10, RevealStep, RevealStep10, RoundRecord, RoundView, SideBet, SideBetPool, SideBetResult } from './types';

/** `RoundView.info` est un objet libre côté moteur : on le lit ici avec des valeurs par défaut sûres. */
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);

export interface ClosedInfo {
  change: number;
  totalChanges: number;
  validated: string[];
  yourDraft: string[];
}
export function closedInfo(round: RoundView): ClosedInfo {
  const i = round.info;
  return { change: num(i.change, 1), totalChanges: num(i.totalChanges, 1), validated: arr(i.validated), yourDraft: arr(i.yourDraft) };
}

export interface DiscardInfo {
  step: number;
  discardCount: number;
  status: Record<string, 'ACTIVE' | 'FOLDED'>;
  validated: string[];
  yourDraft: string[];
}
export function discardInfo(round: RoundView): DiscardInfo {
  const i = round.info;
  return {
    step: num(i.step, 1),
    discardCount: num(i.discardCount, 1),
    status: (i.status ?? {}) as DiscardInfo['status'],
    validated: arr(i.validated),
    yourDraft: arr(i.yourDraft),
  };
}

export interface Line63Info {
  line: number;
  validated: string[];
  yourDraft: string[];
  lines: LineResult[];
  unitsScale: number;
  /** Nombre de tétines (0 à 2) et leurs cartes, posées sur la ligne en cours. */
  teats: number;
  teatCards: string[];
  /** Paris extérieurs : option activée, phase en cours, vos paris en saisie, jetons disponibles, paris engagés et résolus. */
  sideBets: boolean;
  stage: 'BETS' | 'LINES';
  yourBets: SideBet[];
  budget: number;
  pools: SideBetPool[];
  sideResults: SideBetResult[];
}
export function line63Info(round: RoundView): Line63Info {
  const i = round.info;
  return {
    line: num(i.line, 1),
    validated: arr(i.validated),
    yourDraft: arr(i.yourDraft),
    lines: arr(i.lines),
    unitsScale: num(i.unitsScale, 60),
    teats: num(i.teats, 0),
    teatCards: arr(i.teatCards),
    sideBets: i.sideBets === true,
    stage: i.stage === 'BETS' ? 'BETS' : 'LINES',
    yourBets: arr(i.yourBets),
    budget: num(i.budget, 0),
    pools: arr(i.pools),
    sideResults: arr(i.sideResults),
  };
}

export interface Reveal61Info {
  next: string | null;
  reason: NextReason | null;
  reveals: number;
  history: RevealStep[];
}
export function reveal61Info(round: RoundView): Reveal61Info {
  const i = round.info;
  return {
    next: typeof i.next === 'string' ? i.next : null,
    reason: (i.reason as NextReason | null) ?? null,
    reveals: num(i.reveals, 0),
    history: arr(i.history),
  };
}

export interface MorpionDraft {
  cards: string[];
  line: number | null;
}
export interface MorpionInfo {
  validated: string[];
  yourDraft: MorpionDraft;
}
export function morpionInfo(round: RoundView): MorpionInfo {
  const i = round.info;
  const d = (i.yourDraft ?? {}) as Partial<MorpionDraft>;
  return { validated: arr(i.validated), yourDraft: { cards: arr(d.cards), line: typeof d.line === 'number' ? d.line : null } };
}

export interface Reveal10Info {
  next: string | null;
  reason: NextReason10 | null;
  reveals: number;
  history: RevealStep10[];
}
export function reveal10Info(round: RoundView): Reveal10Info {
  const i = round.info;
  return {
    next: typeof i.next === 'string' ? i.next : null,
    reason: (i.reason as NextReason10 | null) ?? null,
    reveals: num(i.reveals, 0),
    history: arr(i.history),
  };
}

/** Assistance : catégorie de la combinaison actuelle du joueur (0 = carte haute … 8 = quinte flush), ou null
 * quand l'assistance est inactive ou que la sélection est encore trop incomplète pour être évaluée. */
/** Assistance : codes des cartes (main, plateau, tétines) qui forment la combinaison actuelle ; vide sinon. */
export function assistCards(round: RoundView): string[] {
  const v = round.info.assistCards;
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [];
}
export function assistCategory(round: RoundView): number | null {
  const v = round.info.assistCategory;
  return typeof v === 'number' ? v : null;
}

/** Catégorie « quinte flush » dans le résumé d'une manche (HandCategory.StraightFlush du moteur). */
const STRAIGHT_FLUSH = 8;

/**
 * Une quinte flush a-t-elle été réalisée pendant cette manche ? Victoire instantanée du 6-3, main abattue
 * à l'abattage (toutes variantes) ou main de départage. Se lit sur l'historique de la manche : le son est donc
 * identique pour tous les joueurs de la table.
 */
export function hasStraightFlush(record: RoundRecord): boolean {
  if (record.award.kind === 'INSTANT_VICTORY') return true;
  const hands = record.summary?.hands;
  if (hands && Object.values(hands).some((h) => h.category === STRAIGHT_FLUSH)) return true;
  return record.summary?.tiebreak?.category === STRAIGHT_FLUSH;
}
