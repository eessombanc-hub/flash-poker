import type { PlayerId } from '../core/cardEngine';
import { CardEngine } from '../core/cardEngine';
import { parseCard } from '../core/card';
import type { Rng } from '../core/rng';
import { evaluateHoldem } from '../evaluation/holdemEvaluator';
import { rankGroups } from '../evaluation/ranking';
import type { RoundResult } from './types';

export interface TiebreakRound {
  players: PlayerId[];
  /** 2 cartes privées OUVERTES par joueur. */
  hands: Record<PlayerId, [string, string]>;
  /** flop (3), turn, river : à dévoiler en trois temps. */
  board: string[];
  winners: PlayerId[];
}

export interface TiebreakOutcome {
  winner: PlayerId;
  rounds: TiebreakRound[];
}

/**
 * Hold'em de départage : paquet de 52 cartes remélangé (indépendant de la manche), 2 cartes privées ouvertes
 * par joueur + 5 cartes communes. Ni mise ni décision. Nouvelle égalité : on rejoue entre les ex aequo.
 * `stackedDecks` : TESTS UNIQUEMENT (un paquet truqué par tour).
 */
export function runHoldemTiebreak(
  tied: readonly PlayerId[],
  rng: Rng,
  stackedDecks: readonly (readonly string[])[] = [],
): TiebreakOutcome {
  if (tied.length < 2) throw new RangeError('Un départage oppose au moins 2 joueurs');
  let players = [...tied];
  const rounds: TiebreakRound[] = [];
  for (let i = 0; i < 10_000; i++) {
    const stack = stackedDecks[i];
    const engine = stack ? CardEngine.stacked(players, rng, stack.map(parseCard)) : new CardEngine(players, rng);
    engine.dealRoundRobin(2, { visibleFrom: 0 });
    const board = engine.dealBoard(5, false);
    const entries = players.map((p) => {
      const hand = engine.getHand(p).map((e) => e.card);
      return { player: p, hand, rank: evaluateHoldem(hand, board).rank };
    });
    const winners = rankGroups(entries.map((e) => ({ player: e.player, rank: e.rank })))[0]!;
    rounds.push({
      players: [...players],
      hands: Object.fromEntries(entries.map((e) => [e.player, [e.hand[0]!.code, e.hand[1]!.code]])) as Record<
        PlayerId,
        [string, string]
      >,
      board: board.map((c) => c.code),
      winners,
    });
    if (winners.length === 1) return { winner: winners[0]!, rounds };
    players = winners;
  }
  throw new Error('Hold\'em de départage : trop d\'égalités successives');
}

export type RoundAward =
  | { kind: 'POINTS'; winner: PlayerId; points: number; tiebreak?: TiebreakOutcome }
  | { kind: 'NONE'; reason: string }
  | { kind: 'INSTANT_VICTORY'; winner: PlayerId; line: 1 | 2 | 3 };

/** Transforme le résultat d'une manche en attribution finale (joue le Hold'em de départage si besoin). */
export function resolveRoundResult(result: RoundResult, rng: Rng): RoundAward {
  switch (result.kind) {
    case 'WINNER':
      return { kind: 'POINTS', winner: result.winner, points: result.points };
    case 'TIE': {
      const tiebreak = runHoldemTiebreak(result.tied, rng);
      return { kind: 'POINTS', winner: tiebreak.winner, points: 1, tiebreak };
    }
    case 'NO_WINNER':
      return { kind: 'NONE', reason: result.reason };
    case 'INSTANT_VICTORY':
      return { kind: 'INSTANT_VICTORY', winner: result.winner, line: result.line };
  }
}
