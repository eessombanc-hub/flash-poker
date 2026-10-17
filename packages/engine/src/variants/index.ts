import { ClosedRound } from './closedRound';
import { HoldemDiscardRound } from './holdemDiscardRound';
import { Round61 } from './round61';
import { Round63 } from './round63';
import { RoundLe10 } from './roundLe10';
import { RoundMorpion } from './roundMorpion';
import { RuleError, type Round, type RoundContext, type RoundSnapshot, type VariantId } from './types';
import type { Rng } from '../core/rng';

export function createRound(variant: VariantId, ctx: RoundContext): Round {
  switch (variant) {
    case 'CLOSED_1':
    case 'CLOSED_2':
      return new ClosedRound(variant, ctx);
    case 'AVIATION':
    case 'AVIA_6':
      return new HoldemDiscardRound(variant, ctx);
    case 'V6_3':
      return new Round63(ctx);
    case 'V6_1':
      return new Round61(ctx);
    case 'MORPION':
      return new RoundMorpion(ctx);
    case 'LE10':
      return new RoundLe10(ctx);
    default:
      throw new RuleError('BAD_COMMAND', `Variante inconnue : ${String(variant)}`);
  }
}

export function restoreRound(snapshot: RoundSnapshot, rng: Rng, assistance = false): Round {
  const ctx: RoundContext = { players: snapshot.players, rng, assistance };
  switch (snapshot.variant) {
    case 'CLOSED_1':
    case 'CLOSED_2':
      return new ClosedRound(snapshot.variant, ctx, snapshot);
    case 'AVIATION':
    case 'AVIA_6':
      return new HoldemDiscardRound(snapshot.variant, ctx, snapshot);
    case 'V6_3':
      return new Round63(ctx, snapshot);
    case 'V6_1':
      return new Round61(ctx, snapshot);
    case 'MORPION':
      return new RoundMorpion(ctx, snapshot);
    case 'LE10':
      return new RoundLe10(ctx, snapshot);
  }
}

export * from './types';
export { ClosedRound } from './closedRound';
export { HoldemDiscardRound } from './holdemDiscardRound';
export { Round63, LINE_UNITS } from './round63';
export type { LineResult, LineDesignation } from './round63';
export { Round61 } from './round61';
export type { RevealStep, NextReason } from './round61';
export { RoundMorpion, MORPION_LINES } from './roundMorpion';
export { RoundLe10 } from './roundLe10';
export type { RevealStep10, NextReason10 } from './roundLe10';
export { runHoldemTiebreak, resolveRoundResult } from './tiebreak';
export type { TiebreakOutcome, TiebreakRound, RoundAward } from './tiebreak';
