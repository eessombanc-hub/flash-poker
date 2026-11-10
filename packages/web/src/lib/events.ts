import { formatLinePoints } from './format';
import { NEXT_REASON_TEXT, variantName } from './labels';
import { nick } from './selectors';
import type { NextReason, RoomView, RoundEvent, VariantId } from './types';

export type Tone = 'info' | 'success' | 'warning' | 'error';
export interface Announcement {
  text: string;
  tone: Tone;
}

/** Événement du moteur → phrase française (annonce à l'écran). `null` = rien à annoncer (l'état suffit). */
export function describeEvent(e: RoundEvent, view: RoomView): Announcement | null {
  const d = e.data as Record<string, any>;
  const who = (id: unknown): string => nick(view, String(id));
  switch (e.type) {
    case 'GAME_STARTED':
      return { text: 'La partie commence. Les positions ont été tirées au sort.', tone: 'info' };
    case 'VARIANT_CHOSEN':
      return {
        text: `${variantName(d.variant as VariantId)} choisie par ${who(d.chooser)}${d.auto ? ' (tirée au hasard, délai de 60 s écoulé)' : ''}`,
        tone: 'info',
      };
    case 'BOARD_REVEALED':
      return d.line ? { text: `River ${d.line} dévoilée`, tone: 'info' } : null;
    case 'SIDE_BETS_LOCKED': {
      const n = Array.isArray(d.pools) ? d.pools.length : 0;
      return { text: n === 0 ? 'Paris extérieurs. Aucun pari commun, les cartes sont distribuées' : `Paris extérieurs. ${n} cagnotte${n > 1 ? 's' : ''} engagée${n > 1 ? 's' : ''}`, tone: 'info' };
    }
    case 'SIDE_BET_RESOLVED': {
      const winners = (d.winners as string[]) ?? [];
      if (d.refunded || winners.length === 0) return { text: `Pari de la ligne ${d.line}. Mises rendues`, tone: 'warning' };
      const pot = Number(d.amount ?? 0) * ((d.members as string[] | undefined)?.length ?? 0);
      return { text: `Pari de la ligne ${d.line}. ${winners.map(who).join(' et ')} ${winners.length > 1 ? 'se partagent' : 'remporte'} ${pot.toLocaleString('fr-FR')} jetons`, tone: 'success' };
    }
    case 'TEATS_MOVED':
      return { text: `Les tétines passent à la ligne ${Number(d.line) + 1}`, tone: 'info' };
    case 'LINE_RESOLVED': {
      const winners = (d.winners as string[]) ?? [];
      if (winners.length === 0) return { text: `Ligne ${d.line}. Aucun gagnant`, tone: 'warning' };
      const names = winners.map(who).join(' et ');
      return {
        text: `Ligne ${d.line}. ${names} ${winners.length > 1 ? 'se partagent' : 'l\u2019emporte'} (${formatLinePoints(d.unitsEach)} point de ligne${winners.length > 1 ? ' chacun' : ''})`,
        tone: 'success',
      };
    }
    case 'PLAYER_FOLDED':
      return { text: `${who(d.player)} couche sa main`, tone: 'warning' };
    case 'CARD_REVEALED':
      return { text: `${who(d.player)} retourne une carte`, tone: 'info' };
    case 'REVEAL_ORDER_RECOMPUTED':
      return { text: `Nouvel ordre, ${who(d.next)} doit révéler (${NEXT_REASON_TEXT[d.reason as NextReason] ?? ''})`, tone: 'info' };
    case 'SHOWDOWN':
      return { text: 'Les mains sont dévoilées', tone: 'info' };
    case 'INSURANCE_PROPOSED':
      return { text: `${who(d.proposer)} propose une assurance à ${who(d.partner)}`, tone: 'info' };
    case 'INSURANCE_ACCEPTED': {
      const [a, b] = (d.insurance as { players: [string, string] }).players;
      return { text: `Assurance conclue entre ${who(a)} et ${who(b)}`, tone: 'success' };
    }
    case 'INSURANCE_DECLINED':
      return { text: `${who(d.partner)} refuse l\u2019assurance`, tone: 'info' };
    case 'INSURANCE_EXPIRED':
      return { text: 'Proposition d\u2019assurance expirée (silence = refus)', tone: 'info' };
    case 'PLAYER_ADDED':
      return { text: `${who(d.player)} rejoint la table (${d.position})`, tone: 'info' };
    case 'PLAYER_EXCLUDED':
      return { text: `${who(d.player)} a été exclu par l\u2019hôte`, tone: 'warning' };
    case 'PLAYER_JOINED':
      return { text: `${who(d.player)} a rejoint la partie${d.queued ? ' (en attente d\u2019une place)' : ''}`, tone: 'info' };
    case 'PLAYER_LEFT':
    case 'PLAYER_REMOVED':
      return { text: 'Un joueur a quitté la partie', tone: 'info' };
    case 'ROOM_CANCELLED':
      return { text: 'La partie a été annulée par l\u2019hôte', tone: 'warning' };
    case 'ROOM_ABANDONED':
      return { text: 'Partie abandonnée, plus aucun joueur connecté', tone: 'warning' };
    case 'WARNING':
      return { text: `Sélection incomplète, il vous reste ${d.secondsLeft ?? 10} secondes`, tone: 'warning' };
    case 'INSURANCE_AVAILABLE':
      return { text: 'Assurance disponible, vous êtes à 1 point de la victoire', tone: 'info' };
    default:
      return null;
  }
}
