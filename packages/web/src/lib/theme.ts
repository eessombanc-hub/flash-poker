import type { CardBack, FeltColor } from './settings';

/** Dégradé du tapis (3 arrêts), par couleur. Appliqué via variables CSS sur `.felt` (voir styles.css). */
export const FELT_OPTIONS: { id: FeltColor; label: string; a: string; b: string; c: string }[] = [
  { id: 'vert', label: 'Vert classique', a: '#1a6b51', b: '#0e4130', c: '#06261c' },
  { id: 'bleu', label: 'Bleu nuit', a: '#3a64a8', b: '#213f72', c: '#101f3d' },
  { id: 'bordeaux', label: 'Bordeaux', a: '#9c3a4a', b: '#651f2b', c: '#330f16' },
  { id: 'anthracite', label: 'Anthracite', a: '#56606c', b: '#333a42', c: '#181c20' },
];

export const CARD_BACK_OPTIONS: { id: CardBack; label: string }[] = [
  { id: 'losange', label: 'Losange' },
  { id: 'rayures', label: 'Rayures' },
  { id: 'etoile', label: 'Étoile' },
];
