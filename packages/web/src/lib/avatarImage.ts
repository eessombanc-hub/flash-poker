/**
 * Photo de profil : l'image choisie est recadrée en carré et réduite dans le navigateur (JPEG de 128 pixels),
 * puis envoyée au serveur. Le fichier d'origine ne quitte jamais l'appareil.
 */

/** Identifiant d'avatar pointant vers une photo (« i » et 16 chiffres hexadécimaux). */
export const AVATAR_IMAGE_ID = /^i[0-9a-f]{16}$/;
export const isImageAvatar = (v: string | null | undefined): v is string => typeof v === 'string' && AVATAR_IMAGE_ID.test(v);

let base = '';
/** Adresse du serveur : vide en même origine, sinon celle de `VITE_SERVER_URL`. */
export function setAvatarBase(url: string): void {
  base = url.replace(/\/+$/, '');
}
export const avatarImageUrl = (id: string): string => `${base}/avatars/${id}.jpg`;

export const OUTPUT_SIZE = 128;
export const PREVIEW_SIZE = 192;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** Cadrage : `zoom` ≥ 1, `x` et `y` entre 0 et 1 (0,5 = centré) selon la marge disponible. */
export interface Crop {
  zoom: number;
  x: number;
  y: number;
}
export const CENTERED: Crop = { zoom: 1, x: 0.5, y: 0.5 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Carré découpé dans l'image d'origine. */
export function cropSquare(width: number, height: number, crop: Crop): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height) / clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  return { side, sx: (width - side) * clamp(crop.x, 0, 1), sy: (height - side) * clamp(crop.y, 0, 1) };
}

/** Déplace le cadrage de (dx, dy) pixels de l'aperçu : l'image suit le doigt. */
export function moveCrop(width: number, height: number, crop: Crop, dx: number, dy: number, previewSize = PREVIEW_SIZE): Crop {
  const { sx, sy, side } = cropSquare(width, height, crop);
  const scale = previewSize / side; // pixels d'aperçu par pixel de l'image
  const freeX = width - side;
  const freeY = height - side;
  return {
    zoom: crop.zoom,
    x: freeX > 0 ? clamp((sx - dx / scale) / freeX, 0, 1) : 0.5,
    y: freeY > 0 ? clamp((sy - dy / scale) / freeY, 0, 1) : 0.5,
  };
}

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** Décode un fichier image (orientation EXIF comprise). Lève une erreur si le format n'est pas lisible. */
export async function loadImage(file: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close?.() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dessine le cadrage dans un canvas carré (aperçu ou image finale). */
export function drawCrop(ctx: CanvasRenderingContext2D, img: LoadedImage, crop: Crop, size: number): void {
  const { sx, sy, side } = cropSquare(img.width, img.height, crop);
  ctx.fillStyle = '#26150c'; // fond des images à transparence
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.source, sx, sy, side, side, 0, 0, size, size);
}

/** Image finale : JPEG carré de 128 pixels, sans métadonnées (le canvas n'en conserve aucune). */
export function renderAvatarJpeg(img: LoadedImage, crop: Crop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas indisponible'));
  drawCrop(ctx, img, crop, OUTPUT_SIZE);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage impossible'))), 'image/jpeg', 0.86));
}
