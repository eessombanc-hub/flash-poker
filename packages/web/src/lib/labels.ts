import { tr, type Key } from '../i18n';
import type { InsuranceType, NextReason, NextReason10, RoundRecord, VariantId } from './types';

export interface VariantInfo {
  id: VariantId;
  name: string;
  tagline: string;
  description: string;
}

/** Les six variantes, dans l'ordre du cahier des charges. Textes conformes au document de règles v1.1. */
export const VARIANTS: readonly VariantInfo[] = [
  {
    id: 'V6_3',
    get name() { return tr('var.V6_3.name'); },
    get tagline() { return tr('var.V6_3.tagline'); },
    get description() { return tr('var.V6_3.description'); },
  },
  {
    id: 'V6_1',
    get name() { return tr('var.V6_1.name'); },
    get tagline() { return tr('var.V6_1.tagline'); },
    get description() { return tr('var.V6_1.description'); },
  },
  {
    id: 'CLOSED_1',
    get name() { return tr('var.CLOSED_1.name'); },
    get tagline() { return tr('var.CLOSED_1.tagline'); },
    get description() { return tr('var.CLOSED_1.description'); },
  },
  {
    id: 'CLOSED_2',
    get name() { return tr('var.CLOSED_2.name'); },
    get tagline() { return tr('var.CLOSED_2.tagline'); },
    get description() { return tr('var.CLOSED_2.description'); },
  },
  {
    id: 'AVIATION',
    get name() { return tr('var.AVIATION.name'); },
    get tagline() { return tr('var.AVIATION.tagline'); },
    get description() { return tr('var.AVIATION.description'); },
  },
  {
    id: 'AVIA_6',
    get name() { return tr('var.AVIA_6.name'); },
    get tagline() { return tr('var.AVIA_6.tagline'); },
    get description() { return tr('var.AVIA_6.description'); },
  },
  {
    id: 'MORPION',
    get name() { return tr('var.MORPION.name'); },
    get tagline() { return tr('var.MORPION.tagline'); },
    get description() { return tr('var.MORPION.description'); },
  },
  {
    id: 'LE10',
    get name() { return tr('var.LE10.name'); },
    get tagline() { return tr('var.LE10.tagline'); },
    get description() { return tr('var.LE10.description'); },
  },
];

export const variantName = (id: VariantId): string => VARIANTS.find((v) => v.id === id)?.name ?? id;


/** Libellés des neuf catégories (tableau dont chaque case suit la langue active). */
export const CATEGORY_LABELS: readonly string[] = (() => {
  const a: string[] = [];
  for (let i = 0; i < 9; i++) Object.defineProperty(a, i, { enumerable: true, get: () => tr(`cat.${i}` as Key) });
  return a;
})();

type RankForm = 'sg' | 'pl' | 'of';
function rankText(r: number, form: RankForm): string {
  return r >= 11 ? tr(`rank.${form}.${r}` as Key) : tr(`rank.${form}.n` as Key, { n: r });
}

/**
 * Combinaison en clair à partir du rang complet d'une main (catégorie × 15⁵ + hauteurs en base 15, voir le moteur) :
 * « Brelan de 3 », « Double paire d’as et de 6 », « Full aux rois par les 3 »… null si le rang n'est pas un rang valide.
 */
