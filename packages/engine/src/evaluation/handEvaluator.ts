import type { Card } from '../core/card';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_LABELS_FR: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carte haute',
  [HandCategory.Pair]: 'Paire',
  [HandCategory.TwoPair]: 'Double paire',
  [HandCategory.ThreeOfAKind]: 'Brelan',
  [HandCategory.Straight]: 'Quinte',
  [HandCategory.Flush]: 'Couleur',
  [HandCategory.FullHouse]: 'Full',
  [HandCategory.FourOfAKind]: 'Carré',
  [HandCategory.StraightFlush]: 'Quinte flush',
};

/**
 * Rang d'une main de 5 cartes : un entier, comparable avec < > ===.
 * rang = catégorie × 15^5 + kickers encodés en base 15 (5 chiffres).
 * Les couleurs (♣♦♥♠) ne départagent JAMAIS deux mains.
 */
export type HandRank = number;

const BASE = 15;
const CATEGORY_MULT = BASE ** 5;

function encode(category: HandCategory, kickers: readonly number[]): HandRank {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * BASE + (kickers[i] ?? 0);
  return category * CATEGORY_MULT + v;
}

export function categoryOf(rank: HandRank): HandCategory {
  return Math.floor(rank / CATEGORY_MULT) as HandCategory;
}

export function describeCategory(rank: HandRank): string {
  return CATEGORY_LABELS_FR[categoryOf(rank)];
}

export function compareRanks(a: HandRank, b: HandRank): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Évalue exactement 5 cartes. Règles : As haut, roue A-2-3-4-5 valide (quinte au 5), pas de quinte « circulaire ». */
export function evaluate5(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) throw new RangeError(`evaluate5 attend 5 cartes (reçu ${cards.length})`);
  const rs = [cards[0]!.rank, cards[1]!.rank, cards[2]!.rank, cards[3]!.rank, cards[4]!.rank].sort((a, b) => b - a);
  const suit = cards[0]!.suit;
  const flush = cards[1]!.suit === suit && cards[2]!.suit === suit && cards[3]!.suit === suit && cards[4]!.suit === suit;

  // Groupes de rangs égaux (rs est trié décroissant)
  const gRank: number[] = [];
  const gCount: number[] = [];
  for (const r of rs) {
    const last = gRank.length - 1;
    if (last >= 0 && gRank[last] === r) gCount[last]!++;
    else {
      gRank.push(r);
      gCount.push(1);
    }
  }

  if (gRank.length === 5) {
    const wheel = rs[0] === 14 && rs[1] === 5; // A-5-4-3-2, rangs distincts
    const straight = wheel || rs[0]! - rs[4]! === 4;
    const high = wheel ? 5 : rs[0]!;
    if (straight && flush) return encode(HandCategory.StraightFlush, [high]);
    if (flush) return encode(HandCategory.Flush, rs);
    if (straight) return encode(HandCategory.Straight, [high]);
    return encode(HandCategory.HighCard, rs);
  }

  // Ordre de départage : effectif décroissant, puis rang décroissant
  const order = gRank.map((_, i) => i).sort((a, b) => gCount[b]! - gCount[a]! || gRank[b]! - gRank[a]!);
  const kickers = order.map((i) => gRank[i]!);
  const top = gCount[order[0]!]!;
  switch (gRank.length) {
    case 2:
      return encode(top === 4 ? HandCategory.FourOfAKind : HandCategory.FullHouse, kickers);
    case 3:
      return encode(top === 3 ? HandCategory.ThreeOfAKind : HandCategory.TwoPair, kickers);
    default:
      return encode(HandCategory.Pair, kickers);
  }
}

export interface EvalResult {
  rank: HandRank;
  /** Les 5 cartes retenues pour la combinaison. */
  cards: readonly Card[];
}

export function forEachCombination<T>(items: readonly T[], k: number, visit: (combo: T[]) => void): void {
  const combo: T[] = new Array<T>(k);
  const rec = (start: number, depth: number): void => {
    if (depth === k) {
      visit(combo);
      return;
    }
    for (let i = start; i <= items.length - (k - depth); i++) {
      combo[depth] = items[i]!;
      rec(i + 1, depth + 1);
    }
  };
  rec(0, 0);
}

export function assertDistinct(cards: readonly Card[]): void {
  if (new Set(cards.map((c) => c.id)).size !== cards.length) {
    throw new RangeError('Cartes en double dans l\'évaluation');
  }
}

/** Meilleure main de 5 cartes parmi n >= 5 cartes, sans aucune contrainte. */
export function bestOf(cards: readonly Card[]): EvalResult {
  if (cards.length < 5) throw new RangeError(`Au moins 5 cartes requises (reçu ${cards.length})`);
  assertDistinct(cards);
  let best: EvalResult | null = null;
  forEachCombination(cards, 5, (five) => {
    const rank = evaluate5(five);
    if (best === null || rank > best.rank) best = { rank, cards: five.slice() };
  });
  return best!;
}

/**
 * Le 10, comparaison PENDANT les révélations : de 1 à 9 cartes visibles, sans plateau commun (donc jamais assez
 * pour une quinte ou une couleur, impossibles à moins de 5 cartes). Classement par effectifs de rang (carré >
 * brelan > double paire > paire > carte haute), à départager par les cartes les plus hautes — la même logique
 * que `evaluate5` hors quinte/couleur, généralisée à un nombre de cartes quelconque. À 5 cartes ou plus, la
 * comparaison finale utilise `bestOf` (meilleure main de 5, règle du Hold'em, sans contrainte 2+3).
 */
export function evaluatePartial(cards: readonly Card[]): HandRank {
  if (cards.length === 0) throw new RangeError('Au moins 1 carte requise');
  assertDistinct(cards);
  if (cards.length >= 5) return bestOf(cards).rank;
  const rs = cards.map((c) => c.rank).sort((a, b) => b - a);
  const gRank: number[] = [];
  const gCount: number[] = [];
  for (const r of rs) {
    const last = gRank.length - 1;
    if (last >= 0 && gRank[last] === r) gCount[last]!++;
    else {
      gRank.push(r);
      gCount.push(1);
    }
  }
  const order = gRank.map((_, i) => i).sort((a, b) => gCount[b]! - gCount[a]! || gRank[b]! - gRank[a]!);
  const kickers = order.map((i) => gRank[i]!);
  const top = gCount[order[0]!]!;
  const category =
    top === 4
      ? HandCategory.FourOfAKind
      : top === 3
        ? HandCategory.ThreeOfAKind
        : top === 2
          ? gCount.filter((c) => c === 2).length >= 2
            ? HandCategory.TwoPair
            : HandCategory.Pair
          : HandCategory.HighCard;
  return encode(category, kickers);
}
