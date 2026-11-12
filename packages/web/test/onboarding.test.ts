import { describe, expect, it } from 'vitest';
import { isFirstVisit, markOnboarded } from '../src/lib/onboarding';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('parcours de première visite', () => {
  it('est actif tant que rien n’est enregistré, puis disparaît', () => {
    const s = memory();
    expect(isFirstVisit(s)).toBe(true);
    markOnboarded(s);
    expect(isFirstVisit(s)).toBe(false);
  });
  it('reste silencieux si le stockage est indisponible', () => {
    expect(isFirstVisit(null)).toBe(false);
    expect(() => markOnboarded(null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(isFirstVisit(broken)).toBe(false);
    expect(() => markOnboarded(broken)).not.toThrow();
  });
});
