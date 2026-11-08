import { cardValue, handValue, isNaturalBlackjack } from './hand';
import type { TableRules } from './rules';
import { shoeFromSeed } from './shoe';

export type BjAction = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'SURRENDER';
export const BJ_ACTIONS: readonly BjAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER'];
export type HandResult = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST' | 'SURRENDER';

export class BjError extends Error {
  constructor(
    readonly code: 'ILLEGAL_ACTION' | 'ROUND_OVER' | 'BAD_BET' | 'INSUFFICIENT_CHIPS' | 'BAD_TABLE' | 'NOT_YOUR_TURN',
    message: string,
  ) {
    super(message);
  }
}

export interface PlayerHand {
  cards: string[];
  /** Mise engagée sur cette main (doublée après un Double). */
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  /** Main issue d'une séparation d'As : une seule carte, pas de tirage. */
  splitAces: boolean;
  done: boolean;
  surrendered: boolean;
  result: HandResult | null;
  /** Gain net de la main (négatif = perte), connu à la fin de la manche. */
  net: number;
}

/** État complet d'une manche (contient le sabot : ne JAMAIS l'envoyer tel quel au joueur, voir `roundView`). */
export interface BjRound {
  rules: TableRules;
  bet: number;
  shoe: string[];
  pos: number;
  hands: PlayerHand[];
  active: number;
  dealer: string[];
  phase: 'PLAYER' | 'DONE';
  /** Le croupier avait un Blackjack (vérifié quand sa carte visible est un As ou un 10). */
  dealerBlackjack: boolean;
  actions: BjAction[];
  net: number;
  /** Total misé sur la manche (mises initiales, doublements et séparations compris). */
  wagered: number;
}

export function drawCard(r: { shoe: string[]; pos: number }): string {
  const c = r.shoe[r.pos++];
  if (c === undefined) throw new Error('Sabot épuisé'); // impossible : un jeu suffit largement pour une manche
  return c;
}

const newHand = (bet: number, over: Partial<PlayerHand> = {}): PlayerHand => ({ cards: [], bet, doubled: false, fromSplit: false, splitAces: false, done: false, surrendered: false, result: null, net: 0, ...over });

/** Ouvre une manche : joueur, croupier (carte visible), joueur, croupier (carte cachée). Résout les Blackjacks naturels. */
export function startRound(rules: TableRules, bet: number, seed: string): BjRound {
  return startFromShoe(rules, bet, shoeFromSeed(seed, rules.decks));
}

/** Ouvre une manche sur un sabot donné (ordre de tirage connu) : utilisé par `startRound` et par les tests de scénarios. */
export function startFromShoe(rules: TableRules, bet: number, shoe: string[]): BjRound {
  if (!Number.isInteger(bet) || bet < 1) throw new BjError('BAD_BET', 'La mise doit être un entier positif');
  const r: BjRound = { rules, bet, shoe: [...shoe], pos: 0, hands: [newHand(bet)], active: 0, dealer: [], phase: 'PLAYER', dealerBlackjack: false, actions: [], net: 0, wagered: bet };
  const h = r.hands[0]!;
  h.cards.push(drawCard(r));
  r.dealer.push(drawCard(r));
  h.cards.push(drawCard(r));
  r.dealer.push(drawCard(r));
  const up = cardValue(r.dealer[0]!);
  r.dealerBlackjack = (up === 10 || up === 11) && isNaturalBlackjack(r.dealer);
  if (r.dealerBlackjack || isNaturalBlackjack(h.cards)) {
    h.done = true;
    settleHands(r);
  }
  return r;
}

/** Mise supplémentaire qu'exigent Double et Séparer sur la main active. */
export function extraStake(r: BjRound): number {
  return r.phase === 'PLAYER' ? r.hands[r.active]!.bet : 0;
}

/** Actions autorisées. `chips` : jetons encore disponibles (hors mises déjà engagées) ; infini par défaut. */
export function legalActions(r: BjRound, chips = Number.POSITIVE_INFINITY): BjAction[] {
  if (r.phase !== 'PLAYER') return [];
  const h = r.hands[r.active]!;
  if (h.done) return [];
  const out: BjAction[] = ['HIT', 'STAND'];
  const two = h.cards.length === 2;
  const v = handValue(h.cards);
  const canPay = chips >= h.bet;
  if (h.splitAces) return ['STAND'];
  if (two && canPay && (!h.fromSplit || r.rules.doubleAfterSplit)) {
    const ok = r.rules.doubleOn === 'any' || (!v.soft && (r.rules.doubleOn === '9-11' ? v.total >= 9 && v.total <= 11 : v.total >= 10 && v.total <= 11));
    if (ok) out.push('DOUBLE');
  }
  if (two && canPay && r.hands.length < r.rules.maxHands && cardValue(h.cards[0]!) === cardValue(h.cards[1]!)) {
    const aces = h.cards[0]![0] === 'A';
    if (!(aces && h.fromSplit && !r.rules.resplitAces)) out.push('SPLIT');
  }
  if (r.rules.surrender && two && r.hands.length === 1 && !h.fromSplit && r.actions.length === 0) out.push('SURRENDER');
  return out;
}

