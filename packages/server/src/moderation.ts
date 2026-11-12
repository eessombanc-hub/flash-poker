/**
 * Modération de base du texte libre (chat) et des pseudos. Volontairement limitée aux injures et aux termes haineux
 * sans ambiguïté : le but est d'éviter le pire entre inconnus, pas de censurer le langage courant d'une table de
 * poker. Les mots fréquents mais anodins entre amis (« putain », « merde »…) ne sont pas touchés.
 */

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Minuscules, sans accents, chiffres usuels remplacés, lettres seules, lettres répétées réduites à une. */
export function fold(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0134578@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
  return base.replace(/(.)\1+/g, '$1');
}

/** Termes assez distinctifs pour être repérés à l'intérieur d'un mot ou d'un pseudo. */
const INSIDE = ['connard', 'connasse', 'salope', 'encule', 'bougnoule', 'bamboula', 'nigger', 'nigga', 'faggot', 'motherfucker', 'bitch', 'hitler', 'tarlouze'].map(fold);
/** Termes courts ou ambigus : repérés seulement lorsqu'ils forment un mot entier (avec ou sans pluriel). */
const WHOLE = new Set(['pute', 'fdp', 'ntm', 'pede', 'tapette', 'negre', 'negresse', 'negro', 'youpin', 'youpine', 'cunt', 'whore', 'slut', 'nazi', 'pd'].map(fold));

const plural = (w: string): string => w.replace(/(es|s)$/, '');

/** La salopette n'est pas une injure : on l'écarte avant de chercher « salope ». */
const hasInside = (folded: string): boolean => {
  const f = folded.replace(/salopete/g, '');
  return INSIDE.some((t) => f.includes(t));
};

function offensiveWord(word: string): boolean {
  const f = fold(word);
  if (f.length < 2) return false;
  return WHOLE.has(f) || WHOLE.has(plural(f)) || hasInside(f);
}

/** Remplace chaque mot injurieux par son initiale suivie d'astérisques. */
export function maskOffensive(text: string): string {
  return text.replace(/[\p{L}\p{N}@$]+/gu, (w) => (offensiveWord(w) ? `${w[0]}${'*'.repeat(Math.max(2, w.length - 1))}` : w));
}

/** Pseudo refusé : injure explicite, seule ou à l'intérieur du pseudo. */
export function isOffensiveName(name: string): boolean {
  if (hasInside(fold(name))) return true;
  return name.split(/[\s_.'-]+/).some((w) => offensiveWord(w));
}

export const OFFENSIVE_NAME_MESSAGE = 'Ce pseudo n’est pas accepté';
