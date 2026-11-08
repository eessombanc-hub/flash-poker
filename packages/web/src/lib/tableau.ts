/**
 * LE TABLEAU côté navigateur : textes et utilitaires d'affichage. Aucune règle ici — le serveur décide de tout
 * (distribution, tours, délais, résultats) ; le navigateur n'embarque ni le moteur ni les cartes cachées.
 */
import type { AiLevel, TableauVariant, TbGameDto } from './types';
import { fr, type Key } from '../i18n/fr';

export const VARIANT_OPTIONS: readonly { id: TableauVariant }[] = [{ id: 'classic' }, { id: 'hand5' }];
export const LEVELS: readonly { id: AiLevel }[] = [{ id: 'beginner' }, { id: 'intermediate' }, { id: 'expert' }];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Exemples d'aide-mémoire des dix combinaisons, de la plus faible à la plus forte (les noms sont traduits : clés `tb.combo.N`). */
export const COMBOS: readonly { example: string }[] = [
  { example: 'As Kd 9h 6c 3s' },
  { example: '8h 8d As 5c 2s' },
  { example: 'Kh Kd 4s 4c 9d' },
  { example: '7h 7d 7s Kc 2d' },
  { example: '5h 6d 7s 8c 9d' },
  { example: 'Ah 9h 7h 4h 2h' },
  { example: 'Qh Qd Qs 3c 3d' },
  { example: '9h 9d 9s 9c Kd' },
  { example: '4h 5h 6h 7h 8h' },
  { example: 'Th Jh Qh Kh Ah' },
];

/** Décalage entre l'horloge du serveur et celle du navigateur, mesuré à la réception d'une réponse. */
export function clockSkew(dto: Pick<TbGameDto, 'serverNow'>, localNow = Date.now()): number {
  return dto.serverNow - localNow;
}
/** Secondes restantes avant l'échéance du tour, d'après l'horloge du serveur. */
export function secondsLeft(dto: Pick<TbGameDto, 'deadline'>, skew: number, localNow = Date.now()): number {
  if (dto.deadline === null) return 0;
  return Math.max(0, (dto.deadline - (localNow + skew)) / 1000);
}

/** Texte annoncé aux lecteurs d'écran à chaque changement de situation (français par défaut). */
export function announce(dto: TbGameDto, t: (key: Key) => string = (k) => fr[k]): string {
  if (dto.status === 'waiting') return t('tb.say.waiting');
  if (dto.status === 'finished') {
    if (dto.winner === null) return t('tb.say.draw');
    return dto.winner === dto.you ? t('tb.say.won') : t('tb.say.lost');
  }
  if (dto.paused) return t('tb.say.paused');
  return dto.view?.turn === dto.you ? t('tb.say.yourTurn') : t('tb.say.theirTurn');
}

export const outcomeKey = (o: 'win' | 'loss' | 'draw'): Key => (o === 'win' ? 'tb.out.win' : o === 'loss' ? 'tb.out.loss' : 'tb.out.draw');

/** Lien d'invitation à une partie amicale. */
export function inviteUrl(code: string): string {
  try {
    const u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('tableau', code);
    return u.toString();
  } catch {
    return code;
  }
}
