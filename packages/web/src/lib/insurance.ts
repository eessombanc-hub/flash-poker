import { formatChips } from './format';
import type { InsuranceType } from './types';

/**
 * Explication chiffrée d'une assurance, dans les mêmes termes que le règlement du serveur :
 * - « le perdant ne paye pas » : le vainqueur assuré reçoit la cagnotte moins la mise de son partenaire, qui la récupère ;
 * - « 50 / 50 » : moitié chacun, le centime impair revenant au vainqueur ;
 * dans les deux cas, si le vainqueur n'est pas assuré, il empoche toute la cagnotte.
 */
export function describeInsurance(type: InsuranceType, potChips: number, stakeChips: number): string {
  if (type === 'LOSER_NOT_PAYING') {
    return `Si l’un de vous deux gagne, il reçoit ${formatChips(potChips - stakeChips)} (la cagnotte moins la mise de son partenaire) ; son partenaire récupère sa mise de ${formatChips(stakeChips)}.`;
  }
  const half = Math.floor(potChips / 2);
  return `Si l’un de vous deux gagne, vous vous partagez la cagnotte à parts égales : ${formatChips(half)} chacun${potChips % 2 === 1 ? ' (le jeton impair revient au vainqueur)' : ''}.`;
}

export const INSURANCE_GENERAL_NOTE =
  'Si quelqu’un d’autre gagne, il empoche toute la cagnotte : l’assurance ne change jamais le vainqueur. Une seule assurance par partie, entre deux joueurs exactement.';
