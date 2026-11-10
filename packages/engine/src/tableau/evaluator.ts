import { parseCard, type Card } from '../core/card';
import { evaluate5, HandCategory, type HandRank } from '../evaluation/handEvaluator';

/**
 * LE TABLEAU — évaluation d'une colonne (5 cartes) et comparaison de deux colonnes.
 * Les dix combinaisons classiques, dont la quinte flush royale. Aucune somme de valeurs : le rang est un entier
 * lexicographique (catégorie, puis cartes décisives par ordre d'importance). Les couleurs ne départagent jamais.
 */
export enum TableauCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const TABLEAU_LABELS_FR: Record<TableauCategory, string> = {
  [TableauCategory.HighCard]: 'Carte haute',
  [TableauCategory.Pair]: 'Paire',
  [TableauCategory.TwoPair]: 'Double paire',
  [TableauCategory.ThreeOfAKind]: 'Brelan',
  [TableauCategory.Straight]: 'Quinte',
  [TableauCategory.Flush]: 'Couleur',
  [TableauCategory.FullHouse]: 'Full',
  [TableauCategory.FourOfAKind]: 'Carré',
  [TableauCategory.StraightFlush]: 'Quinte flush',
  [TableauCategory.RoyalFlush]: 'Quinte flush royale',
};

/** Aide-mémoire pédagogique, de la plus faible à la plus forte. */
export const TABLEAU_HELP_FR: readonly { category: TableauCategory; label: string; example: string; text: string }[] = [
  { category: TableauCategory.HighCard, label: 'Carte haute', example: 'As Rd 9h 6c 3s', text: 'Aucune combinaison. La carte la plus haute décide.' },
  { category: TableauCategory.Pair, label: 'Paire', example: '8h 8d As 5c 2s', text: 'Deux cartes de même valeur.' },
  { category: TableauCategory.TwoPair, label: 'Double paire', example: 'Kh Kd 4s 4c 9d', text: 'Deux paires différentes.' },
  { category: TableauCategory.ThreeOfAKind, label: 'Brelan', example: '7h 7d 7s Kc 2d', text: 'Trois cartes de même valeur.' },
  { category: TableauCategory.Straight, label: 'Quinte', example: '5h 6d 7s 8c 9d', text: 'Cinq valeurs consécutives (l’As compte haut ou bas, A-2-3-4-5).' },
  { category: TableauCategory.Flush, label: 'Couleur', example: 'Ah 9h 7h 4h 2h', text: 'Cinq cartes de la même couleur.' },
  { category: TableauCategory.FullHouse, label: 'Full', example: 'Qh Qd Qs 3c 3d', text: 'Un brelan et une paire.' },
  { category: TableauCategory.FourOfAKind, label: 'Carré', example: '9h 9d 9s 9c Kd', text: 'Quatre cartes de même valeur.' },
  { category: TableauCategory.StraightFlush, label: 'Quinte flush', example: '4h 5h 6h 7h 8h', text: 'Une quinte, toutes de la même couleur.' },
  { category: TableauCategory.RoyalFlush, label: 'Quinte flush royale', example: 'Th Jh Qh Kh Ah', text: 'La plus haute quinte flush, du 10 à l’As.' },
];

const RANK_SINGULAR = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'valet', 'dame', 'roi', 'as'];
const RANK_PLURAL = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'valets', 'dames', 'rois', 'as'];
const RANK_ELIDE = (r: number): string => (r === 14 ? "d'" : 'de ');

/** Rang d'une main de 5 cartes -> catégorie à 10 niveaux (distingue la quinte flush royale). */
export function tableauCategoryOf(rank: HandRank): TableauCategory {
  const base = Math.floor(rank / 15 ** 5) as HandCategory;
  if (base === HandCategory.StraightFlush) {
    const high = Math.floor(rank / 15 ** 4) % 15; // premier kicker = carte haute de la quinte
    return high === 14 ? TableauCategory.RoyalFlush : TableauCategory.StraightFlush;
  }
  return base as unknown as TableauCategory;
}

export interface ColumnHand {
  rank: HandRank;
  category: TableauCategory;
  /** « Paire de rois », « Quinte au 9 »… */
  label: string;
  /** Les cinq cartes, ordonnées de la plus décisive à la moins décisive (roue : 5-4-3-2-A). */
  cards: string[];
  /** Cartes qui constituent réellement la combinaison (la paire, le brelan, les cinq d'une quinte…). */
  forming: string[];
}

const BY_CODE = new Map<string, Card>();
function card(code: string): Card {
  let c = BY_CODE.get(code);
  if (!c) {
    c = parseCard(code);
    BY_CODE.set(code, c);
  }
  return c;
}
export const cardOf = card;

