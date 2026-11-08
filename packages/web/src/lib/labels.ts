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
    name: '6-3',
    tagline: 'Omaha en trois lignes',
    description:
      '6 cartes privées, flop et turn ouverts, puis trois rivers dévoilées ligne après ligne. À chaque ligne, désignez 2 cartes : aucune aide, 60 secondes. En option : 1 ou 2 tétines qui glissent de ligne en ligne, et des paris extérieurs.',
  },
  {
    id: 'V6_1',
    name: '6-1',
    tagline: 'Omaha à révélations',
    description:
      '5 cartes cachées et 1 visible, plateau de 5 cartes ouvert. Le joueur à la main visible la plus faible retourne une carte, jusqu\u2019au showdown.',
  },
  {
    id: 'CLOSED_1',
    name: 'Poker fermé (1 change)',
    tagline: '5 cartes, un change',
    description: '5 cartes privées. Un change simultané et secret de 0 à 3 cartes, puis showdown.',
  },
  {
    id: 'CLOSED_2',
    name: 'Poker fermé (2 changes)',
    tagline: '5 cartes, deux changes',
    description: '5 cartes privées. Deux changes simultanés et secrets de 0 à 3 cartes, puis showdown. De 2 à 5 joueurs.',
  },
  {
    id: 'AVIATION',
    name: 'Aviation',
    tagline: 'Hold\u2019em à 4 cartes',
    description:
      'Après le flop, jetez 1 carte ; après le turn, jetez 1 carte. Il vous reste 2 cartes. Sans défausse à temps, votre main est couchée.',
  },
  {
    id: 'AVIA_6',
    name: 'Avia 6',
    tagline: 'Hold\u2019em à 6 cartes',
    description:
      'Après le flop, jetez 2 cartes ; après le turn, jetez 2 cartes. Il vous reste 2 cartes. Sans défausse complète à temps, votre main est couchée.',
  },
  {
    id: 'MORPION',
    name: 'Morpion',
    tagline: 'Hold\u2019em en grille 3×3',
    description:
      '4 cartes privées. 9 cartes communes en grille, toutes visibles. Désignez 2 de vos cartes et un alignement (ligne, colonne ou diagonale) : aucune aide, 60 secondes.',
  },
  {
    id: 'LE10',
    name: 'Le 10',
    tagline: 'Hold\u2019em à révélations, sans plateau',
    description:
      '10 cartes privées, sans carte commune. Comme au 6-1, le joueur à la main visible la plus faible retourne une carte, jusqu\u2019au showdown. De 2 à 5 joueurs.',
  },
];

export const variantName = (id: VariantId): string => VARIANTS.find((v) => v.id === id)?.name ?? id;

export const CATEGORY_LABELS = [
  'Carte haute',
  'Paire',
  'Double paire',
  'Brelan',
  'Quinte',
  'Couleur',
  'Full',
  'Carré',
  'Quinte flush',
] as const;
export const categoryLabel = (category: number): string => CATEGORY_LABELS[category] ?? '—';

export const NEXT_REASON_TEXT: Record<NextReason, string> = {
  LOWEST_SIXTH_CARD: 'sixième carte la plus faible',
  WEAKEST: 'main visible la plus faible',
  TIE_LAST_REVEALER: 'égalité : le dernier à révéler rejoue',
  TIE_POSITION: 'égalité : ordre des positions',
};

/** Le 10 : mêmes raisons que le 6-1, sans plateau commun (comparaison sur les seules cartes visibles). */
export const NEXT_REASON_TEXT_10: Record<NextReason10, string> = {
  LOWEST_FIRST_CARD: 'première carte visible la plus faible',
  WEAKEST: 'main visible la plus faible',
  TIE_LAST_REVEALER: 'égalité : le dernier à révéler rejoue',
  TIE_POSITION: 'égalité : ordre des positions',
};

export const INSURANCE_LABELS: Record<InsuranceType, { name: string; short: string }> = {
  LOSER_NOT_PAYING: { name: 'Le perdant ne paye pas', short: 'Perdant non payeur' },
  SPLIT_50_50: { name: 'Partage 50 / 50', short: '50 / 50' },
};

export const VICTORY_LABELS = {
  SCORE: 'Objectif atteint',
  STRAIGHT_FLUSH_63: 'Quinte flush au 6-3 : victoire immédiate',
} as const;

/**
 * Ce qui a fait gagner la manche, en clair : « Brelan », « Quinte flush à la ligne 2 », « Ligne 1 : Couleur ·
 * Ligne 3 : Full »… Uniquement des faits publics de fin de manche (résumé enregistré par le serveur).
 * null quand la manche n'a pas de vainqueur ou qu'elle date d'avant l'enregistrement du résumé.
 */
export function winningCombination(record: RoundRecord): string | null {
  const a = record.award;
  if (a.kind === 'INSTANT_VICTORY') return `Quinte flush à la ligne ${a.line}`;
  if (a.kind !== 'POINTS') return null;
  const s = record.summary;
  if (!s) return null;
  if (s.tiebreak) return `${categoryLabel(s.tiebreak.category)} au Hold’em de départage`;
  if (s.byFold) return 'Tous les autres joueurs se sont couchés';
  const hand = s.hands?.[a.winner];
  if (hand) return categoryLabel(hand.category);
  if (s.lines) {
    const won = s.lines.filter((l) => l.winners.includes(a.winner));
    if (won.length === 0) return null;
    return won.map((l) => {
      const d = l.designations[a.winner];
      return `Ligne ${l.line} : ${d ? categoryLabel(d.category) : '—'}`;
    }).join(' · ');
  }
  return null;
}

/** Cartes de la combinaison gagnante quand elles sont connues (abattage ou départage), sinon []. */
export function winningCards(record: RoundRecord): string[] {
  const a = record.award;
  if (a.kind !== 'POINTS' || !record.summary) return [];
  if (record.summary.tiebreak) return record.summary.tiebreak.cards;
  return record.summary.hands?.[a.winner]?.cards ?? [];
}
