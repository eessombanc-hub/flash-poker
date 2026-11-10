import { tr } from '../i18n';
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
    return tr('ins.lnp', { win: formatChips(potChips - stakeChips), stake: formatChips(stakeChips) });
  }
  const half = Math.floor(potChips / 2);
  return tr(potChips % 2 === 1 ? 'ins.split.odd' : 'ins.split', { half: formatChips(half) });
}

export const INSURANCE_GENERAL_NOTE_TEXT = (): string => tr('ins.general');