export function describeRank(rank: number): string | null {
  if (!Number.isInteger(rank) || rank < 0) return null;
  const category = Math.floor(rank / 15 ** 5);
  const k: number[] = [];
  let rest = rank % 15 ** 5;
  for (let i = 0; i < 5; i++) {
    k.unshift(rest % 15);
    rest = Math.floor(rest / 15);
  }
  const [a = 0, b = 0] = k;
  switch (category) {
    case 0: return a ? tr('hd.high', { a: rankText(a, 'sg') }) : null;
    case 1: return tr('hd.pair', { a: rankText(a, 'of') });
    case 2: return tr('hd.two', { a: rankText(a, 'of'), b: rankText(b, 'of') });
    case 3: return tr('hd.trips', { a: rankText(a, 'of') });
    case 4: return tr('hd.straight', { a: rankText(a, 'sg') });
    case 5: return tr('hd.flush', { a: rankText(a, 'sg') });
    case 6: return tr('hd.full', { a: rankText(a, 'pl'), b: rankText(b, 'pl') });
    case 7: return tr('hd.quads', { a: rankText(a, 'of') });
    case 8: return a === 14 ? tr('hd.sfroyal') : tr('hd.sf', { a: rankText(a, 'sg') });
    default: return null;
  }
}

export const categoryLabel = (category: number): string => (category >= 0 && category <= 8 ? tr(`cat.${category}` as Key) : '—');

const reasons = <K extends string>(keys: readonly K[]): Record<K, string> => {
  const o = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(o, k, { enumerable: true, get: () => tr(`reason.${k}` as Key) });
  return o;
};

export const NEXT_REASON_TEXT: Record<NextReason, string> = reasons<NextReason>(['LOWEST_SIXTH_CARD', 'WEAKEST', 'TIE_LAST_REVEALER', 'TIE_POSITION']);

/** Le 10 : mêmes raisons que le 6-1, sans plateau commun (comparaison sur les seules cartes visibles). */
export const NEXT_REASON_TEXT_10: Record<NextReason10, string> = reasons<NextReason10>(['LOWEST_FIRST_CARD', 'WEAKEST', 'TIE_LAST_REVEALER', 'TIE_POSITION']);

export const INSURANCE_LABELS: Record<InsuranceType, { name: string; short: string }> = {
  LOSER_NOT_PAYING: { get name() { return tr('ins.lnp.name'); }, get short() { return tr('ins.lnp.short'); } },
  SPLIT_50_50: { get name() { return tr('ins.split.name'); }, get short() { return tr('ins.split.short'); } },
};

export const VICTORY_LABELS = {
  get SCORE() { return tr('victory.score'); },
  get STRAIGHT_FLUSH_63() { return tr('victory.sf63'); },
};

/**
 * Ce qui a fait gagner la manche, en clair : « Brelan », « Quinte flush à la ligne 2 », « Ligne 1 : Couleur ·
 * Ligne 3 : Full »… Uniquement des faits publics de fin de manche (résumé enregistré par le serveur).
 * null quand la manche n'a pas de vainqueur ou qu'elle date d'avant l'enregistrement du résumé.
 */
export function winningCombination(record: RoundRecord): string | null {
  const a = record.award;
  if (a.kind === 'INSTANT_VICTORY') return tr('win.sf', { line: a.line });
  if (a.kind !== 'POINTS') return null;
  const s = record.summary;
  if (!s) return null;
  if (s.tiebreak) return tr('win.tiebreak', { cat: categoryLabel(s.tiebreak.category) });
  if (s.byFold) return tr('win.fold');
  const hand = s.hands?.[a.winner];
  if (hand) return (hand.rank !== undefined ? describeRank(hand.rank) : null) ?? categoryLabel(hand.category);
  if (s.lines) {
    const won = s.lines.filter((l) => l.winners.includes(a.winner));
    if (won.length === 0) return null;
    return won.map((l) => {
      const d = l.designations[a.winner];
      return tr('win.line', { line: l.line, cat: d ? categoryLabel(d.category).toLowerCase() : tr('win.nodes') });
    }).join('. ');
  }
  return null;
}

/** Cartes de la combinaison gagnante quand elles sont connues (abattage ou départage), sinon []. */
export function winningCards(record: RoundRecord): string[] {
  const a = record.award;
  if (a.kind !== 'POINTS' || !record.summary) return [];
  if (record.summary.tiebreak) return record.summary.tiebreak.cards;
  const h = record.summary.hands?.[a.winner];
  return h?.best ?? h?.cards ?? [];
}
