import type { Rng } from '../core/rng';
import { ALL_CARDS } from '../core/card';
import { shuffleInPlace } from '../core/shuffle';
import { sha256Hex } from './sha256';

/**
 * Mélange vérifiable. Principe : le serveur tire une graine (256 bits, CSPRNG), publie `commitmentOf(graine)` AVANT
 * la manche, puis révèle la graine à la fin. Le sabot est une fonction pure de la graine et du nombre de jeux : chacun
 * peut recalculer l'ordre des cartes et constater qu'il n'a pas changé en cours de manche.
 */
const DOMAIN = 'flashpoker-blackjack-v1';

/** Engagement public sur la graine. */
export function commitmentOf(seed: string): string {
  return sha256Hex(`${DOMAIN}:commit:${seed}`);
}

/** Flux d'entiers uniformes dérivé de la graine : SHA-256 en mode compteur, rejet des valeurs biaisées. */
export class SeedRng implements Rng {
  private counter = 0;
  private words: number[] = [];
  constructor(private readonly seed: string) {}
  private nextWord(): number {
    if (this.words.length === 0) {
      const hex = sha256Hex(`${DOMAIN}:stream:${this.seed}:${this.counter++}`);
      for (let i = 0; i < 64; i += 8) this.words.push(parseInt(hex.slice(i, i + 8), 16));
    }
    return this.words.shift()!;
  }
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) throw new RangeError('maxExclusive invalide');
    const limit = 0x100000000 - (0x100000000 % maxExclusive); // rejet : aucun biais de modulo
    for (;;) {
      const w = this.nextWord();
      if (w < limit) return w % maxExclusive;
    }
  }
}

/** Sabot de `decks` jeux de 52 cartes (codes courts « As », « Td »), mélangé de façon déterministe par la graine. */
export function shoeFromSeed(seed: string, decks: number): string[] {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8) throw new RangeError('Nombre de jeux : 1 à 8');
  const cards: string[] = [];
  for (let d = 0; d < decks; d++) for (const c of ALL_CARDS) cards.push(c.code);
  return shuffleInPlace(cards, new SeedRng(seed));
}

/** Vérifie qu'une graine révélée correspond bien à l'engagement publié avant la manche. */
export function verifySeed(seed: string, commitment: string): boolean {
  return commitmentOf(seed) === commitment;
}
