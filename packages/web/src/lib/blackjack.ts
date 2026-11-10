/**
 * Utilitaires du module Blackjack côté navigateur : affichage des totaux, préférences locales, vérification de
 * l'équité. Aucune règle de jeu ici : le serveur reste seul juge (distribution, actions, résultats).
 */
import { tr, trp } from '../i18n';
import type { HandResult, TableRules } from './types';

export type Speed = 'lente' | 'normale' | 'rapide';
export type Pedagogy = 'libre' | 'indices' | 'coach';

export interface BjPrefs {
  speed: Speed;
  pedagogy: Pedagogy;
  table: string;
  bet: number;
  /** Règles de la table libre (les autres tables ont des règles figées côté serveur). */
  rules: TableRules;
}

export const SPEED_MS: Record<Speed, number> = { lente: 900, normale: 520, rapide: 220 };
export const SPEEDS: readonly Speed[] = ['lente', 'normale', 'rapide'];
export const PEDAGOGIES: readonly { id: Pedagogy; label: string; text: string }[] = [
  { id: 'libre', get label() { return tr('bj.ped.libre'); }, get text() { return tr('bj.ped.libre.text'); } },
  { id: 'indices', get label() { return tr('bj.ped.indices'); }, get text() { return tr('bj.ped.indices.text'); } },
  { id: 'coach', get label() { return tr('bj.ped.coach'); }, get text() { return tr('bj.ped.coach.text'); } },
];

const KEY = 'poker.blackjack.v1';
export const DEFAULT_RULES: TableRules = { decks: 6, dealerHitsSoft17: false, blackjackPays: '3:2', doubleOn: 'any', doubleAfterSplit: true, maxHands: 4, resplitAces: false, surrender: true };
export const DEFAULT_PREFS: BjPrefs = { speed: 'normale', pedagogy: 'libre', table: 'decouverte', bet: 10, rules: DEFAULT_RULES };

function cleanRules(r: Partial<TableRules> | undefined): TableRules {
  const d = DEFAULT_RULES;
  if (!r || typeof r !== 'object') return { ...d };
  const int = (v: unknown, lo: number, hi: number, f: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : f);
  return {
    decks: int(r.decks, 1, 8, d.decks),
    dealerHitsSoft17: typeof r.dealerHitsSoft17 === 'boolean' ? r.dealerHitsSoft17 : d.dealerHitsSoft17,
    blackjackPays: r.blackjackPays === '6:5' ? '6:5' : '3:2',
    doubleOn: r.doubleOn === '9-11' || r.doubleOn === '10-11' ? r.doubleOn : 'any',
    doubleAfterSplit: typeof r.doubleAfterSplit === 'boolean' ? r.doubleAfterSplit : d.doubleAfterSplit,
    maxHands: int(r.maxHands, 2, 4, d.maxHands),
    resplitAces: typeof r.resplitAces === 'boolean' ? r.resplitAces : d.resplitAces,
    surrender: typeof r.surrender === 'boolean' ? r.surrender : d.surrender,
  };
}

export function loadPrefs(): BjPrefs {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BjPrefs>;
    return {
      speed: SPEEDS.includes(s.speed as Speed) ? (s.speed as Speed) : DEFAULT_PREFS.speed,
      pedagogy: PEDAGOGIES.some((p) => p.id === s.pedagogy) ? (s.pedagogy as Pedagogy) : DEFAULT_PREFS.pedagogy,
      table: typeof s.table === 'string' && s.table ? s.table : DEFAULT_PREFS.table,
      bet: Number.isInteger(s.bet) && (s.bet as number) > 0 ? (s.bet as number) : DEFAULT_PREFS.bet,
      rules: cleanRules(s.rules),
    };
  } catch {
    return { ...DEFAULT_PREFS, rules: { ...DEFAULT_RULES } };
  }
}
export function savePrefs(p: BjPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : les préférences ne sont simplement pas conservées */
  }
}

/** Valeur d'une carte au Blackjack (code « As », « Td »…) : l'As vaut 11 ici, l'ajustement se fait dans `handTotal`. */
function value(code: string): number {
  const r = code[0]!;
  if (r === 'A') return 11;
  if ('TJQK'.includes(r)) return 10;
  return Number(r);
}

/** Total affiché d'une main (As compté 11 tant que cela ne dépasse pas 21). Purement visuel. */
export function handTotal(cards: readonly (string | null)[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (!c) continue;
    total += value(c);
    if (c[0] === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function totalText(cards: readonly (string | null)[]): string {
  const { total, soft } = handTotal(cards.filter(Boolean));
  if (total > 21) return tr('bj.bust', { total });
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
}

export const RESULT_LABEL: Record<HandResult, string> = {
  get BLACKJACK() { return tr('bj.res.BLACKJACK'); },
  get WIN() { return tr('bj.res.WIN'); },
  get PUSH() { return tr('bj.res.PUSH'); },
  get LOSE() { return tr('bj.res.LOSE'); },
  get BUST() { return tr('bj.res.BUST'); },
  get SURRENDER() { return tr('bj.res.SURRENDER'); },
};
export const RESULT_TONE: Record<HandResult, 'gold' | 'green' | 'neutral' | 'red' | 'amber'> = {
  BLACKJACK: 'gold',
  WIN: 'green',
  PUSH: 'neutral',
  LOSE: 'red',
  BUST: 'red',
  SURRENDER: 'amber',
};

export const ACTION_LABEL = {
  get HIT() { return tr('bj.act.HIT'); },
  get STAND() { return tr('bj.act.STAND'); },
  get DOUBLE() { return tr('bj.act.DOUBLE'); },
  get SPLIT() { return tr('bj.act.SPLIT'); },
  get SURRENDER() { return tr('bj.act.SURRENDER'); },
};

/** Valeurs des jetons de mise proposés (couleurs de casino). */
export const CHIP_VALUES = [5, 25, 100, 500] as const;
export const CHIP_COLORS: Record<number, string> = { 5: '#b3282d', 25: '#2f7d4f', 100: '#23252b', 500: '#6d3c93' };

/** Nom lisible d'un niveau de doublement. */
export const DOUBLE_LABEL = {
  get any() { return tr('bj.dbl.any'); },
  get '9-11'() { return tr('bj.dbl.9-11'); },
  get '10-11'() { return tr('bj.dbl.10-11'); },
};

export const paysText = (p: string): string => tr(p === '3:2' ? 'bj.pays.32' : 'bj.pays.65');
export const decksText = (n: number): string => trp('bj.decks', n);
/** Règles d'une table en une ligne. */
export function rulesSummary(r: TableRules): string {
  return tr('bj.rules', {
    decks: decksText(r.decks),
    dealer: tr(r.dealerHitsSoft17 ? 'bj.dealer.hits' : 'bj.dealer.stands'),
    pays: paysText(r.blackjackPays),
    double: DOUBLE_LABEL[r.doubleOn].toLowerCase(),
    surrender: tr(r.surrender ? 'bj.surrender' : 'bj.nosurrender'),
  });
}

/**
 * Vérification de l'équité : l'engagement publié avant la manche doit être le SHA-256 de « domaine:commit:graine ».
 * (Même calcul que le moteur ; refait ici avec l'API Web Crypto pour que la preuve soit indépendante du serveur.)
 */
export async function commitmentOf(seed: string): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(`flashpoker-blackjack-v1:commit:${seed}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null; // contexte non sécurisé : pas de Web Crypto
  }
}
export async function verifyCommitment(seed: string, commitment: string): Promise<boolean | null> {
  const h = await commitmentOf(seed);
  return h === null ? null : h === commitment;
}
