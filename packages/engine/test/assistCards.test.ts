import { describe, expect, it } from 'vitest';
import { combinationCodes, parseCard } from '../src';

const codes = (s: string[]) => combinationCodes(s.map(parseCard)).sort();

describe('assistance : cartes qui forment la combinaison', () => {
  it('paire : les deux cartes de la paire seulement', () => {
    expect(codes(['As', 'Ad', '9c', '5h', '2s'])).toEqual(['Ad', 'As']);
  });
  it('double paire : les quatre cartes', () => {
    expect(codes(['Ks', 'Kd', '9c', '9h', '2s'])).toEqual(['9c', '9h', 'Kd', 'Ks']);
  });
  it('brelan et carré', () => {
    expect(codes(['7s', '7d', '7c', '5h', '2s'])).toEqual(['7c', '7d', '7s']);
    expect(codes(['7s', '7d', '7c', '7h', '2s'])).toEqual(['7c', '7d', '7h', '7s']);
  });
  it('quinte, couleur, full : les cinq cartes', () => {
    expect(codes(['5s', '6d', '7c', '8h', '9s'])).toHaveLength(5);
    expect(codes(['2h', '6h', '9h', 'Jh', 'Kh'])).toHaveLength(5);
    expect(codes(['Ks', 'Kd', 'Kc', '9h', '9s'])).toHaveLength(5);
  });
  it('carte haute : la plus haute seulement', () => {
    expect(codes(['As', 'Jd', '9c', '5h', '2s'])).toEqual(['As']);
  });
  it('plus de 5 cartes : la meilleure main de 5 est retenue', () => {
    expect(codes(['As', 'Ad', 'Ac', '9c', '9h', '2s', '3d'])).toHaveLength(5); // full
  });
  it('main incomplète (moins de 5 cartes) : paire détectée', () => {
    expect(codes(['Qs', 'Qd', '4c'])).toEqual(['Qd', 'Qs']);
  });
});
