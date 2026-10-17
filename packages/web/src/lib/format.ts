const EUR_WHOLE = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const EUR_CENTS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centimes → « 20 € » ou « 12,50 € » (jamais « 12,5 € »). Les montants sont des entiers en centimes partout ailleurs. */
export function formatEuros(cents: number): string {
  return (cents % 100 === 0 ? EUR_WHOLE : EUR_CENTS).format(cents / 100);
}

export function formatSignedEuros(cents: number): string {
  if (cents === 0) return formatEuros(0);
  return `${cents > 0 ? '+' : '−'}${formatEuros(Math.abs(cents))}`;
}

const FRACTIONS: Record<number, string> = { 60: '1', 30: '½', 20: '⅓', 15: '¼', 12: '⅕', 10: '⅙' };

/** Points de ligne du 6-3 : unités de 1/60 → « 1 », « ½ », « ⅓ »… */
export function formatLinePoints(units: number, scale = 60): string {
  if (scale === 60 && FRACTIONS[units]) return FRACTIONS[units]!;
  const v = units / scale;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}

export function initials(nickname: string): string {
  const parts = nickname.trim().split(/[\s_.'-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : nickname.trim().slice(0, 2);
  return letters.toUpperCase();
}

export const pointsLabel = (n: number): string => `${n} point${n > 1 ? 's' : ''}`;

export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « de » + nom avec élision : « d’Emeric », « d’Alice », « de Bob ». */
export function deNom(name: string): string {
  return /^[aeiouhàâäéèêëîïôöùûüœæ]/i.test(name.trim()) ? `d’${name}` : `de ${name}`;
}
