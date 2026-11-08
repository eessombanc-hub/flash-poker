import { handValue } from './hand';
import type { BjRound } from './round';

/** Valeurs de carte indexées 2..11 (10 = toutes les figures). */
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const REP = ['2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'As'] as const;

export interface Odds {
  /** Probabilité de dépasser 21 en tirant une carte. */
  bustOnHit: number;
  /** Issue si le joueur reste : gagner, égalité, perdre. */
  stand: { win: number; push: number; lose: number };
  /** Total final du croupier : 17 à 21, ou dépassement. */
  dealerFinal: { 17: number; 18: number; 19: number; 20: number; 21: number; bust: number };
}

/** Cartes encore inconnues du joueur : sabot complet moins ce qu'il voit (la carte cachée du croupier reste inconnue). */
function unseen(r: BjRound): number[] {
  const counts = VALUES.map((v) => (v === 10 ? 16 : 4) * r.rules.decks);
  const seen = [...r.hands.flatMap((h) => h.cards), r.dealer[0]!];
  for (const c of seen) {
    const rank = c[0]!;
    const v = rank === 'A' ? 11 : 'TJQK'.includes(rank) ? 10 : Number(rank);
    counts[v - 2]!--;
  }
  return counts;
}

/**
 * Probabilités exactes (énumération des tirages possibles dans le sabot restant) pour la main active.
 * Information pédagogique : elle ne modifie jamais le déroulement de la manche.
 */
export function analyze(r: BjRound): Odds {
  const counts = unseen(r);
  const h = r.hands[r.active]!;
  const total = counts.reduce((a, b) => a + b, 0);
  let bust = 0;
  VALUES.forEach((_, i) => {
    if (handValue([...h.cards, REP[i]!]).bust) bust += counts[i]!;
  });

  const up = r.dealer[0]!;
  const upV = up[0] === 'A' ? 11 : 'TJQK'.includes(up[0]!) ? 10 : Number(up[0]);
  const dist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  // Le croupier a déjà vérifié son Blackjack : sa carte cachée n'a pas pu le former.
  const forbiddenHole = upV === 10 ? 11 : upV === 11 ? 10 : 0;

  const walk = (cards: string[], weight: number, first: boolean): void => {
    const v = handValue(cards);
    if (v.bust) return void (dist.bust += weight);
    const stands = v.total > 17 || (v.total === 17 && !(v.soft && r.rules.dealerHitsSoft17));
    if (stands) return void (dist[v.total as 17 | 18 | 19 | 20 | 21] += weight);
    let pool = counts.reduce((a, b) => a + b, 0);
    if (first && forbiddenHole) pool -= counts[forbiddenHole - 2]!;
    for (let i = 0; i < VALUES.length; i++) {
      if (counts[i]! <= 0) continue;
      if (first && VALUES[i] === forbiddenHole) continue;
      const p = counts[i]! / pool;
      counts[i]!--;
      walk([...cards, REP[i]!], weight * p, false);
      counts[i]!++;
    }
  };
  walk([up], 1, true);

  const p = handValue(h.cards);
  let win = 0;
  let push = 0;
  let lose = 0;
  if (p.bust) lose = 1;
  else {
    win = dist.bust;
    for (const t of [17, 18, 19, 20, 21] as const) {
      if (t < p.total) win += dist[t];
      else if (t === p.total) push += dist[t];
      else lose += dist[t];
    }
  }
  return { bustOnHit: total > 0 ? bust / total : 0, stand: { win, push, lose }, dealerFinal: dist };
}
