import { cardValue, handValue, isNaturalBlackjack } from './hand';
import { applyToHands, BjError, drawCard, legalActions, settleHands, type BjAction, type BjRound, type PlayerHand } from './round';
import type { TableRules } from './rules';
import { shoeFromSeed } from './shoe';

/**
 * Table de Blackjack à plusieurs (1 à 6 places) face à un seul croupier et un sabot commun. Chaque place joue à son
 * tour, dans l'ordre ; le croupier joue une fois, quand toutes les places ont fini. Les règles d'une place sont
 * exactement celles de la manche solo (`round.ts`) : seule l'orchestration est nouvelle.
 */
export const MAX_SEATS = 6;

export interface SeatState {
  bet: number;
  hands: PlayerHand[];
  active: number;
  wagered: number;
  actions: BjAction[];
  net: number;
}

export interface TableRound {
  rules: TableRules;
  shoe: string[];
  pos: number;
  seats: SeatState[];
  /** Place dont c'est le tour, ou -1 quand plus personne n'a à jouer. */
  turn: number;
  dealer: string[];
  dealerBlackjack: boolean;
  phase: 'PLAYER' | 'DONE';
  /** Journal des actions dans l'ordre : suffit, avec la graine, à rejouer la manche. */
  log: { seat: number; action: BjAction }[];
}

const seatDone = (s: SeatState): boolean => s.active >= s.hands.length;

/** Place vue comme une manche solo (mains et croupier partagés par référence) : sert à réutiliser les règles. */
function asRound(t: TableRound, i: number): BjRound {
  const s = t.seats[i]!;
  return { rules: t.rules, bet: s.bet, shoe: t.shoe, pos: t.pos, hands: s.hands, active: s.active, dealer: t.dealer, phase: t.phase, dealerBlackjack: t.dealerBlackjack, actions: s.actions, net: s.net, wagered: s.wagered };
}
const syncBack = (t: TableRound, i: number, r: BjRound): void => {
  const s = t.seats[i]!;
  s.active = r.active;
  s.wagered = r.wagered;
  s.net = r.net;
  t.pos = r.pos;
};

export function startTable(rules: TableRules, bets: readonly number[], seed: string): TableRound {
  return startTableFromShoe(rules, bets, shoeFromSeed(seed, rules.decks));
}

/** Ouvre une table sur un sabot donné (ordre de tirage connu) : `startTable` et les tests de scénarios. */
export function startTableFromShoe(rules: TableRules, bets: readonly number[], shoe: string[]): TableRound {
  if (bets.length < 1 || bets.length > MAX_SEATS) throw new BjError('BAD_TABLE', 'Une table réunit de 1 à 6 places');
  for (const b of bets) if (!Number.isInteger(b) || b < 1) throw new BjError('BAD_BET', 'La mise doit être un entier positif');
  const t: TableRound = {
    rules,
    shoe: [...shoe],
    pos: 0,
    seats: bets.map((bet) => ({ bet, hands: [{ cards: [], bet, doubled: false, fromSplit: false, splitAces: false, done: false, surrendered: false, result: null, net: 0 }], active: 0, wagered: bet, actions: [], net: 0 })),
    turn: -1,
    dealer: [],
    dealerBlackjack: false,
    phase: 'PLAYER',
    log: [],
  };
  // Distribution classique : une carte à chaque place, une au croupier (visible), une seconde à chaque place, une au croupier (cachée).
  for (const s of t.seats) s.hands[0]!.cards.push(drawCard(t));
  t.dealer.push(drawCard(t));
  for (const s of t.seats) s.hands[0]!.cards.push(drawCard(t));
  t.dealer.push(drawCard(t));
  const up = cardValue(t.dealer[0]!);
  t.dealerBlackjack = (up === 10 || up === 11) && isNaturalBlackjack(t.dealer);
  for (const s of t.seats) if (t.dealerBlackjack || isNaturalBlackjack(s.hands[0]!.cards)) s.hands[0]!.done = true;
  for (const s of t.seats) while (s.active < s.hands.length && s.hands[s.active]!.done) s.active++;
  nextTurn(t, -1);
  return t;
}

