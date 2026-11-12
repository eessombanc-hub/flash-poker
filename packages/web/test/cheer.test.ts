import { describe, expect, it } from 'vitest';
import { hasStraightFlush } from '../src/lib/roundInfo';
import { Sound } from '../src/lib/sound';
import type { RoundRecord } from '../src/lib/types';

const base = { roundNo: 1, chooser: 'a', variant: 'CLOSED_1', result: { kind: 'WINNER', winner: 'a' }, points: {}, scoresAfter: {} };
const rec = (over: Record<string, unknown>) => ({ ...base, award: { kind: 'POINTS', winner: 'a', points: 1 }, ...over }) as unknown as RoundRecord;
const hand = (category: number) => ({ cards: [], category });

describe('quinte flush : déclenchement du son', () => {
  it('victoire instantanée du 6-3', () => {
    expect(hasStraightFlush(rec({ award: { kind: 'INSTANT_VICTORY', winner: 'a', line: 1 } }))).toBe(true);
  });
  it('main abattue de catégorie 8, même chez un joueur qui ne gagne pas la manche', () => {
    expect(hasStraightFlush(rec({ summary: { hands: { a: hand(5), b: hand(8) } } }))).toBe(true);
  });
  it('main de départage', () => {
    expect(hasStraightFlush(rec({ summary: { tiebreak: { category: 8, cards: [] } } }))).toBe(true);
  });
  it('couleur, carré ou manche sans abattage : aucun son', () => {
    expect(hasStraightFlush(rec({ summary: { hands: { a: hand(5), b: hand(7) } } }))).toBe(false);
    expect(hasStraightFlush(rec({}))).toBe(false);
  });
  it('sans Web Audio (jsdom), le son reste silencieux et ne lève pas d’erreur', () => {
    expect(() => Sound.cheer()).not.toThrow();
  });
});
