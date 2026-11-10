import { currentLang, locale, trp } from '../i18n';
/** Cave : jetons reçus par chaque joueur au début de chaque partie (même valeur que `STARTING_CHIPS` du protocole serveur). */
export const STARTING_CHIPS = 1_000;

const FRACTIONS: Record<number, string> = { 60: '1', 30: '½', 20: '⅓', 15: '¼', 12: '⅕', 10: '⅙' };

/** Points de ligne du 6-3 : unités de 1/60 → « 1 », « ½ », « ⅓ »… */
export function formatLinePoints(units: number, scale = 60): string {
  if (scale === 60 && FRACTIONS[units]) return FRACTIONS[units]!;
  const v = units / scale;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', currentLang() === 'en' ? '.' : ',');
}

export function initials(nickname: string): string {
  const parts = nickname.trim().split(/[\s_.'-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : nickname.trim().slice(0, 2);
  return letters.toUpperCase();
}

export const pointsLabel = (n: number): string => trp('fmt.point', n);

export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « de » + nom avec élision : « d’Emeric », « d’Alice », « de Bob ». */
export function deNom(name: string): string {
  if (currentLang() !== 'fr') return name;
  return /^[aeiouhàâäéèêëîïôöùûüœæ]/i.test(name.trim()) ? `d’${name}` : `de ${name}`;
}

const CHIPS = new Map<string, Intl.NumberFormat>();
const chipsFormat = (): Intl.NumberFormat => {
  const l = locale();
  let f = CHIPS.get(l);
  if (!f) CHIPS.set(l, (f = new Intl.NumberFormat(l, { maximumFractionDigits: 0 })));
  return f;
};
/** Jetons (mises, cagnottes, gains) : « 1 jeton », « 1 250 jetons ». Sans valeur monétaire. */
export function formatChips(n: number): string {
  return trp('fmt.chip', Math.abs(n), { n: chipsFormat().format(n) });
}
export function formatSignedChips(n: number): string {
  if (n === 0) return formatChips(0);
  return `${n > 0 ? '+' : '−'}${formatChips(Math.abs(n))}`;
}
