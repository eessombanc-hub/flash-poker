import { describe, expect, it } from 'vitest';
import { ALL_CARDS, createDeck, parseCard, parseCards } from '../src/core/card';
import { CryptoRng, SeededRng } from '../src/core/rng';
import { shuffled } from '../src/core/shuffle';

describe('cartes', () => {
  it('52 cartes uniques, ids 0..51, codes uniques', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(new Set(deck.map((c) => c.code)).size).toBe(52);
    expect(deck.map((c) => c.id)).toEqual([...Array(52).keys()]);
  });
  it('parse / format', () => {
    expect(parseCard('As').rank).toBe(14);
    expect(parseCard('Td').rank).toBe(10);
    expect(parseCard('2c').code).toBe('2c');
    expect(parseCards('As Kd  7h').map((c) => c.code)).toEqual(['As', 'Kd', '7h']);
    for (const c of ALL_CARDS) expect(parseCard(c.code)).toBe(c);
    expect(() => parseCard('1s')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
  });
});

describe('mélange', () => {
  it('conserve les 52 cartes', () => {
    const d = shuffled(createDeck(), new SeededRng(1));
    expect(new Set(d.map((c) => c.id)).size).toBe(52);
  });
  it('déterministe à graine égale, différent sinon', () => {
    const a = shuffled(createDeck(), new SeededRng(42)).map((c) => c.id);
    const b = shuffled(createDeck(), new SeededRng(42)).map((c) => c.id);
    const c = shuffled(createDeck(), new SeededRng(43)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('uniformité : 24 permutations de 4 éléments (khi-deux, 23 ddl, seuil p=0,001)', () => {
    const rng = new SeededRng(2024);
    const N = 48_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const key = shuffled([0, 1, 2, 3], rng).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    const expected = N / 24;
    let chi = 0;
    for (const n of counts.values()) chi += (n - expected) ** 2 / expected;
    expect(chi).toBeLessThan(49.7);
  });
  it('uniformité : position d\'une carte dans le paquet de 52 (khi-deux, 51 ddl, seuil p=0,001)', () => {
    const rng = new SeededRng(7);
    const N = 20_800;
    const pos = new Array<number>(52).fill(0);
    for (let i = 0; i < N; i++) pos[shuffled(createDeck(), rng).findIndex((c) => c.id === 0)]!++;
    const expected = N / 52;
    let chi = 0;
    for (const n of pos) chi += (n - expected) ** 2 / expected;
    expect(chi).toBeLessThan(87.7);
  });
  it('CryptoRng : bornes respectées', () => {
    const rng = new CryptoRng();
    expect(rng.int(1)).toBe(0);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(52);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(52);
    }
    expect(new Set(shuffled(createDeck(), rng).map((c) => c.id)).size).toBe(52);
  });
});
