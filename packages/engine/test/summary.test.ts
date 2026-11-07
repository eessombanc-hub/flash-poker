import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { HandCategory } from '../src/evaluation/handEvaluator';
import { GameManager, type GameConfig } from '../src/game/gameManager';
import type { RoundCommand, VariantId } from '../src/variants';
import { dealStack, names } from './helpers';

// Résumé de manche : ce qui a décidé la manche, conservé dans l'historique (affichage seulement).
const WIN = ['As', 'Ad', '2c', '7d', '9h']; // paire d'As
const LOSERS = [['Ks', 'Qd', '8c', '5h', '3s']];
const TIE_HANDS = [
  ['As', 'Ad', 'Kc', 'Qd', '2h'],
  ['Ah', 'Ac', 'Ks', 'Qh', '2d'],
];
const cfg = (n: number): GameConfig => ({ players: names(n), targetPoints: 3, stakeChips: 2000 });
const choose = (g: GameManager, v: VariantId) => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: v });
const round = (g: GameManager, command: RoundCommand) => g.apply({ type: 'ROUND', command });

describe('résumé de manche', () => {
  it('abattage : mains et combinaisons de chacun, celle du vainqueur comprise', () => {
    const g = new GameManager(cfg(2), new SeededRng(1), { stackedDeck: () => dealStack([WIN, LOSERS[0]!]) });
    choose(g, 'CLOSED_1');
    round(g, { type: 'TIMEOUT' });
    const record = g.view(null).history.at(-1)!;
    const winner = record.award.kind === 'POINTS' ? record.award.winner : null;
    expect(winner).not.toBeNull();
    expect(record.summary?.hands?.[winner!]?.category).toBe(HandCategory.Pair);
    expect(Object.keys(record.summary?.hands ?? {})).toHaveLength(2);
    expect(record.summary?.tiebreak).toBeUndefined();
  });

  it('égalité : la combinaison du vainqueur du Hold’em de départage est retenue', () => {
    const g = new GameManager(cfg(2), new SeededRng(3), { stackedDeck: () => dealStack(TIE_HANDS) });
    choose(g, 'CLOSED_1');
    round(g, { type: 'TIMEOUT' });
    const record = g.view(null).history.at(-1)!;
    expect(record.award.kind).toBe('POINTS');
    expect(record.award.kind === 'POINTS' && record.award.tiebreak).toBeTruthy();
    expect(record.summary?.tiebreak?.cards).toHaveLength(5);
    expect(record.summary?.tiebreak?.category).toBeGreaterThanOrEqual(HandCategory.HighCard);
  });

  it('6-3 : résultat de chaque ligne ; résumé conservé après sauvegarde et reprise', () => {
    const g = new GameManager(cfg(2), new SeededRng(5));
    choose(g, 'V6_3');
    for (let i = 0; i < 3; i++) round(g, { type: 'TIMEOUT' });   // personne ne désigne : 3 lignes perdues
    const record = g.view(null).history.at(-1)!;
    expect(record.variant).toBe('V6_3');
    expect(record.summary?.lines).toHaveLength(3);
    const restored = GameManager.restore(JSON.parse(JSON.stringify(g.snapshot())), new SeededRng(5));
    expect(restored.view(null).history.at(-1)!.summary).toEqual(record.summary);
  });
});
