import type { Card } from '../core/card';
import { bestOf, type EvalResult } from './handEvaluator';

/**
 * 6-1, comparaison partielle (après la 1re révélation) : meilleure main de 5 cartes parmi
 * le plateau commun + les cartes privées VISIBLES du joueur, SANS contrainte 2 + 3.
 * Les cartes encore cachées ne sont jamais fournies à cette fonction.
 * (La contrainte Omaha exacte ne s'applique qu'au showdown final : `evaluateOmaha`.)
 */
export function evaluateVisible(board: readonly Card[], visibleCards: readonly Card[]): EvalResult {
  if (board.length !== 5) throw new RangeError(`Le plateau du 6-1 compte 5 cartes (reçu ${board.length})`);
  return bestOf([...visibleCards, ...board]);
}
