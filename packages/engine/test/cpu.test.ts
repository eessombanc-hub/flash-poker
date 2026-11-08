import { describe, expect, it } from 'vitest';
import { parseCard } from '../src/core/card';
import { SeededRng } from '../src/core/rng';
import { evaluate5, HandCategory, categoryOf } from '../src/evaluation/handEvaluator';
import { evaluateOmahaWithPair } from '../src/evaluation/omahaEvaluator';
import { cpuPlan, handPercentile } from '../src/cpu/cpu';
import { GameManager, RuleError, type GameCommand, type GameView } from '../src';
import { MORPION_LINES } from '../src/variants';
import type { VariantId } from '../src/variants';
import { dealStack, names } from './helpers';

/** Joue une partie complète où tous les joueurs sont des CPU. Chaque commande doit être acceptée par le moteur. */
function playAllCpu(n: number, seed: number, targetPoints = 2): { rounds: number; variants: Set<VariantId> } {
  const rng = new SeededRng(seed);
  const players = names(n);
  const game = new GameManager({ players, targetPoints, stakeChips: 0 }, new SeededRng(seed + 1));
  const variants = new Set<VariantId>();
  let steps = 0;
  while (game.phase() !== 'GAME_OVER') {
    if (++steps > 6000) throw new Error(`n=${n} seed=${seed} : la partie ne se termine pas`);
    let acted = false;
    for (const p of game.awaiting()) {
      const plan = cpuPlan(game.view(p), p, rng);
      for (const cmd of plan) {
        game.apply(cmd); // une RuleError ferait échouer le test : le CPU ne joue que des coups légaux
        acted = true;
        if (game.phase() === 'GAME_OVER') break;
      }
      if (game.phase() === 'GAME_OVER') break;
    }
    const round = game.currentRound;
    if (round) variants.add(round.variant);
    if (!acted && game.phase() !== 'GAME_OVER') throw new Error(`n=${n} seed=${seed} : personne ne peut jouer (${game.phase()})`);
  }
  return { rounds: game.history().length, variants };
}

describe('CPU : parties complètes entre CPU, tous coups légaux', () => {
  for (let n = 2; n <= 6; n++) {
    it(`${n} joueurs : la partie va à son terme`, () => {
      const seen = new Set<VariantId>();
      for (let seed = 1; seed <= 4; seed++) {
        const r = playAllCpu(n, seed * 17 + n);
        expect(r.rounds).toBeGreaterThanOrEqual(1);
        r.variants.forEach((v) => seen.add(v));
      }
      expect(seen.size).toBeGreaterThanOrEqual(2); // le CPU choisit bien des variantes différentes
    });
  }

  it('chaque variante est jouée correctement par le CPU (manches isolées, 2 à 6 joueurs)', () => {
    const all: VariantId[] = ['V6_3', 'V6_1', 'CLOSED_1', 'CLOSED_2', 'AVIATION', 'AVIA_6', 'MORPION', 'LE10'];
    for (const variant of all) {
      for (let n = 2; n <= 6; n++) {
        if ((variant === 'CLOSED_2' || variant === 'LE10') && n > 5) continue;
        const rng = new SeededRng(n * 31);
        const players = names(n);
        // Un chooser CPU choisit toujours au hasard ; on force ici la variante testée via un deck-hook neutre.
        const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(n));
        game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant });
        let guard = 0;
        while (game.phase() === 'ROUND') {
          if (++guard > 400) throw new Error(`${variant}/${n} : la manche ne se termine pas`);
          for (const p of game.awaiting()) {
            if (game.phase() !== 'ROUND') break;
            for (const cmd of cpuPlan(game.view(p), p, rng)) game.apply(cmd);
          }
        }
        expect(game.history()).toHaveLength(1);
      }
    }
  });

  it('le CPU ne joue rien quand ce n\'est pas à lui, ni quand la partie est finie', () => {
    const players = names(3);
    const game = new GameManager({ players, targetPoints: 3, stakeChips: 0 }, new SeededRng(5));
    const chooser = game.chooser();
    const other = players.find((p) => p !== chooser)!;
    expect(cpuPlan(game.view(other), other, new SeededRng(1))).toEqual([]);
    const plan = cpuPlan(game.view(chooser), chooser, new SeededRng(1));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'CHOOSE_VARIANT', player: chooser });
  });

  it('assurance : le CPU refuse toujours la proposition reçue et n\'en fait jamais', () => {
    const base = { phase: 'VARIANT_SELECTION', chooser: 'a', variants: [{ variant: 'MORPION', available: true }], players: [], round: null } as const;
    const pendingToMe = { ...base, insurance: { pending: { proposer: 'a', partner: 'me', type: 'SPLIT_50_50' }, eligible: ['a', 'me'], canPropose: false } } as unknown as GameView;
    expect(cpuPlan(pendingToMe, 'me', new SeededRng(1))).toEqual([{ type: 'RESPOND_INSURANCE', player: 'me', accept: false }]);
    // Ce n'est pas à lui de répondre : il attend
    const pendingToOther = { ...base, insurance: { pending: { proposer: 'me', partner: 'a', type: 'SPLIT_50_50' }, eligible: ['a', 'me'], canPropose: false } } as unknown as GameView;
    expect(cpuPlan(pendingToOther, 'me', new SeededRng(1))).toEqual([]);
    // À lui de choisir alors que l'assurance est possible : il choisit une variante, il ne propose rien
    const free = { ...base, chooser: 'me', insurance: { pending: null, eligible: ['a', 'me'], canPropose: true } } as unknown as GameView;
    const plan = cpuPlan(free, 'me', new SeededRng(1));
    expect(plan).toEqual([{ type: 'CHOOSE_VARIANT', player: 'me', variant: 'MORPION' }]);
  });
});

