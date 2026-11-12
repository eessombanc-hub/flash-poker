import type { ThrowItem } from './types';

/** Objets lançables : pictogramme et phrase (avec article) pour l'annonce. L'ordre est celui du sélecteur. */
export const ITEM_EMOJI: Record<ThrowItem, string> = {
  tomato: '🍅',
  bouquet: '💐',
  pie: '🥧',
  kiss: '💋',
  ice: '🧊',
  beer: '🍺',
  banana: '🍌',
  popcorn: '🍿',
  trophy: '🏆',
  heart: '❤️',
};
export const ITEM_ORDER = Object.keys(ITEM_EMOJI) as ThrowItem[];
export const ITEM_KEY = {
  tomato: 'soc.item.tomato',
  bouquet: 'soc.item.bouquet',
  pie: 'soc.item.pie',
  kiss: 'soc.item.kiss',
  ice: 'soc.item.ice',
  beer: 'soc.item.beer',
  banana: 'soc.item.banana',
  popcorn: 'soc.item.popcorn',
  trophy: 'soc.item.trophy',
  heart: 'soc.item.heart',
} as const satisfies Record<ThrowItem, string>;

export const CHAT_MAX_CHARS = 140;

const KEY = 'fp.social';
export interface SocialPrefs {
  hideChat: boolean;
  hideItems: boolean;
}
export function loadPrefs(): SocialPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SocialPrefs>;
    return { hideChat: p.hideChat === true, hideItems: p.hideItems === true };
  } catch {
    return { hideChat: false, hideItems: false };
  }
}
export function savePrefs(p: SocialPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* préférence non conservée : sans gravité */
  }
}
