import { ALL_CARDS, parseCard, type Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import type { Rng } from '../core/rng';
import { categoryOf, evaluate5, forEachCombination, HandCategory, type HandRank } from '../evaluation/handEvaluator';
import { evaluateHoldem } from '../evaluation/holdemEvaluator';
import { evaluateOmahaWithPair, evaluateOmahaWithPairPool } from '../evaluation/omahaEvaluator';
import type { GameCommand, GameView } from '../game/gameManager';
import { MORPION_LINES } from '../variants/roundMorpion';
import type { RoundCommand, RoundView, VariantId } from '../variants/types';

/**
 * Joueur CPU du mode entraînement.
 *
 * Règle d'or : le CPU ne lit que `GameView`, exactement la vue que reçoit un joueur humain (jamais les cartes
 * cachées des adversaires, ni le paquet, ni les cartes non révélées du plateau). Il ne peut donc pas tricher,
 * et il ne joue que des coups que le moteur accepte, puisqu'il passe par les mêmes commandes qu'un client.
 *
 * Stratégie, variante par variante :
 * - 6-3 et Morpion : tout est visible au moment de désigner, le CPU évalue toutes les combinaisons permises
 *   et choisit la meilleure (calcul exact, aucun hasard).
 * - Poker fermé : estimation par tirages aléatoires des cartes de remplacement, pour chaque ensemble de 0 à 3
 *   cartes jetables ; le CPU retient celui dont la force moyenne est la plus élevée.
 * - Aviation et Avia 6 : même principe, avec les cartes communes encore inconnues tirées au hasard parmi celles
 *   qu'il ne voit pas ; il jette toujours le nombre exact de cartes demandé (sinon sa main serait couchée).
 * - 6-1 et Le 10 : il n'a qu'un geste possible (retourner sa carte quand c'est à lui).
 * - Variante à choisir : tirée au hasard parmi celles jouables à cette taille de table.
 * - Assurance : le CPU n'en propose jamais et refuse toujours celles qu'on lui propose.
 */

/** Plusieurs tirages suffisent : le calcul n'a pas besoin d'être précis, seulement d'ordonner correctement. */
const SAMPLES_CLOSED = 300;
const SAMPLES_DISCARD_FIRST = 100;
const SAMPLES_DISCARD_LAST = 200;

const CATEGORY_MULT = 15 ** 5;

/**
 * Répartition des mains finales d'un adversaire qui joue correctement le poker fermé : part cumulée des mains
 * plus faibles que le début de chaque catégorie. Mesurée par simulation (12 000 mains finales jouées par ce
 * CPU lui-même, un change, deux joueurs). Un adversaire qui change intelligemment finit beaucoup plus souvent
 * avec une paire ou mieux qu'une main tirée au hasard (une main sur deux n'a rien, au tirage brut) : se
 * comparer à cette répartition évite de surestimer une simple paire.
 */
const CATEGORY_FLOOR: Record<HandCategory, number> = {
  [HandCategory.HighCard]: 0,
  [HandCategory.Pair]: 0.2551,
  [HandCategory.TwoPair]: 0.7682,
  [HandCategory.ThreeOfAKind]: 0.9012,
  [HandCategory.Straight]: 0.9761,
  [HandCategory.Flush]: 0.9834,
  [HandCategory.FullHouse]: 0.9873,
  [HandCategory.FourOfAKind]: 0.9974,
  [HandCategory.StraightFlush]: 0.9997,
};
const CATEGORY_CEIL: Record<HandCategory, number> = {
  [HandCategory.HighCard]: 0.2551,
  [HandCategory.Pair]: 0.7682,
  [HandCategory.TwoPair]: 0.9012,
  [HandCategory.ThreeOfAKind]: 0.9761,
  [HandCategory.Straight]: 0.9834,
  [HandCategory.Flush]: 0.9873,
  [HandCategory.FullHouse]: 0.9974,
  [HandCategory.FourOfAKind]: 0.9997,
  [HandCategory.StraightFlush]: 1,
};

/** Place d'une main parmi les mains finales d'un adversaire correct (0 = plus faible que tout, 1 = plus forte que tout). */
export function handPercentile(rank: HandRank): number {
  const category = categoryOf(rank);
  const within = (rank % CATEGORY_MULT) / CATEGORY_MULT; // kickers, déjà ordonnés
  return CATEGORY_FLOOR[category] + (CATEGORY_CEIL[category] - CATEGORY_FLOOR[category]) * within;
}

/**
 * Valeur d'une main face à `opponents` adversaires : approximativement la chance de les battre tous, si chacun
 * avait une main de la répartition ci-dessus. Plus la table est remplie, plus il faut une main haute pour espérer gagner.
 */
function worth(rank: HandRank, opponents: number): number {
  return handPercentile(rank) ** Math.max(1, opponents);
}

// ---------- Aides ----------

function ownHand(round: RoundView, me: PlayerId): string[] {
  const hand = round.cards.hands[me];
  if (!hand || hand.kind !== 'own') return [];
  return hand.cards.map((c) => c.code).filter((c): c is string => c !== null);
}

/** Cartes que le joueur ne voit pas : tout le paquet moins sa main et le plateau déjà visible. */
function unseenPool(known: readonly string[]): Card[] {
  const set = new Set(known);
  return ALL_CARDS.filter((c) => !set.has(c.code));
}

/** Tire `k` cartes distinctes dans `pool` sans le modifier (mélange partiel, k petit). */
function draw(pool: readonly Card[], k: number, rng: Rng): Card[] {
  const copy = pool.slice();
  const out: Card[] = [];
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(copy.length - i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    out.push(copy[i]!);
  }
  return out;
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  forEachCombination(items, k, (c) => out.push(c.slice()));
  return out;
}

const command = (c: RoundCommand): GameCommand => ({ type: 'ROUND', command: c });

const select = (player: PlayerId, cards: string[], line?: number | null): GameCommand =>
  command(line === undefined ? { type: 'SELECT', player, cards } : { type: 'SELECT', player, cards, line });
const validate = (player: PlayerId): GameCommand => command({ type: 'VALIDATE', player });

// ---------- Choix par variante ----------

/** Poker fermé : quelles cartes jeter (0 à 3) pour maximiser la valeur moyenne de la main finale. */
function planClosed(round: RoundView, me: PlayerId, opponents: number, rng: Rng): GameCommand[] {
  const codes = ownHand(round, me);
  if (codes.length !== 5) return [validate(me)];
  const hand = codes.map(parseCard);
  const pool = unseenPool(codes);
  const draws = Array.from({ length: SAMPLES_CLOSED }, () => draw(pool, 3, rng)); // mêmes tirages pour tous les candidats
  let best: { discard: Card[]; score: number } = { discard: [], score: -1 };
  for (let k = 0; k <= 3; k++) {
    for (const discard of combinations(hand, k)) {
      const ids = new Set(discard.map((c) => c.id));
      const kept = hand.filter((c) => !ids.has(c.id));
      let total = 0;
      for (const d of draws) total += worth(evaluate5([...kept, ...d.slice(0, k)]), opponents);
      const score = total / draws.length;
      // À valeur égale on garde ses cartes : moins de changement, jamais de risque inutile
      if (score > best.score + 1e-12) best = { discard, score };
    }
  }
  const cards = best.discard.map((c) => c.code);
  return cards.length === 0 ? [validate(me)] : [select(me, cards), validate(me)];
}

/** Aviation et Avia 6 : quelles cartes jeter (nombre exact imposé) pour garder la meilleure paire finale. */
function planDiscard(round: RoundView, me: PlayerId, opponents: number, rng: Rng): GameCommand[] {
  const codes = ownHand(round, me);
  const count = Number(round.info.discardCount);
  const board = round.cards.board.filter((c): c is string => c !== null);
  const hand = codes.map(parseCard);
  if (!Number.isInteger(count) || count < 1 || hand.length - count < 2) return [];
  const missing = 5 - board.length;
  const pool = unseenPool([...codes, ...board]);
  const lastStep = hand.length - count === 2;
  const samples = lastStep ? SAMPLES_DISCARD_LAST : SAMPLES_DISCARD_FIRST;
  const known = board.map(parseCard);
  const runouts = Array.from({ length: samples }, () => [...known, ...draw(pool, missing, rng)]);
  let best: { discard: Card[]; score: number } | null = null;
  for (const discard of combinations(hand, count)) {
    const ids = new Set(discard.map((c) => c.id));
    const kept = hand.filter((c) => !ids.has(c.id));
    // Avec plus de deux cartes gardées, une défausse suit : on compte la meilleure paire finale possible
    const pairs = kept.length === 2 ? [kept] : combinations(kept, 2);
    let total = 0;
    for (const full of runouts) {
      let top = -1;
      for (const pair of pairs) top = Math.max(top, evaluateHoldem(pair, full).rank);
      total += worth(top, opponents);
    }
    const score = total / runouts.length;
    if (best === null || score > best.score) best = { discard, score };
  }
  if (!best) return [];
  return [select(me, best.discard.map((c) => c.code)), validate(me)];
}

/** 6-3 : toute la ligne est visible, on désigne exactement la meilleure paire des 15 possibles. */
function plan63(round: RoundView, me: PlayerId): GameCommand[] {
  // Paris extérieurs : le CPU ne parie pas (il valide « aucun pari » pour ne pas retarder la table).
  if (round.phase === 'BETS') return [command({ type: 'BET', player: me, bets: [] }), validate(me)];
  const codes = ownHand(round, me);
  const line = Number(round.info.line);
  if (codes.length < 2 || ![1, 2, 3].includes(line)) return [];
  const slice = round.cards.board.slice((line - 1) * 5, line * 5);
  if (slice.length !== 5 || slice.some((c) => c === null)) return [];
  const board = (slice as string[]).map(parseCard);
  // Tétines (cases 15 et suivantes) : avec elles, 2 cartes de la paire + 3 cartes parmi la ligne et les tétines.
  const teats = round.cards.board
    .slice(15)
    .filter((c): c is string => c !== null)
    .map(parseCard);
  const hand = codes.map(parseCard);
  let best: { pair: [Card, Card]; rank: HandRank } | null = null;
  for (const pair of combinations(hand, 2) as [Card, Card][]) {
    let { rank } = evaluateOmahaWithPair(pair, hand, board);
    if (teats.length > 0) rank = Math.max(rank, evaluateOmahaWithPairPool(pair, hand, [...board, ...teats]).rank);
    if (best === null || rank > best.rank) best = { pair, rank };
  }
  return best ? [select(me, best.pair.map((c) => c.code)), validate(me)] : [];
}

/** Morpion : 4 cartes privées, grille visible, on teste les 6 paires et les 8 alignements. */
function planMorpion(round: RoundView, me: PlayerId): GameCommand[] {
  const codes = ownHand(round, me);
  const grid = round.cards.board;
  if (codes.length < 2 || grid.length !== 9 || grid.some((c) => c === null)) return [];
  const board = (grid as string[]).map(parseCard);
  const hand = codes.map(parseCard);
  let bestPair: Card[] = [];
  let bestLine = -1;
  let bestRank = -1;
  for (const pair of combinations(hand, 2)) {
    for (let line = 0; line < MORPION_LINES.length; line++) {
      const [a, b, c] = MORPION_LINES[line]!;
      const rank = evaluate5([...pair, board[a]!, board[b]!, board[c]!]);
      if (rank > bestRank) {
        bestRank = rank;
        bestPair = pair;
        bestLine = line;
      }
    }
  }
  return bestLine < 0 ? [] : [select(me, bestPair.map((c) => c.code), bestLine), validate(me)];
}

// ---------- Point d'entrée ----------

/**
 * Commandes que le CPU `me` joue maintenant, dans l'ordre (liste vide : rien à faire pour lui).
 * À rappeler à chaque changement d'état : la décision se refait toujours à partir de la vue courante.
 */
export function cpuPlan(view: GameView, me: PlayerId, rng: Rng): GameCommand[] {
  if (view.phase === 'GAME_OVER') return [];

  if (view.phase === 'VARIANT_SELECTION') {
    const pending = view.insurance.pending;
    if (pending) return pending.partner === me ? [{ type: 'RESPOND_INSURANCE', player: me, accept: false }] : [];
    if (view.chooser !== me) return [];
    const options = view.variants.filter((v) => v.available).map((v) => v.variant);
    return options.length === 0 ? [] : [{ type: 'CHOOSE_VARIANT', player: me, variant: options[rng.int(options.length)] as VariantId }];
  }

  const round = view.round;
  if (!round || !round.awaiting.includes(me)) return [];
  const opponents = Math.max(1, view.players.filter((p) => !p.excluded).length - 1);
  switch (round.variant) {
    case 'V6_1':
    case 'LE10':
      return [command({ type: 'REVEAL', player: me })];
    case 'CLOSED_1':
    case 'CLOSED_2':
      return planClosed(round, me, opponents, rng);
    case 'AVIATION':
    case 'AVIA_6': {
      const status = round.info.status as Record<PlayerId, string> | undefined;
      const active = status ? Object.values(status).filter((s) => s === 'ACTIVE').length : view.players.length;
      return planDiscard(round, me, Math.max(1, active - 1), rng);
    }
    case 'V6_3':
      return plan63(round, me);
    case 'MORPION':
      return planMorpion(round, me);
  }
}
