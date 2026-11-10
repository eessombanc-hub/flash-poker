/** Règles d'une table de Blackjack. Aucune règle « truquée » : chaque variante est connue et affichée au joueur. */
export type DoubleRule = 'any' | '9-11' | '10-11';

export interface TableRules {
  /** Nombre de jeux de 52 cartes (1 à 8). */
  decks: number;
  /** Le croupier tire sur un 17 « soft » (As compté 11). Défavorable au joueur. */
  dealerHitsSoft17: boolean;
  /** Gain d'un Blackjack naturel : 3 contre 2 (classique) ou 6 contre 5 (défavorable). */
  blackjackPays: '3:2' | '6:5';
  /** Doublement autorisé sur : tout total de 2 cartes, 9 à 11, ou 10 et 11. */
  doubleOn: DoubleRule;
  /** Doublement autorisé après une séparation. */
  doubleAfterSplit: boolean;
  /** Nombre maximal de mains après séparations (2 à 4). */
  maxHands: number;
  /** Séparation de nouveau possible pour les As. */
  resplitAces: boolean;
  /** Abandon tardif (après vérification du Blackjack du croupier) : récupère la moitié de la mise. */
  surrender: boolean;
}

export interface TableLimits {
  minBet: number;
  maxBet: number;
}

export interface TablePreset {
  id: string;
  name: string;
  description: string;
  rules: TableRules;
  limits: TableLimits;
  /** Niveau minimal du joueur pour s'y asseoir (progression). */
  minLevel: number;
}

export const DEFAULT_RULES: TableRules = {
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPays: '3:2',
  doubleOn: 'any',
  doubleAfterSplit: true,
  maxHands: 4,
  resplitAces: false,
  surrender: true,
};

/** Tables proposées. `libre` est personnalisable ; les autres sont figées, avec des règles réelles de casino. */
export const TABLE_PRESETS: readonly TablePreset[] = [
  {
    id: 'decouverte',
    name: 'Découverte',
    description: '6 jeux, le croupier reste sur 17, Blackjack payé 3 contre 2, abandon autorisé. Mises modestes.',
    rules: { ...DEFAULT_RULES },
    limits: { minBet: 5, maxBet: 100 },
    minLevel: 1,
  },
  {
    id: 'classique',
    name: 'Classique',
    description: '4 jeux, croupier sur tous les 17, Blackjack 3 contre 2, doublement après séparation.',
    rules: { ...DEFAULT_RULES, decks: 4, surrender: false },
    limits: { minBet: 10, maxBet: 250 },
    minLevel: 1,
  },
  {
    id: 'carte-unique',
    name: 'Jeu unique',
    description: '1 seul jeu. Plus d’information, mais Blackjack payé 6 contre 5 et doublement sur 9 à 11 seulement.',
    rules: { ...DEFAULT_RULES, decks: 1, blackjackPays: '6:5', doubleOn: '9-11', doubleAfterSplit: false, surrender: false, maxHands: 2 },
    limits: { minBet: 5, maxBet: 100 },
    minLevel: 2,
  },
  {
    id: 'atlantic',
    name: 'Atlantic',
    description: '8 jeux, le croupier tire sur 17 soft, abandon autorisé. Table exigeante.',
    rules: { ...DEFAULT_RULES, decks: 8, dealerHitsSoft17: true },
    limits: { minBet: 25, maxBet: 500 },
    minLevel: 4,
  },
  {
    id: 'haut-niveau',
    name: 'Haut niveau',
    description: '2 jeux, Blackjack 3 contre 2, abandon autorisé, séparation des As répétée. Mises élevées.',
    rules: { ...DEFAULT_RULES, decks: 2, resplitAces: true },
    limits: { minBet: 100, maxBet: 2000 },
    minLevel: 7,
  },
];

export const FREE_TABLE_ID = 'libre';
export const FREE_TABLE_LIMITS: TableLimits = { minBet: 1, maxBet: 1000 };

export function validateRules(r: TableRules): string | null {
  if (!Number.isInteger(r.decks) || r.decks < 1 || r.decks > 8) return 'Nombre de jeux de 1 à 8';
  if (typeof r.dealerHitsSoft17 !== 'boolean' || typeof r.doubleAfterSplit !== 'boolean' || typeof r.resplitAces !== 'boolean' || typeof r.surrender !== 'boolean') return 'Règles invalides';
  if (r.blackjackPays !== '3:2' && r.blackjackPays !== '6:5') return 'Gain du Blackjack invalide';
  if (r.doubleOn !== 'any' && r.doubleOn !== '9-11' && r.doubleOn !== '10-11') return 'Règle de doublement invalide';
  if (!Number.isInteger(r.maxHands) || r.maxHands < 2 || r.maxHands > 4) return 'Mains maximales de 2 à 4';
  return null;
}

/** Table (préréglage ou libre) → règles et limites ; null si l'identifiant est inconnu. */
export function resolveTable(id: string, free?: TableRules): { rules: TableRules; limits: TableLimits; minLevel: number } | null {
  if (id === FREE_TABLE_ID) {
    const rules = { ...DEFAULT_RULES, ...(free ?? {}) };
    return validateRules(rules) === null ? { rules, limits: FREE_TABLE_LIMITS, minLevel: 1 } : null;
  }
  const p = TABLE_PRESETS.find((t) => t.id === id);
  return p ? { rules: { ...p.rules }, limits: p.limits, minLevel: p.minLevel } : null;
}
