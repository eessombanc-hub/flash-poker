import type { Rng } from './rng';

/** Fisher-Yates, en place. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  return shuffleInPlace([...items], rng);
}
