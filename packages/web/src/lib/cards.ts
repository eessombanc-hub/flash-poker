export type Suit = 'c' | 'd' | 'h' | 's';

export interface CardInfo {
  code: string;
  /** 2 à 14 (l'As vaut 14 : toujours le plus fort). */
  rank: number;
  suit: Suit;
  /** Affichage compact : A K Q J 10 9… */
  label: string;
  /** Nom complet, pour les lecteurs d'écran : « As de pique ». */
  name: string;
}

const RANK_CHARS = '23456789TJQKA';
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi', 'As'];
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUIT_NAMES: Record<Suit, string> = { c: 'trèfle', d: 'carreau', h: 'cœur', s: 'pique' };
const SUIT_ORDER: Record<Suit, number> = { s: 0, h: 1, d: 2, c: 3 };

export function isCardCode(v: unknown): v is string {
  return typeof v === 'string' && v.length === 2 && RANK_CHARS.includes(v[0]!) && 'cdhs'.includes(v[1]!);
}

export function parseCode(code: string): CardInfo {
  if (!isCardCode(code)) throw new RangeError(`Code de carte invalide : ${String(code)}`);
  const i = RANK_CHARS.indexOf(code[0]!);
  const suit = code[1] as Suit;
  return { code, rank: i + 2, suit, label: RANK_LABELS[i]!, name: `${RANK_NAMES[i]} de ${SUIT_NAMES[suit]}` };
}

/** Tri neutre de la main (rang décroissant, puis couleur) : un simple confort de lecture, jamais une évaluation. */
export function sortHand(codes: readonly string[]): string[] {
  return [...codes].sort((a, b) => {
    const A = parseCode(a);
    const B = parseCode(b);
    return B.rank - A.rank || SUIT_ORDER[A.suit] - SUIT_ORDER[B.suit];
  });
}