function advance(r: BjRound): void {
  while (r.active < r.hands.length && r.hands[r.active]!.done) r.active++;
  if (r.active >= r.hands.length) {
    r.active = Math.max(0, r.hands.length - 1);
    dealerPlay(r);
    settleHands(r);
  }
}

function dealerPlay(r: BjRound): void {
  // Inutile de tirer si toutes les mains sont perdues d'avance (dépassement ou abandon).
  if (r.hands.every((h) => h.surrendered || handValue(h.cards).bust)) return;
  for (;;) {
    const v = handValue(r.dealer);
    if (v.total > 17 || (v.total === 17 && !(v.soft && r.rules.dealerHitsSoft17))) return;
    r.dealer.push(drawCard(r));
  }
}

/** Règle les mains d'un joueur contre le croupier (`r.dealer` et `r.dealerBlackjack` doivent être définitifs). */
export function settleHands(r: BjRound): void {
  const dv = handValue(r.dealer);
  r.net = 0;
  for (const h of r.hands) {
    const pv = handValue(h.cards);
    const natural = r.hands.length === 1 && !h.fromSplit && isNaturalBlackjack(h.cards);
    if (h.surrendered) [h.result, h.net] = ['SURRENDER', -Math.ceil(h.bet / 2)];
    else if (pv.bust) [h.result, h.net] = ['BUST', -h.bet];
    else if (natural && r.dealerBlackjack) [h.result, h.net] = ['PUSH', 0];
    else if (natural) [h.result, h.net] = ['BLACKJACK', Math.floor(h.bet * (r.rules.blackjackPays === '3:2' ? 1.5 : 1.2))];
    else if (r.dealerBlackjack) [h.result, h.net] = ['LOSE', -h.bet];
    else if (dv.bust || pv.total > dv.total) [h.result, h.net] = ['WIN', h.bet];
    else if (pv.total === dv.total) [h.result, h.net] = ['PUSH', 0];
    else [h.result, h.net] = ['LOSE', -h.bet];
    r.net += h.net;
  }
  r.phase = 'DONE';
}

/**
 * Applique une action à la main active (modifie `r`), sans jamais faire jouer le croupier. Partagé par la manche
 * solo (`applyAction`) et la table à plusieurs (`table.ts`), pour que les règles ne soient écrites qu'une fois.
 */
export function applyToHands(r: BjRound, action: BjAction): void {
  const h = r.hands[r.active]!;
  switch (action) {
    case 'HIT': {
      h.cards.push(drawCard(r));
      const v = handValue(h.cards);
      if (v.total >= 21) h.done = true;
      break;
    }
    case 'STAND':
      h.done = true;
      break;
    case 'DOUBLE':
      r.wagered += h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(drawCard(r));
      h.done = true;
      break;
    case 'SURRENDER':
      h.surrendered = true;
      h.done = true;
      break;
    case 'SPLIT': {
      const aces = h.cards[0]![0] === 'A';
      const second = newHand(h.bet, { cards: [h.cards[1]!], fromSplit: true, splitAces: aces });
      h.cards = [h.cards[0]!];
      h.fromSplit = true;
      h.splitAces = aces;
      r.hands.splice(r.active + 1, 0, second);
      r.wagered += h.bet;
      h.cards.push(drawCard(r));
      second.cards.push(drawCard(r));
      for (const x of [h, second]) if (x.splitAces || handValue(x.cards).total === 21) x.done = true;
      break;
    }
  }
  r.actions.push(action);
  while (r.active < r.hands.length && r.hands[r.active]!.done) r.active++;
}

/** Applique une action sur la main active et renvoie la nouvelle manche (l'originale n'est pas modifiée). */
export function applyAction(prev: BjRound, action: BjAction, chips = Number.POSITIVE_INFINITY): BjRound {
  if (prev.phase !== 'PLAYER') throw new BjError('ROUND_OVER', 'La manche est terminée');
  if (!legalActions(prev, chips).includes(action)) throw new BjError('ILLEGAL_ACTION', `Action impossible : ${action}`);
  const r = structuredClone(prev);
  applyToHands(r, action);
  advance(r);
  return r;
}

/** Rejoue une manche depuis sa graine : base de la reprise, de la vérification d'équité et du contrôle serveur. */
export function replayRound(rules: TableRules, bet: number, seed: string, actions: readonly BjAction[], chips = Number.POSITIVE_INFINITY): BjRound {
  let r = startRound(rules, bet, seed);
  let free = chips - bet;
  for (const a of actions) {
    const before = r.wagered;
    r = applyAction(r, a, free);
    free -= r.wagered - before;
  }
  return r;
}

/** Carte du croupier masquée tant que la manche n'est pas terminée. */
export interface BjRoundView {
  rules: TableRules;
  bet: number;
  hands: PlayerHand[];
  active: number;
  dealer: (string | null)[];
  phase: 'PLAYER' | 'DONE';
  dealerBlackjack: boolean;
  net: number;
  wagered: number;
}

export function roundView(r: BjRound): BjRoundView {
  const done = r.phase === 'DONE';
  return {
    rules: r.rules,
    bet: r.bet,
    hands: structuredClone(r.hands),
    active: r.active,
    dealer: done ? [...r.dealer] : [r.dealer[0]!, null],
    phase: r.phase,
    dealerBlackjack: done ? r.dealerBlackjack : false,
    net: done ? r.net : 0,
    wagered: r.wagered,
  };
}
