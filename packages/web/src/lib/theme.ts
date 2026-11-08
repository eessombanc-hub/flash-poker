import type { Ambiance, CardBack, FeltColor } from './settings';

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

/** Ambiances de fond : `swatch` = pastille d'aperçu (fond 950, fond 700, accent 500) ; `meta` = couleur de la barre du navigateur. */
export const AMBIANCE_OPTIONS: { id: Ambiance; label: string; hint: string; meta: string; swatch: [string, string, string] }[] = [
  { id: 'cognac', label: 'Cognac', hint: 'Marron brillant et élégant, esprit banque privée', meta: '#26150c', swatch: ['#26150c', '#74462a', '#be824c'] },
  { id: 'emeraude', label: 'Émeraude', hint: 'Le vert des salles de jeu, en plus profond', meta: '#051c16', swatch: ['#051c16', '#16503e', '#388c6e'] },
  { id: 'cuir', label: 'Cuir', hint: 'Cercle de jeu, brun chaud et feutré', meta: '#201513', swatch: ['#201513', '#493327', '#7e5c41'] },
  { id: 'carbone', label: 'Carbone', hint: 'Noir et or, esprit « high roller »', meta: '#0b0b0e', swatch: ['#0b0b0e', '#2a2a33', '#5a5a6a'] },
  { id: 'bordeaux', label: 'Bordeaux', hint: 'Velours rouge de casino, chaleureux', meta: '#240a12', swatch: ['#240a12', '#601c31', '#a03e5a'] },
  { id: 'violet', label: 'Violet nuit', hint: 'Ludique et nocturne, esprit jeu mobile', meta: '#140b2b', swatch: ['#140b2b', '#3a2680', '#6c53cc'] },
];