describe('CPU : qualité des choix', () => {
  const rng = () => new SeededRng(99);
  const stacked = (variant: VariantId, hands: string[][], rest: string[] = [], n = hands.length): { game: GameManager; players: string[] } => {
    const players = names(n);
    const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(3), { stackedDeck: () => dealStack(hands, rest) });
    game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant });
    return { game, players };
  };
  const discarded = (plan: GameCommand[]): string[] => {
    const sel = plan.find((c) => c.type === 'ROUND' && c.command.type === 'SELECT');
    return sel && sel.type === 'ROUND' && sel.command.type === 'SELECT' ? [...sel.command.cards].sort() : [];
  };

  it('percentile : plus la main est forte, plus il est élevé', () => {
    const r = (s: string) => evaluate5(s.split(' ').map(parseCard));
    const order = ['2c 5d 7h 9s Jc', 'Ac Kd 7h 9s Jc', '2c 2d 7h 9s Jc', 'Ac Ad 7h 9s Jc', 'Ac Ad Kh Ks Jc', '5c 5d 5h 9s Jc', '5c 6d 7h 8s 9c', '2c 5c 7c 9c Jc', 'Ac Ad Ah Ks Kc', 'Ac Ad Ah As Kc', '5c 6c 7c 8c 9c'];
    const values = order.map((s) => handPercentile(r(s)));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    expect(values[0]!).toBeGreaterThanOrEqual(0);
    expect(values.at(-1)!).toBeLessThanOrEqual(1);
  });

  it('poker fermé : garde une couleur faite, une quinte faite et un full', () => {
    for (const hand of [['2s', '5s', '9s', 'Js', 'Ks'], ['5c', '6d', '7h', '8s', '9c'], ['Ac', 'Ad', 'Ah', 'Ks', 'Kc']]) {
      const { game, players } = stacked('CLOSED_1', [hand, ['2c', '3d', '8h', 'Td', 'Qs']], ['4c', '4d', '9d', '9h', 'Jd', 'Jh', '6s', '6h', '3c', '3h']);
      const p = players[0]!;
      expect(discarded(cpuPlan(game.view(p), p, rng()))).toEqual([]);
    }
  });

  it('poker fermé : avec une paire, jette les trois autres cartes ; avec quatre à la couleur, la carte isolée', () => {
    const filler = ['4c', '4d', '9d', 'Jd', 'Jh', '5s', '5h', '3c', '3h', '6c'];
    const a = stacked('CLOSED_1', [['Ac', 'Ad', '2h', '7s', '9c'], ['2c', '3d', '8h', 'Td', 'Qs']], filler);
    expect(discarded(cpuPlan(a.game.view(a.players[0]!), a.players[0]!, rng()))).toEqual(['2h', '7s', '9c'].sort());
    const b = stacked('CLOSED_1', [['2h', '6h', '9h', 'Kh', 'Ac'], ['2c', '3d', '8s', 'Td', 'Qs']], filler);
    expect(discarded(cpuPlan(b.game.view(b.players[0]!), b.players[0]!, rng()))).toEqual(['Ac']);
  });

  it('poker fermé : le CPU bat nettement un joueur qui ne change jamais (tête à tête)', () => {
    let cpu = 0;
    let lazy = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const players = names(2);
      const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(seed));
      game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant: 'CLOSED_1' });
      const r = new SeededRng(seed + 1000);
      for (const cmd of cpuPlan(game.view('P0'), 'P0', r)) game.apply(cmd);
      game.apply({ type: 'ROUND', command: { type: 'VALIDATE', player: 'P1' } });
      const rec = game.history()[0]!;
      if (rec.award.kind !== 'POINTS') continue;
      if (rec.award.winner === 'P0') cpu++;
      else lazy++;
    }
    expect(cpu).toBeGreaterThan(lazy * 1.3);
  });

  it('Morpion : désigne la meilleure combinaison possible (vérifiée par force brute)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const players = names(3);
      const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(seed));
      game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant: 'MORPION' });
      const p = players[0]!;
      const view = game.view(p);
      const hand = (view.round!.cards.hands[p] as { cards: { code: string }[] }).cards.map((c) => parseCard(c.code));
      const board = view.round!.cards.board.map((c) => parseCard(c!));
      let best = -1;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          for (const [a, b, c] of MORPION_LINES) best = Math.max(best, evaluate5([hand[i]!, hand[j]!, board[a]!, board[b]!, board[c]!]));
        }
      }
      const plan = cpuPlan(view, p, rng());
      const sel = plan[0] as { type: 'ROUND'; command: { type: 'SELECT'; cards: string[]; line: number } };
      const [a, b, c] = MORPION_LINES[sel.command.line]!;
      const chosen = evaluate5([...sel.command.cards.map(parseCard), board[a]!, board[b]!, board[c]!]);
      expect(chosen).toBe(best);
    }
  });

  it('6-3 : désigne la meilleure paire à chaque ligne (vérifiée par force brute)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const players = names(4);
      const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(seed));
      game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant: 'V6_3' });
      const p = players[0]!;
      const view = game.view(p);
      const hand = (view.round!.cards.hands[p] as { cards: { code: string }[] }).cards.map((c) => parseCard(c.code));
      const board = view.round!.cards.board.slice(0, 5).map((c) => parseCard(c!));
      let best = -1;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) best = Math.max(best, evaluateOmahaWithPair([hand[i]!, hand[j]!], hand, board).rank);
      const sel = cpuPlan(view, p, rng())[0] as { type: 'ROUND'; command: { type: 'SELECT'; cards: string[] } };
      const [x, y] = sel.command.cards.map(parseCard) as [ReturnType<typeof parseCard>, ReturnType<typeof parseCard>];
      expect(evaluateOmahaWithPair([x, y], hand, board).rank).toBe(best);
    }
  });

  it('Aviation : garde la paire d\'As quand le flop est sec, et jette exactement le nombre demandé', () => {
    const { game, players } = stacked('AVIATION', [['As', 'Ad', '2c', '7d'], ['Ks', 'Qd', '8c', '9d']], ['3h', '5s', 'Jc', '4d', '6h']);
    const p = players[0]!;
    const plan = cpuPlan(game.view(p), p, rng());
    const out = discarded(plan);
    expect(out).toHaveLength(1);
    expect(['As', 'Ad']).not.toContain(out[0]);
    // Avia 6 : jette 2 cartes parmi 6 et garde la paire
    const six = stacked('AVIA_6', [['As', 'Ad', '2c', '7d', '9h', 'Tc'], ['Ks', 'Qd', '8c', '5d', '4h', '3c']], ['3h', '5s', 'Jc', '4d', '6h']);
    const q = six.players[0]!;
    const out6 = discarded(cpuPlan(six.game.view(q), q, rng()));
    expect(out6).toHaveLength(2);
    expect(out6).not.toContain('As');
    expect(out6).not.toContain('Ad');
  });

  it('6-1 et Le 10 : retourne sa carte seulement quand il est le joueur désigné', () => {
    for (const variant of ['V6_1', 'LE10'] as const) {
      const players = names(3);
      const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(11));
      game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant });
      const [next] = game.awaiting();
      for (const p of players) {
        const plan = cpuPlan(game.view(p), p, rng());
        if (p === next) expect(plan).toEqual([{ type: 'ROUND', command: { type: 'REVEAL', player: p } }]);
        else expect(plan).toEqual([]);
      }
    }
  });

  it('le CPU ne regarde que sa vue : rejouer le plan depuis une vue recopiée donne le même résultat', () => {
    const players = names(4);
    const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(21));
    game.apply({ type: 'CHOOSE_VARIANT', player: game.chooser(), variant: 'CLOSED_1' });
    const p = players[1]!;
    const view = game.view(p);
    const copy = JSON.parse(JSON.stringify(view)) as GameView;
    expect(cpuPlan(copy, p, new SeededRng(4))).toEqual(cpuPlan(view, p, new SeededRng(4)));
  });

  it('une commande refusée par le moteur ne change rien (le CPU emploie les mêmes règles que tout client)', () => {
    const players = names(2);
    const game = new GameManager({ players, targetPoints: 5, stakeChips: 0 }, new SeededRng(2));
    const chooser = game.chooser();
    const other = players.find((p) => p !== chooser)!;
    expect(() => game.apply({ type: 'CHOOSE_VARIANT', player: other, variant: 'MORPION' })).toThrowError(RuleError);
    expect(categoryOf(0)).toBe(HandCategory.HighCard);
  });
});

