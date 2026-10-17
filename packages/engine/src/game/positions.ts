import type { PlayerId } from '../core/cardEngine';
import type { Rng } from '../core/rng';
import { shuffled } from '../core/shuffle';

export const POSITION_LABELS = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'UTG+4', 'UTG+5'] as const;

export interface Seating {
  /** Joueurs dans l'ordre des positions : UTG en premier. Stable pendant toute la partie. */
  order: PlayerId[];
  positions: Record<PlayerId, string>;
}

/** Tirage au sort au démarrage : UTG à UTG+(n−1) pour n joueurs. */
export function assignPositions(players: readonly PlayerId[], rng: Rng): Seating {
  if (players.length < 2 || players.length > 6) throw new RangeError('2 à 6 joueurs');
  const order = shuffled(players, rng);
  return { order, positions: Object.fromEntries(order.map((p, i) => [p, POSITION_LABELS[i]!])) };
}
