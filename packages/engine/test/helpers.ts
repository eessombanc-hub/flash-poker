import { SeededRng } from '../src/core/rng';
import { createRound } from '../src/variants';
import type { Round, RoundCommand, VariantId } from '../src/variants';

export const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `P${i}`);

/** Ordre de tirage d'une distribution tour de table : carte i de chaque joueur, puis le reste (plateau / remplacements). */
export function dealStack(hands: string[][], rest: string[] = []): string[] {
  const k = hands[0]!.length;
  const out: string[] = [];
  for (let i = 0; i < k; i++) for (const h of hands) out.push(h[i]!);
  return [...out, ...rest];
}

export function mk(variant: VariantId, n: number, stack?: string[], seed = 1, assistance = false): Round {
  return createRound(variant, { players: names(n), rng: new SeededRng(seed), stackedDeck: stack, assistance });
}

export const sel = (player: string, cards: string[]): RoundCommand => ({ type: 'SELECT', player, cards });
export const val = (player: string): RoundCommand => ({ type: 'VALIDATE', player });
export const TIMEOUT: RoundCommand = { type: 'TIMEOUT' };

export function pick(round: Round, player: string, cards: string[]): void {
  round.apply(sel(player, cards));
  round.apply(val(player));
}

const CODE = /"([2-9TJQKA][cdhs])"/g;
export const codesIn = (v: unknown): Set<string> => new Set([...JSON.stringify(v).matchAll(CODE)].map((m) => m[1]!));

const SELECT_MAX: Record<VariantId, number> = { CLOSED_1: 3, CLOSED_2: 3, AVIATION: 1, AVIA_6: 2, V6_3: 2, V6_1: 0, MORPION: 2, LE10: 0 };

export function ownCodes(r: Round, p: string): string[] {
  const h = r.view(p).cards.hands[p]!;
  if (h.kind !== 'own') throw new Error('vue attendue : propre main');
  return h.cards.map((c) => c.code!); // jamais masqué pour les variantes utilisant ce helper (Fermé, Aviation…)
}

/** Bot aléatoire, aux commandes parfois illégales : le moteur doit les refuser sans jamais changer d'état. */
export function randomCommand(r: Round, rng: SeededRng): RoundCommand {
  if (r.variant === 'V6_1') return rng.int(3) === 0 ? { type: 'TIMEOUT' } : { type: 'REVEAL', player: r.awaiting()[0]! };
  const roll = rng.int(10);
  if (roll === 0) return { type: 'TIMEOUT' };
  const awaited = r.awaiting();
  const p = rng.int(8) === 0 ? r.players[rng.int(r.players.length)]! : awaited[rng.int(awaited.length)]!;
  if (roll <= 3) return { type: 'VALIDATE', player: p };
  const hand = ownCodes(r, p);
  const max = SELECT_MAX[r.variant];
  const k = rng.int(max + 1);
  const cards: string[] = [];
  while (cards.length < k) {
    const c = hand[rng.int(hand.length)]!;
    if (!cards.includes(c)) cards.push(c);
  }
  return { type: 'SELECT', player: p, cards };
}

