import type { Card } from '../core/card';
import { assertDistinct, evaluate5, forEachCombination, type EvalResult } from './handEvaluator';

function assertBoard(board: readonly Card[]): void {
  if (board.length !== 5) throw new RangeError(`Le plateau Omaha compte 5 cartes (reçu ${board.length})`);
}

/**
 * Omaha (6-1 au showdown, 6-3) : EXACTEMENT 2 cartes privées + EXACTEMENT 3 cartes communes.
 * Cette contrainte est codée dans la construction même des candidats : aucune autre
 * combinaison (0, 1, 3 privées…) n'est jamais évaluée.
 * Meilleure main automatique parmi toutes les cartes privées fournies.
 */
export function evaluateOmaha(privateCards: readonly Card[], board: readonly Card[]): EvalResult {
  if (privateCards.length < 2) throw new RangeError('Omaha : au moins 2 cartes privées requises');
  assertBoard(board);
  assertDistinct([...privateCards, ...board]);
  let best: EvalResult | null = null;
  forEachCombination(privateCards, 2, (pair) => {
    const rank = bestWithPair(pair[0]!, pair[1]!, board, best?.rank ?? -1);
    if (rank !== null && (best === null || rank.rank > best.rank)) best = rank;
  });
  return best!;
}

/**
 * 6-3 : évalue la paire DÉSIGNÉE par le joueur, et elle seule. Aucune aide : la meilleure paire
 * de la main n'est ni calculée ni retournée. Les 3 cartes du plateau sont les meilleures pour cette paire.
 */
export function evaluateOmahaWithPair(
  pair: readonly [Card, Card],
  hand: readonly Card[],
  board: readonly Card[],
): EvalResult {
  assertBoard(board);
  assertDistinct([...hand, ...board]);
  if (pair[0].id === pair[1].id) throw new RangeError('La paire désignée contient deux fois la même carte');
  const inHand = new Set(hand.map((c) => c.id));
  if (!inHand.has(pair[0].id) || !inHand.has(pair[1].id)) {
    throw new RangeError('La paire désignée doit être composée de cartes de la main du joueur');
  }
  return bestWithPair(pair[0], pair[1], board, -1)!;
}

function bestWithPair(a: Card, b: Card, board: readonly Card[], floor: number): EvalResult | null {
  let best: EvalResult | null = null;
  forEachCombination(board, 3, (three) => {
    const five = [a, b, three[0]!, three[1]!, three[2]!];
    const rank = evaluate5(five);
    if (rank > floor && (best === null || rank > best.rank)) best = { rank, cards: five };
  });
  return best;
}

/**
 * 6-3 avec tétines : la paire désignée (EXACTEMENT 2 cartes privées) se combine avec EXACTEMENT 3 cartes prises
 * parmi les cartes communes de la ligne (5) augmentées des tétines (jusqu'à 2), soit 5 à 7 cartes communes.
 * La contrainte « 2 + 3 » du Omaha reste donc entière : les tétines élargissent seulement le choix des 3 cartes.
 */
export function evaluateOmahaWithPairPool(
  pair: readonly [Card, Card],
  hand: readonly Card[],
  pool: readonly Card[],
): EvalResult {
  if (pool.length < 5 || pool.length > 7) throw new RangeError(`Les cartes communes d’une ligne comptent de 5 à 7 cartes (reçu ${pool.length})`);
  assertDistinct([...hand, ...pool]);
  if (pair[0].id === pair[1].id) throw new RangeError('La paire désignée contient deux fois la même carte');
  const inHand = new Set(hand.map((c) => c.id));
  if (!inHand.has(pair[0].id) || !inHand.has(pair[1].id)) {
    throw new RangeError('La paire désignée doit être composée de cartes de la main du joueur');
  }
  return bestWithPair(pair[0], pair[1], pool, -1)!;
}
