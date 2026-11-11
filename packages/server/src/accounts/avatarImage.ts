import { createHash } from 'node:crypto';

/**
 * Photo de profil : le navigateur recadre et réduit l'image, puis envoie un JPEG de 128 × 128 pixels. Le serveur
 * ne fait confiance à rien : il vérifie la signature du fichier, sa taille et ses dimensions lues dans l'en-tête
 * (une image minuscule en octets mais gigantesque en pixels ferait planter le navigateur des autres joueurs).
 */
export const AVATAR_IMAGE_MAX_BYTES = 48 * 1024;
export const AVATAR_IMAGE_MIN_SIDE = 32;
export const AVATAR_IMAGE_MAX_SIDE = 256;

/** Identifiant d'avatar pointant vers une photo : « i » suivi de 16 chiffres hexadécimaux. */
export const AVATAR_IMAGE_ID = /^i[0-9a-f]{16}$/;

export const isAvatarImageId = (v: unknown): v is string => typeof v === 'string' && AVATAR_IMAGE_ID.test(v);

/** Identifiant lié au propriétaire et au contenu : deux comptes n'en partagent jamais un, et il ne se devine pas. */
export function avatarImageId(userId: string, data: Uint8Array): string {
  return 'i' + createHash('sha256').update(userId).update('\0').update(data).digest('hex').slice(0, 16);
}

/** Dimensions d'un JPEG (lecture de l'en-tête SOF), ou null si le fichier n'est pas un JPEG exploitable. */
export function jpegSize(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1]!;
    while (marker === 0xff && i + 2 < buf.length) {
      i++;
      marker = buf[i + 1]!;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // fin ou début des données avant toute en-tête de taille
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const len = (buf[i + 2]! << 8) | buf[i + 3]!;
    if (len < 2 || i + 2 + len > buf.length) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (len < 8) return null;
      const height = (buf[i + 5]! << 8) | buf[i + 6]!;
      const width = (buf[i + 7]! << 8) | buf[i + 8]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** Vrai si le fichier est un JPEG de taille et de dimensions acceptables pour un avatar. */
export function validAvatarJpeg(buf: Uint8Array): boolean {
  if (buf.length === 0 || buf.length > AVATAR_IMAGE_MAX_BYTES) return false;
  const size = jpegSize(buf);
  if (!size) return false;
  const ok = (n: number): boolean => n >= AVATAR_IMAGE_MIN_SIDE && n <= AVATAR_IMAGE_MAX_SIDE;
  return ok(size.width) && ok(size.height);
}
