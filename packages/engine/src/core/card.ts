export const SUITS = ['c', 'd', 'h', 's'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_CHARS = '23456789TJQKA';

/** Carte immuable. `id` (0..51) est unique ; l'As vaut toujours 14 (le plus fort). */
export interface Card {
  readonly id: number;
  readonly rank: Rank;
  readonly suit: Suit;
  /** Code court : "As", "Td", "2c". */
  readonly code: string;
}

export const ALL_CARDS: readonly Card[] = Object.freeze(
  RANKS.flatMap((rank) =>
    SUITS.map((suit, s) =>
      Object.freeze({
        id: (rank - 2) * 4 + s,
        rank,
        suit,
        code: RANK_CHARS[rank - 2]! + suit,
      } as Card),
    ),
  ),
);

export function cardById(id: number): Card {
  const card = ALL_CARDS[id];
  if (!Number.isInteger(id) || card === undefined) throw new RangeError(`Identifiant de carte invalide : ${id}`);
  return card;
}

/** "As" -> A de pique. Accepte "T" pour le 10. */
export function parseCard(code: string): Card {
  if (code.length !== 2) throw new RangeError(`Code de carte invalide : "${code}"`);
  const r = RANK_CHARS.indexOf(code[0]!.toUpperCase());
  const s = SUITS.indexOf(code[1]!.toLowerCase() as Suit);
  if (r < 0 || s < 0) throw new RangeError(`Code de carte invalide : "${code}"`);
  return ALL_CARDS[r * 4 + s]!;
}

/** "As Kd 7h" -> [As, Kd, 7h] */
export function parseCards(codes: string): Card[] {
  return codes.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function createDeck(): Card[] {
  return [...ALL_CARDS];
}
