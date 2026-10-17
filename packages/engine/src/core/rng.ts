import { randomInt } from 'node:crypto';

/** Source d'aléa injectée : CSPRNG en production, graine fixe en test. */
export interface Rng {
  /** Entier uniforme dans [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Générateur cryptographique (production). `randomInt` est sans biais de modulo. */
export class CryptoRng implements Rng {
  int(maxExclusive: number): number {
    return randomInt(maxExclusive);
  }
}

/** Mulberry32 : déterministe, RÉSERVÉ AUX TESTS (jamais en production). */
export class SeededRng implements Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  private next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new RangeError('maxExclusive invalide');
    return Math.floor(this.next() * maxExclusive);
  }
}
