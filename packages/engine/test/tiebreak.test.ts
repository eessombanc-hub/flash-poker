import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { assignPositions, POSITION_LABELS } from '../src/game/positions';
import { resolveRoundResult, runHoldemTiebreak } from '../src/variants';
import { dealStack, names } from './helpers';

describe('Hold\'em de départage', () => {
  it('2 cartes privées ouvertes + 5 cartes communes ; un gagnant unique', () => {
    const out = runHoldemTiebreak(['P0', 'P1', 'P2'], new SeededRng(5));
    const first = out.rounds[0]!;
    expect(first.board).toHaveLength(5);
    for (const p of first.players) expect(first.hands[p]).toHaveLength(2);
    const codes = [...first.board, ...first.players.flatMap((p) => first.hands[p]!)];
    expect(new Set(codes).size).toBe(codes.length); // aucune carte en double
    expect(out.rounds.at(-1)!.winners).toEqual([out.winner]);
  });

  it('nouvelle égalité : on rejoue entre les ex aequo, avec un nouveau tirage', () => {
    const tieDeck = dealStack([['As', 'Ad'], ['Ah', 'Ac']], ['Kh', 'Qs', '9d', '4c', '2s']);
    const winDeck = dealStack([['Kc', 'Kd'], ['3c', '3d']], ['Ah', '9c', '8s', '5h', '2c']);
    const out = runHoldemTiebreak(['P0', 'P1'], new SeededRng(1), [tieDeck, winDeck]);
    expect(out.rounds.map((r) => r.winners)).toEqual([['P0', 'P1'], ['P0']]);
    expect(out.winner).toBe('P0');
  });

  it('les perdants d\'une égalité ne rejouent pas : seuls les ex aequo restent en lice', () => {
    // P2 a une main plus faible au 1er tour : il disparaît au second
    const d1 = dealStack([['As', 'Ad'], ['Ah', 'Ac'], ['2d', '3h']], ['Kh', 'Qs', '9d', '4c', '7s']);
    const d2 = dealStack([['Kc', 'Kd'], ['3c', '3d']], ['Ah', '9c', '8s', '5h', '2c']);
    const out = runHoldemTiebreak(['P0', 'P1', 'P2'], new SeededRng(1), [d1, d2]);
    expect(out.rounds[0]!.players).toEqual(['P0', 'P1', 'P2']);
    expect(out.rounds[1]!.players).toEqual(['P0', 'P1']);
  });

  it('équitable : deux joueurs identiques gagnent chacun ~50 % des départages', () => {
    let p0 = 0;
    const rng = new SeededRng(99);
    const N = 4000;
    for (let i = 0; i < N; i++) if (runHoldemTiebreak(['P0', 'P1'], rng).winner === 'P0') p0++;
    expect(p0).toBeGreaterThan(N * 0.45);
    expect(p0).toBeLessThan(N * 0.55);
  });

  it('exige au moins 2 joueurs', () => {
    expect(() => runHoldemTiebreak(['P0'], new SeededRng(1))).toThrow();
  });
});

describe('resolveRoundResult', () => {
  const rng = () => new SeededRng(3);
  it('WINNER → points ; NO_WINNER → aucun point ; INSTANT_VICTORY → conservé', () => {
    expect(resolveRoundResult({ kind: 'WINNER', winner: 'P1', points: 2 }, rng())).toEqual({ kind: 'POINTS', winner: 'P1', points: 2 });
    expect(resolveRoundResult({ kind: 'NO_WINNER', reason: 'x' }, rng())).toEqual({ kind: 'NONE', reason: 'x' });
    expect(resolveRoundResult({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 2 }, rng())).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 2 });
  });
  it('TIE → Hold\'em de départage entre les seuls ex aequo, le gagnant marque 1 point', () => {
    for (let i = 0; i < 20; i++) {
      const a = resolveRoundResult({ kind: 'TIE', tied: ['P0', 'P2'] }, new SeededRng(i));
      expect(a.kind).toBe('POINTS');
      if (a.kind === 'POINTS') {
        expect(['P0', 'P2']).toContain(a.winner);
        expect(a.points).toBe(1);
        expect(a.tiebreak).toBeDefined();
      }
    }
  });
});

describe('positions', () => {
  it('tirage au sort au démarrage : UTG à UTG+(n-1), une place par joueur', () => {
    for (let n = 2; n <= 6; n++) {
      const s = assignPositions(names(n), new SeededRng(n));
      expect([...s.order].sort()).toEqual(names(n));
      expect(s.order.map((p) => s.positions[p])).toEqual(POSITION_LABELS.slice(0, n));
    }
  });
  it('rejette moins de 2 ou plus de 6 joueurs', () => {
    expect(() => assignPositions(['A'], new SeededRng(1))).toThrow();
    expect(() => assignPositions(names(7), new SeededRng(1))).toThrow();
  });
  it('varie selon la graine', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) orders.add(assignPositions(names(6), new SeededRng(i)).order.join());
    expect(orders.size).toBeGreaterThan(10);
  });
});
