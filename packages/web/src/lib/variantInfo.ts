import type { VariantId } from './types';

/**
 * Données éditoriales des fiches variantes : famille, difficulté, durée estimée d'une manche et nombre maximal de
 * joueurs. Ce sont des repères de présentation (pas des statistiques) ; le maximum de joueurs reprend la règle du moteur
 * (Fermé 2 changes et Le 10 jusqu'à 5 joueurs, les autres jusqu'à 6).
 */
export type VariantFamily = 'omaha' | 'holdem' | 'closed';
export interface VariantMeta {
  family: VariantFamily;
  /** 1 accessible, 2 intermédiaire, 3 exigeant. */
  difficulty: 1 | 2 | 3;
  /** Durée moyenne estimée d'une manche, en minutes. */
  minutes: number;
  minPlayers: number;
  maxPlayers: number;
}

export const VARIANT_META: Record<VariantId, VariantMeta> = {
  CLOSED_1: { family: 'closed', difficulty: 1, minutes: 2, minPlayers: 2, maxPlayers: 6 },
  CLOSED_2: { family: 'closed', difficulty: 1, minutes: 3, minPlayers: 2, maxPlayers: 5 },
  AVIATION: { family: 'holdem', difficulty: 2, minutes: 3, minPlayers: 2, maxPlayers: 6 },
  AVIA_6: { family: 'holdem', difficulty: 2, minutes: 4, minPlayers: 2, maxPlayers: 6 },
  V6_1: { family: 'omaha', difficulty: 2, minutes: 4, minPlayers: 2, maxPlayers: 6 },
  MORPION: { family: 'holdem', difficulty: 2, minutes: 4, minPlayers: 2, maxPlayers: 6 },
  V6_3: { family: 'omaha', difficulty: 3, minutes: 5, minPlayers: 2, maxPlayers: 6 },
  LE10: { family: 'holdem', difficulty: 3, minutes: 5, minPlayers: 2, maxPlayers: 5 },
};
