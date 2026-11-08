/** Valeur d'une carte (code court « As », « Td », « 7c ») : As = 11 (ramené à 1 au besoin), figures et 10 = 10. */
export function cardValue(code: string): number {
  const r = code[0]!;
  if (r === 'A') return 11;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  const n = Number(r);
  if (!Number.isInteger(n) || n < 2 || n > 9) throw new RangeError(`Carte invalide : ${code}`);
  return n;
}

export interface HandValue {
  /** Meilleur total sans dépasser 21 (ou le total minimal s'il dépasse). */
  total: number;
  /** Vrai si un As compte encore pour 11 (« soft »). */
  soft: boolean;
  bust: boolean;
}

export function handValue(cards: readonly string[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0, bust: total > 21 };
}

/** Blackjack naturel : As + carte de valeur 10 sur les deux premières cartes. */
export function isNaturalBlackjack(cards: readonly string[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}
