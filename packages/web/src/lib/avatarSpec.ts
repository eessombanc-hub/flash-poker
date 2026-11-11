/**
 * Avatar personnalisé : un visage composé de huit choix, enregistré dans l'identifiant d'avatar
 * existant (« m » suivi de huit chiffres). Aucune image n'est envoyée au serveur : le code passe
 * la validation actuelle (minuscules, chiffres, 32 caractères au plus) et chaque client dessine
 * le visage lui-même en SVG.
 */

export const AVATAR_PARTS = ['skin', 'hair', 'hairColor', 'eyes', 'mouth', 'accessory', 'outfit', 'background'] as const;
export type AvatarPart = (typeof AVATAR_PARTS)[number];
export type AvatarSpec = Record<AvatarPart, number>;

/** Nombre d'options par élément. */
export const PART_COUNTS: Record<AvatarPart, number> = {
  skin: 8,
  hair: 8,
  hairColor: 8,
  eyes: 6,
  mouth: 6,
  accessory: 8,
  outfit: 8,
  background: 8,
};

export const SKIN_TONES = ['#f6d9bf', '#eec29d', '#d9a679', '#c58a5c', '#a96b43', '#8a5130', '#6b3b22', '#4a2916'] as const;
export const HAIR_COLORS = ['#1b1511', '#3b2417', '#6a4126', '#a8692f', '#d9a441', '#c4c7cc', '#b4361f', '#3a5fa8'] as const;
export const OUTFIT_COLORS = ['#2f5d4a', '#25407a', '#7c1520', '#c9a25a', '#3a4652', '#efe8d8', '#5b2a86', '#15181c'] as const;
export const BACKGROUND_COLORS = ['#e6cf9c', '#3fae86', '#6f9be0', '#e0707a', '#f0b25c', '#9aa7b4', '#c7a8e8', '#2a2f36'] as const;

export const DEFAULT_SPEC: AvatarSpec = { skin: 1, hair: 1, hairColor: 1, eyes: 0, mouth: 0, accessory: 0, outfit: 0, background: 0 };

const CODE = /^m[0-7]{8}$/;

export function isCustomAvatar(code: string | null | undefined): code is string {
  return typeof code === 'string' && parseAvatar(code) !== null;
}

/** Lit un identifiant d'avatar personnalisé ; renvoie null pour un préréglage ou un code invalide. */
export function parseAvatar(code: string | null | undefined): AvatarSpec | null {
  if (typeof code !== 'string' || !CODE.test(code)) return null;
  const spec = {} as AvatarSpec;
  for (let i = 0; i < AVATAR_PARTS.length; i++) {
    const part = AVATAR_PARTS[i]!;
    const n = Number(code[i + 1]);
    if (n >= PART_COUNTS[part]) return null;
    spec[part] = n;
  }
  return spec;
}

export function encodeAvatar(spec: AvatarSpec): string {
  return 'm' + AVATAR_PARTS.map((p) => String(Math.min(Math.max(Math.trunc(spec[p]), 0), PART_COUNTS[p] - 1))).join('');
}

/** Tirage au hasard ; la fonction aléatoire est injectable pour les tests. */
export function randomSpec(rand: () => number = Math.random): AvatarSpec {
  const spec = {} as AvatarSpec;
  for (const p of AVATAR_PARTS) spec[p] = Math.min(PART_COUNTS[p] - 1, Math.floor(rand() * PART_COUNTS[p]));
  return spec;
}

/** Assombrit une couleur #rrggbb (pour le cou et les ombres). */
export function shade(hex: string, amount = 0.82): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * amount).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