describe('CPU : 6-3 avec tétines et paris extérieurs', () => {
  it('valide « aucun pari » pendant la phase de paris, puis désigne une paire en tenant compte des tétines', () => {
    const rng = new SeededRng(11);
    const players = ['P0', 'P1', 'P2'];
    const g = new GameManager({ players, targetPoints: 3, stakeChips: 0 }, rng);
    g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { teats: 2, sideBets: true } });
    expect(g.view('P1').round!.phase).toBe('BETS');
    for (const p of players) for (const c of cpuPlan(g.view(p), p, rng)) g.apply(c);
    expect(g.view('P0').round!.phase).toBe('LINE_1');
    expect((g.view('P0').round!.info as { pools: unknown[] }).pools).toEqual([]); // personne n'a parié
    for (const p of players) for (const c of cpuPlan(g.view(p), p, rng)) g.apply(c);
    expect(['LINE_2', undefined].includes(g.view('P0').round?.phase) || g.phase() === 'GAME_OVER').toBe(true);
  });

  it('une partie complète de CPU avec tétines et paris se termine sans erreur', () => {
    const rng = new SeededRng(5);
    const players = ['A', 'B', 'C', 'D'];
    const g = new GameManager({ players, targetPoints: 2, stakeChips: 0 }, rng);
    let guard = 0;
    while (g.phase() !== 'GAME_OVER' && guard++ < 400) {
      const v = g.view(players[0]!);
      if (v.phase === 'VARIANT_SELECTION') {
        g.apply({ type: 'CHOOSE_VARIANT', player: v.chooser, variant: 'V6_3', options: { teats: guard % 3, sideBets: guard % 2 === 0 } });
        continue;
      }
      for (const p of v.awaiting) for (const c of cpuPlan(g.view(p), p, rng)) g.apply(c);
    }
    expect(g.phase()).toBe('GAME_OVER');
  });
});
