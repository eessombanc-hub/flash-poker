import type { Card } from '../core/card';
import { assertDistinct, bestOf, type EvalResult } from './handEvaluator';

/**
 * Hold'em (Aviation, Avia 6, Hold'em de départage) :
 * meilleure main de 5 cartes parmi les cartes privées restantes (0, 1 ou 2 utilisées) + les 5 cartes communes.
 * À l'évaluation, un joueur ne peut plus détenir que 2 cartes privées au plus.
 */
export function evaluateHoldem(privateCards: readonly Card[], board: readonly Card[]): EvalResult {
  if (board.length !== 5) throw new RangeError(`Le plateau Hold'em compte 5 cartes (reçu ${board.length})`);
  if (privateCards.length > 2) throw new RangeError(`Hold'em : 2 cartes privées maximum (reçu ${privateCards.length})`);
  const all = [...privateCards, ...board];
  assertDistinct(all);
  return bestOf(all);
}
