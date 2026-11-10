import { tr } from '../i18n';
import type { Ambiance, CardBack, FeltColor } from './settings';

/** Dégradé du tapis (3 arrêts), par couleur. Appliqué via variables CSS sur `.felt` (voir styles.css). */
export const FELT_OPTIONS: { id: FeltColor; label: string; a: string; b: string; c: string }[] = [
  { id: 'vert', get label() { return tr('felt.vert'); }, a: '#1a6b51', b: '#0e4130', c: '#06261c' },
  { id: 'bleu', get label() { return tr('felt.bleu'); }, a: '#3a64a8', b: '#213f72', c: '#101f3d' },
  { id: 'bordeaux', get label() { return tr('felt.bordeaux'); }, a: '#9c3a4a', b: '#651f2b', c: '#330f16' },
  { id: 'anthracite', get label() { return tr('felt.anthracite'); }, a: '#56606c', b: '#333a42', c: '#181c20' },
];

export const CARD_BACK_OPTIONS: { id: CardBack; label: string }[] = [
  { id: 'losange', get label() { return tr('back.losange'); } },
  { id: 'rayures', get label() { return tr('back.rayures'); } },
  { id: 'etoile', get label() { return tr('back.etoile'); } },
];

/** Ambiances de fond : `swatch` = pastille d'aperçu (fond 950, fond 700, accent 500) ; `meta` = couleur de la barre du navigateur. */
export const AMBIANCE_OPTIONS: { id: Ambiance; label: string; hint: string; meta: string; swatch: [string, string, string] }[] = [
  { id: 'cognac', get label() { return tr('amb.cognac'); }, get hint() { return tr('amb.cognac.hint'); }, meta: '#26150c', swatch: ['#26150c', '#74462a', '#be824c'] },
  { id: 'emeraude', get label() { return tr('amb.emeraude'); }, get hint() { return tr('amb.emeraude.hint'); }, meta: '#051c16', swatch: ['#051c16', '#16503e', '#388c6e'] },
  { id: 'cuir', get label() { return tr('amb.cuir'); }, get hint() { return tr('amb.cuir.hint'); }, meta: '#201513', swatch: ['#201513', '#493327', '#7e5c41'] },
  { id: 'carbone', get label() { return tr('amb.carbone'); }, get hint() { return tr('amb.carbone.hint'); }, meta: '#0b0b0e', swatch: ['#0b0b0e', '#2a2a33', '#5a5a6a'] },
  { id: 'bordeaux', get label() { return tr('amb.bordeaux'); }, get hint() { return tr('amb.bordeaux.hint'); }, meta: '#240a12', swatch: ['#240a12', '#601c31', '#a03e5a'] },
  { id: 'violet', get label() { return tr('amb.violet'); }, get hint() { return tr('amb.violet.hint'); }, meta: '#140b2b', swatch: ['#140b2b', '#3a2680', '#6c53cc'] },
];
