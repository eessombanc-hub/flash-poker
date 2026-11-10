import { tr, trp } from '../i18n';
import { formatChips, formatLinePoints } from './format';
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
      return { text: tr('ev.started'), tone: 'info' };
    case 'VARIANT_CHOSEN':
      return {
        text: tr(d.auto ? 'ev.variant.auto' : 'ev.variant', { variant: variantName(d.variant as VariantId), who: who(d.chooser) }),
        tone: 'info',
      };
    case 'BOARD_REVEALED':
      return d.line ? { text: tr('ev.river', { line: d.line }), tone: 'info' } : null;
    case 'SIDE_BETS_LOCKED': {
      const n = Array.isArray(d.pools) ? d.pools.length : 0;
      return { text: n === 0 ? tr('ev.sb.none') : trp('ev.sb.pools', n), tone: 'info' };
    }
    case 'SIDE_BET_RESOLVED': {
      const winners = (d.winners as string[]) ?? [];
      if (d.refunded || winners.length === 0) return { text: tr('ev.sb.refund', { line: d.line }), tone: 'warning' };
      const pot = Number(d.amount ?? 0) * ((d.members as string[] | undefined)?.length ?? 0);
      return { text: trp('ev.sb.won', winners.length, { line: d.line, names: winners.map(who).join(tr('ev.and')), pot: formatChips(pot) }), tone: 'success' };
    }
    case 'TEATS_MOVED':
      return { text: tr('ev.teats', { line: Number(d.line) + 1 }), tone: 'info' };
    case 'LINE_RESOLVED': {
      const winners = (d.winners as string[]) ?? [];
      if (winners.length === 0) return { text: tr('ev.line.none', { line: d.line }), tone: 'warning' };
      const names = winners.map(who).join(tr('ev.and'));
      return {
        text: trp('ev.line.won', winners.length, { line: d.line, names, points: formatLinePoints(d.unitsEach) }),
        tone: 'success',
      };
    }
    case 'PLAYER_FOLDED':
      return { text: tr('ev.folded', { who: who(d.player) }), tone: 'warning' };
    case 'CARD_REVEALED':
      return { text: tr('ev.card', { who: who(d.player) }), tone: 'info' };
    case 'REVEAL_ORDER_RECOMPUTED':
      return { text: tr('ev.order', { who: who(d.next), reason: NEXT_REASON_TEXT[d.reason as NextReason] ?? '' }), tone: 'info' };
    case 'SHOWDOWN':
      return { text: tr('ev.showdown'), tone: 'info' };
    case 'INSURANCE_PROPOSED':
      return { text: tr('ev.ins.proposed', { who: who(d.proposer), partner: who(d.partner) }), tone: 'info' };
    case 'INSURANCE_ACCEPTED': {
      const [a, b] = (d.insurance as { players: [string, string] }).players;
      return { text: tr('ev.ins.accepted', { a: who(a), b: who(b) }), tone: 'success' };
    }
    case 'INSURANCE_DECLINED':
      return { text: tr('ev.ins.declined', { who: who(d.partner) }), tone: 'info' };
    case 'INSURANCE_EXPIRED':
      return { text: tr('ev.ins.expired'), tone: 'info' };
    case 'PLAYER_ADDED':
      return { text: tr('ev.added', { who: who(d.player), pos: d.position }), tone: 'info' };
    case 'PLAYER_EXCLUDED':
      return { text: tr('ev.excluded', { who: who(d.player) }), tone: 'warning' };
    case 'PLAYER_JOINED':
      return { text: tr(d.queued ? 'ev.joined.queued' : 'ev.joined', { who: who(d.player) }), tone: 'info' };
    case 'PLAYER_LEFT':
    case 'PLAYER_REMOVED':
      return { text: tr('ev.left'), tone: 'info' };
    case 'ROOM_CANCELLED':
      return { text: tr('ev.cancelled'), tone: 'warning' };
    case 'ROOM_ABANDONED':
      return { text: tr('ev.abandoned'), tone: 'warning' };
    case 'WARNING':
      return { text: trp('ev.warning', Number(d.secondsLeft ?? 10)), tone: 'warning' };
    case 'INSURANCE_AVAILABLE':
      return { text: tr('ev.ins.available'), tone: 'info' };
    default:
      return null;
  }
}