function nextTurn(t: TableRound, from: number): void {
  t.turn = -1;
  for (let i = from + 1; i < t.seats.length; i++) {
    if (!seatDone(t.seats[i]!)) {
      t.turn = i;
      return;
    }
  }
  finishDealer(t);
}

function finishDealer(t: TableRound): void {
  const allLost = t.seats.every((s) => s.hands.every((h) => h.surrendered || handValue(h.cards).bust));
  if (!allLost) {
    for (;;) {
      const v = handValue(t.dealer);
      if (v.total > 17 || (v.total === 17 && !(v.soft && t.rules.dealerHitsSoft17))) break;
      t.dealer.push(drawCard(t));
    }
  }
  t.phase = 'DONE';
  for (let i = 0; i < t.seats.length; i++) {
    const r = asRound(t, i);
    r.phase = 'PLAYER';
    settleHands(r);
    syncBack(t, i, r);
    t.seats[i]!.net = r.net;
  }
}

/** Actions permises à une place : vide si ce n'est pas son tour. `chips` : jetons libres de la place (avant mises engagées). */
export function tableLegal(t: TableRound, seat: number, chips = Number.POSITIVE_INFINITY): BjAction[] {
  if (t.phase !== 'PLAYER' || t.turn !== seat) return [];
  const r = asRound(t, seat);
  return legalActions(r, chips - t.seats[seat]!.wagered);
}

export function tableApply(prev: TableRound, seat: number, action: BjAction, chips = Number.POSITIVE_INFINITY): TableRound {
  if (prev.phase !== 'PLAYER') throw new BjError('ROUND_OVER', 'La manche est terminée');
  if (prev.turn !== seat) throw new BjError('NOT_YOUR_TURN', 'Ce n’est pas le tour de cette place');
  if (!tableLegal(prev, seat, chips).includes(action)) throw new BjError('ILLEGAL_ACTION', `Action impossible. ${action}`);
  const t = structuredClone(prev);
  const r = asRound(t, seat);
  applyToHands(r, action);
  syncBack(t, seat, r);
  t.log.push({ seat, action });
  if (seatDone(t.seats[seat]!)) nextTurn(t, seat);
  return t;
}

/** Vue de la place `seat` comme une manche solo terminée ou en cours : statistiques, stratégie des CPU. */
export function seatRound(t: TableRound, seat: number): BjRound {
  const r = asRound(t, seat);
  return structuredClone({ ...r, phase: t.phase === 'DONE' ? 'DONE' : 'PLAYER' });
}

export function replayTable(rules: TableRules, bets: readonly number[], seed: string, log: readonly { seat: number; action: BjAction }[]): TableRound {
  let t = startTable(rules, bets, seed);
  for (const e of log) t = tableApply(t, e.seat, e.action);
  return t;
}

export interface TableRoundView {
  rules: TableRules;
  seats: { bet: number; hands: PlayerHand[]; active: number; net: number; wagered: number }[];
  turn: number;
  dealer: (string | null)[];
  phase: 'PLAYER' | 'DONE';
  dealerBlackjack: boolean;
}

/** Vue publique : la seconde carte du croupier reste cachée tant que la manche n'est pas terminée. */
export function tableView(t: TableRound): TableRoundView {
  const done = t.phase === 'DONE';
  return {
    rules: t.rules,
    seats: t.seats.map((s) => ({ bet: s.bet, hands: structuredClone(s.hands), active: s.active, net: done ? s.net : 0, wagered: s.wagered })),
    turn: t.turn,
    dealer: done ? [...t.dealer] : [t.dealer[0]!, null],
    phase: t.phase,
    dealerBlackjack: done ? t.dealerBlackjack : false,
  };
}
