/**
 * LE TABLEAU côté navigateur : textes et utilitaires d'affichage. Aucune règle ici — le serveur décide de tout
 * (distribution, tours, délais, résultats) ; le navigateur n'embarque ni le moteur ni les cartes cachées.
 */
import type { AiLevel, TbGameDto } from './types';

export const LEVELS: readonly { id: AiLevel; label: string; text: string }[] = [
  { id: 'beginner', label: 'Débutant', text: 'Joue simplement et se trompe parfois : idéal pour découvrir les combinaisons.' },
  { id: 'intermediate', label: 'Intermédiaire', text: 'Construit des paires, brelans et tirages en tenant compte des cartes déjà sorties.' },
  { id: 'expert', label: 'Expert', text: 'Simule des centaines de fins de partie pour viser au moins trois colonnes.' },
];
export const levelLabel = (l: AiLevel | null): string => LEVELS.find((x) => x.id === l)?.label ?? '';

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Aide-mémoire des dix combinaisons, de la plus faible à la plus forte. */
export const COMBOS: readonly { name: string; example: string; text: string }[] = [
  { name: 'Carte haute', example: 'As Kd 9h 6c 3s', text: 'Aucune combinaison : la carte la plus haute décide.' },
  { name: 'Paire', example: '8h 8d As 5c 2s', text: 'Deux cartes de même valeur.' },
  { name: 'Double paire', example: 'Kh Kd 4s 4c 9d', text: 'Deux paires différentes.' },
  { name: 'Brelan', example: '7h 7d 7s Kc 2d', text: 'Trois cartes de même valeur.' },
  { name: 'Quinte', example: '5h 6d 7s 8c 9d', text: 'Cinq valeurs qui se suivent. L’As compte haut ou bas (A-2-3-4-5).' },
  { name: 'Couleur', example: 'Ah 9h 7h 4h 2h', text: 'Cinq cartes de la même couleur.' },
  { name: 'Full', example: 'Qh Qd Qs 3c 3d', text: 'Un brelan et une paire.' },
  { name: 'Carré', example: '9h 9d 9s 9c Kd', text: 'Quatre cartes de même valeur.' },
  { name: 'Quinte flush', example: '4h 5h 6h 7h 8h', text: 'Une quinte, toutes de la même couleur.' },
  { name: 'Quinte flush royale', example: 'Th Jh Qh Kh Ah', text: 'De la quinte flush la plus haute : du 10 à l’As.' },
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

/** Texte annoncé aux lecteurs d'écran à chaque changement de situation. */
export function announce(dto: TbGameDto): string {
  if (dto.status === 'waiting') return 'En attente de votre adversaire.';
  if (dto.status === 'finished') {
    if (dto.winner === null) return 'Partie terminée : match nul.';
    return dto.winner === dto.you ? 'Partie terminée : vous avez gagné.' : 'Partie terminée : vous avez perdu.';
  }
  if (dto.paused) return 'Partie en pause.';
  return dto.view?.turn === dto.you ? 'À vous de jouer.' : 'Tour de votre adversaire.';
}

export const outcomeWord = (o: 'win' | 'loss' | 'draw'): string => (o === 'win' ? 'Victoire' : o === 'loss' ? 'Défaite' : 'Nul');

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
