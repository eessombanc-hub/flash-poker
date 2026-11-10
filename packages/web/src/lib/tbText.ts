/**
 * LE TABLEAU — textes localisés calculés côté navigateur à partir de données structurées (codes de cartes, catégories) :
 * noms de combinaisons, libellés de colonnes en cours de construction, conseils, erreurs. Le serveur ne fournit que des
 * faits ; la langue est choisie ici.
 */
import type { I18n, Key } from '../i18n';
import { ApiError } from './api';
import type { ColumnHand } from './types';
import { SERVER_MESSAGES } from './srvMessages';

type T = Pick<I18n, 't' | 'tp' | 'lang'>;

const RANK_CHAR: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
export const rankOf = (code: string): number => RANK_CHAR[code[0] ?? ''] ?? 0;
const SUITS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

const sing = (i: T, r: number): string => (r >= 11 ? i.t(`rank.s.${r}` as Key) : String(r));
const plur = (i: T, r: number): string => (r >= 11 ? i.t(`rank.p.${r}` as Key) : `${r}${i.t('rank.numPlural')}`);

/** Corrige les élisions et accords du français (« de as » → « d’as », « au dame » → « à la dame »). */
function polish(i: T, s: string): string {
  if (i.lang !== 'fr') return s;
  return s
    .replace(/\bde as\b/g, 'd’as')
    .replace(/\bQuinte (flush )?au as\b/g, (_m, f: string | undefined) => `Quinte ${f ?? ''}à l’as`)
    .replace(/\bQuinte (flush )?au dame\b/g, (_m, f: string | undefined) => `Quinte ${f ?? ''}à la dame`)
    .replace(/Couleur, dame haut/, 'Couleur, dame haute');
}

/** Nom court d'une carte : « R♥ » devient « roi ♥ » (valeur dans la langue choisie, symbole de couleur). */
export function cardName(i: T, code: string): string {
  const r = rankOf(code);
  const name = sing(i, r);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${SUITS[code[1] ?? ''] ?? ''}`.trim();
}

/** Libellé d'une colonne complète à partir de la main évaluée par le serveur (catégorie + cartes ordonnées). */
export function handLabel(i: T, h: Pick<ColumnHand, 'category' | 'cards'>): string {
  const r = (n: number): number => rankOf(h.cards[n]!);
  const { t } = i;
  const s0 = sing(i, r(0));
  switch (h.category) {
    case 0:
      return polish(i, t('hand.high', { s: s0 }));
    case 1:
      return polish(i, t('hand.pair', { p: plur(i, r(0)) }));
    case 2:
      return polish(i, t('hand.twoPair', { p1: plur(i, r(0)), p2: plur(i, r(2)) }));
    case 3:
      return polish(i, t('hand.trips', { p: plur(i, r(0)) }));
    case 4:
      return polish(i, r(0) === 5 ? t('hand.wheel') : t('hand.straight', { s: s0 }));
    case 5:
      return polish(i, t('hand.flush', { s: s0 }));
    case 6:
      return polish(i, t('hand.full', { p1: plur(i, r(0)), p2: plur(i, r(3)) }));
    case 7:
      return polish(i, t('hand.quads', { p: plur(i, r(0)) }));
    case 8:
      return polish(i, r(0) === 5 ? t('hand.wheel') : t('hand.sflush', { s: s0 }));
    default:
      return t('hand.royal');
  }
}

/** Libellé d'une colonne en cours de construction (miroir de `describePartial` du moteur). */
export function partialLabel(i: T, codes: readonly string[]): string {
  const { t } = i;
  if (codes.length === 0) return t('hand.empty');
  const ranks = codes.map(rankOf);
  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = groups[0]!;
  const second = groups[1];
  if (top[1] === 4) return polish(i, t('hand.quads', { p: plur(i, top[0]) }));
  if (top[1] === 3) return polish(i, second?.[1] === 2 ? t('hand.full', { p1: plur(i, top[0]), p2: plur(i, second[0]) }) : t('hand.trips', { p: plur(i, top[0]) }));
  if (top[1] === 2) return polish(i, second?.[1] === 2 ? t('hand.twoPair', { p1: plur(i, top[0]), p2: plur(i, second[0]) }) : t('hand.pair', { p: plur(i, top[0]) }));
  if (codes.length >= 2 && codes.every((c) => c[1] === codes[0]![1])) return t('hand.suited', { n: codes.length });
  const uniq = [...new Set(ranks)];
  if (uniq.length >= 3) {
    for (let lo = 1; lo <= 10; lo++) {
      if (uniq.every((x) => (x >= lo && x <= lo + 4) || (x === 14 && lo === 1))) return t('hand.close', { n: uniq.length });
    }
  }
  return polish(i, t('hand.high', { s: sing(i, Math.max(...uniq)) }));
}

/** Libellé d'une colonne : complète (évaluée) ou partielle. */
export function columnLabel(i: T, codes: readonly string[], made: ColumnHand | null | undefined): string {
  return made ? handLabel(i, made) : partialLabel(i, codes);
}

export interface AdviceData {
  col: number;
  card: string;
  kind: 'improve' | 'empty' | 'dump';
  after: ColumnHand | null;
}
export function adviceText(i: T, a: AdviceData & { afterCodes?: readonly string[] }, fromHand: boolean): string {
  const params = {
    card: cardName(i, a.card),
    src: fromHand ? i.t('advice.fromHand') : '',
    c: a.col + 1,
    result: a.afterCodes ? partialLabel(i, a.afterCodes) : a.after ? handLabel(i, a.after) : '',
  };
  return i.t(a.kind === 'improve' ? 'advice.improve' : a.kind === 'empty' ? 'advice.empty' : 'advice.dump', params);
}

const GENERIC = new Set(['BAD_REQUEST', 'NOT_FOUND', 'FORBIDDEN', 'RATE_LIMITED', 'HTTP', 'ERROR']);

function serverMessage(i: T, message: string): string | null {
  for (const [re, key, names] of SERVER_MESSAGES) {
    const m = re.exec(message);
    if (!m) continue;
    const args: Record<string, string> = {};
    names.forEach((n, k) => { args[n] = m[k + 1] ?? ''; });
    return i.t(key as Key, args);
  }
  return null;
}

/** Message d'erreur localisé : code de règle, sinon code HTTP, sinon réseau ; repli sur le texte du serveur. */
export function errorText(i: T, e: unknown, fallback?: string): string {
  if (e instanceof ApiError) {
    const code = e.ruleCode ?? e.code;
    // Un code générique (requête invalide, introuvable…) cache souvent un message plus précis du serveur.
    const precise = !e.ruleCode && GENERIC.has(e.code) && e.message;
    if (precise) {
      if (i.lang === 'fr') return e.message;
      const known = serverMessage(i, e.message);
      if (known) return known;
    }
    const params = { code: /TB-[A-Z2-9]{4}/.exec(e.message)?.[0] ?? '' };
    for (const c of [e.ruleCode, e.code]) {
      const key = `err.${c}` as Key;
      if (c && i.t(key) !== key) return i.t(key, params);
    }
    if (i.lang === 'fr' || !code) return e.message || fallback || i.t('err.generic');
    return serverMessage(i, e.message) ?? fallback ?? i.t('err.generic');
  }
  return fallback ?? i.t('err.NETWORK');
}