function describe(category: TableauCategory, ordered: readonly Card[]): string {
  const r = (i: number): number => ordered[i]!.rank;
  switch (category) {
    case TableauCategory.HighCard:
      return `Carte haute, ${RANK_SINGULAR[r(0)]}`;
    case TableauCategory.Pair:
      return `Paire ${RANK_ELIDE(r(0))}${RANK_PLURAL[r(0)]}`;
    case TableauCategory.TwoPair:
      return `Double paire ${RANK_ELIDE(r(0))}${RANK_PLURAL[r(0)]} et ${RANK_ELIDE(r(2))}${RANK_PLURAL[r(2)]}`;
    case TableauCategory.ThreeOfAKind:
      return `Brelan ${RANK_ELIDE(r(0))}${RANK_PLURAL[r(0)]}`;
    case TableauCategory.Straight:
      return `Quinte au ${RANK_SINGULAR[r(0)]}`;
    case TableauCategory.Flush:
      return `Couleur, ${RANK_SINGULAR[r(0)]} haut`;
    case TableauCategory.FullHouse:
      return `Full aux ${RANK_PLURAL[r(0)]} par les ${RANK_PLURAL[r(3)]}`;
    case TableauCategory.FourOfAKind:
      return `Carré ${RANK_ELIDE(r(0))}${RANK_PLURAL[r(0)]}`;
    case TableauCategory.StraightFlush:
      return `Quinte flush au ${RANK_SINGULAR[r(0)]}`;
    case TableauCategory.RoyalFlush:
      return 'Quinte flush royale';
  }
}

/** Évalue une colonne COMPLÈTE (exactement 5 cartes distinctes, codes courts « As », « Td »). */
export function evaluateColumn(codes: readonly string[]): ColumnHand {
  if (codes.length !== 5) throw new RangeError(`Une colonne se compare à 5 cartes (reçu ${codes.length})`);
  if (new Set(codes).size !== 5) throw new RangeError('Cartes en double dans la colonne');
  const cards = codes.map(card);
  const rank = evaluate5(cards);
  const category = tableauCategoryOf(rank);

  // Ordre décisif : effectif de rang décroissant, puis rang décroissant ; roue : l'As en dernier.
  const count = new Map<number, number>();
  for (const c of cards) count.set(c.rank, (count.get(c.rank) ?? 0) + 1);
  let ordered = [...cards].sort((a, b) => count.get(b.rank)! - count.get(a.rank)! || b.rank - a.rank);
  const isStraight = category === TableauCategory.Straight || category === TableauCategory.StraightFlush || category === TableauCategory.RoyalFlush;
  if (isStraight && ordered[0]!.rank === 14 && ordered[1]!.rank === 5) ordered = [...ordered.slice(1), ordered[0]!];
  const wheel = isStraight && ordered[0]!.rank === 5;

  let forming: Card[];
  if (category === TableauCategory.HighCard) forming = [ordered[0]!];
  else if (category === TableauCategory.Pair || category === TableauCategory.TwoPair || category === TableauCategory.ThreeOfAKind || category === TableauCategory.FourOfAKind)
    forming = ordered.filter((c) => count.get(c.rank)! >= 2);
  else forming = ordered;

  const label = describe(category, ordered);
  return { rank, category, label: wheel && isStraight && category === TableauCategory.Straight ? 'Quinte au 5 (roue)' : label, cards: ordered.map((c) => c.code), forming: forming.map((c) => c.code) };
}

/** 1 si `a` bat `b`, -1 si `b` bat `a`, 0 pour une égalité parfaite. */
export function compareColumns(a: readonly string[], b: readonly string[]): -1 | 0 | 1 {
  const ra = evaluate5(a.map(card));
  const rb = evaluate5(b.map(card));
  return ra === rb ? 0 : ra > rb ? 1 : -1;
}

/** Libellé court d'une colonne INCOMPLÈTE (pédagogie) : paire, brelan, tirage couleur ou quinte. */
export function describePartial(codes: readonly string[]): string {
  if (codes.length === 0) return 'Colonne vide';
  const cards = codes.map(card);
  const count = new Map<number, number>();
  for (const c of cards) count.set(c.rank, (count.get(c.rank) ?? 0) + 1);
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = groups[0]!;
  if (top[1] === 4) return `Carré ${RANK_ELIDE(top[0])}${RANK_PLURAL[top[0]]}`;
  if (top[1] === 3) return groups[1]?.[1] === 2 ? `Full aux ${RANK_PLURAL[top[0]]}` : `Brelan ${RANK_ELIDE(top[0])}${RANK_PLURAL[top[0]]}`;
  if (top[1] === 2) return groups[1]?.[1] === 2 ? `Double paire ${RANK_ELIDE(top[0])}${RANK_PLURAL[top[0]]} et ${RANK_ELIDE(groups[1]![0])}${RANK_PLURAL[groups[1]![0]]}` : `Paire ${RANK_ELIDE(top[0])}${RANK_PLURAL[top[0]]}`;
  if (cards.length >= 2 && cards.every((c) => c.suit === cards[0]!.suit)) return `${cards.length} cartes de la même couleur. Couleur possible`;
  const ranks = [...new Set(cards.map((c) => c.rank))];
  if (ranks.length >= 3) {
    const pts = ranks.includes(14) ? [...ranks, 1] : ranks;
    for (let lo = 1; lo <= 10; lo++) {
      if (ranks.every((x) => (x >= lo && x <= lo + 4) || (x === 14 && lo === 1))) {
        const inWin = pts.filter((x) => x >= lo && x <= lo + 4).length;
        if (inWin >= ranks.length) return `${ranks.length} cartes proches. Quinte possible`;
      }
    }
  }
  return `Carte haute, ${RANK_SINGULAR[Math.max(...ranks)]}`;
}
