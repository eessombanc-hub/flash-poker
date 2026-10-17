import { describe, expect, it } from 'vitest';
import { ALL_CARDS, parseCard } from '../src/core/card';
import { HandCategory as C } from '../src/evaluation/handEvaluator';
import { evaluateVisible } from '../src/evaluation/visibleEvaluator';
import type { Round, RevealStep, RoundView } from '../src/variants';
import { RuleError } from '../src/variants';
import { codesIn, dealStack, mk, names } from './helpers';

const BOARD = ['2c', '7d', '9h', 'Js', 'Kc'];
const reveal = (r: Round, p: string) => r.apply({ type: 'REVEAL', player: p });
const history = (r: Round) => r.view(null).info.history as RevealStep[];

/** 4 joueurs ; les 6es cartes (dernière colonne) : P0=9, P1=4, P2=7, P3=2 */
const H4 = [
  ['3d', '4h', '5s', '8c', 'Td', '9s'],
  ['As', 'Ad', '6c', '3h', '4s', '4d'],
  ['Ah', 'Ac', '8d', '9c', '2d', '7h'],
  ['Qs', 'Qd', 'Qh', 'Qc', '5h', '2h'],
];

describe('6-1 : distribution et premier révélateur', () => {
  it('6 cartes par joueur : 5 cachées, la 6e visible ; plateau de 5 cartes visible d\'emblée ; le propriétaire ne voit pas non plus ses cartes cachées', () => {
    const r = mk('V6_1', 4, dealStack(H4, BOARD));
    const v = r.view('P0');
    expect(v.cards.board).toEqual(BOARD);
    expect(v.cards.hands.P1).toMatchObject({ kind: 'opponent', shown: ['4d'], hiddenCount: 5 });
    const own = v.cards.hands.P0 as { kind: 'own'; cards: { code: string | null; visible: boolean }[] };
    expect(own.kind).toBe('own');
    expect(own.cards.filter((c) => c.visible).map((c) => c.code)).toEqual(['9s']); // sa 6e carte, seule connue
    expect(own.cards.filter((c) => !c.visible).every((c) => c.code === null)).toBe(true); // ses 5 autres : masquées, même pour lui
    expect(codesIn(v)).toEqual(new Set([...BOARD, '9s', '4d', '7h', '2h'])); // aucune de ses propres cartes cachées n'y figure
  });

  it('Test A : la plus faible 6e carte commence', () => {
    const r = mk('V6_1', 4, dealStack(H4, BOARD));
    expect(r.awaiting()).toEqual(['P3']);
    expect(r.view(null).info).toMatchObject({ next: 'P3', reason: 'LOWEST_SIXTH_CARD' });
  });

  /** Mains explicites (aucun doublon entre elles ni avec BOARD). 6es cartes : voir chaque test. */
  const withSixth = (sixth: [string, string, string, string]) => {
    const base = [
      ['2d', '4h', '5s', '8c', 'Td'],
      ['Ad', '6c', '3h', '4s', 'Qd'],
      ['Ah', 'Ac', '8d', '9c', 'Kd'],
      ['Qs', 'Qh', 'Qc', '6h', '7c'],
    ];
    return base.map((h, i) => [...h, sixth[i]!]);
  };

  it('Test B : deux joueurs ont la même 6e carte → l\'ordre UTG les départage', () => {
    // 6es cartes : P0=9s, P1=4d, P2=4c, P3=7h → P1 et P2 à égalité, P1 (UTG+1) avant P2 (UTG+2)
    const r = mk('V6_1', 4, dealStack(withSixth(['9s', '4d', '4c', '7h']), BOARD));
    expect(r.awaiting()).toEqual(['P1']);
    // 6es cartes : P0=4d, P1=9s, P2=4c, P3=7h → P0 (UTG) et P2 à égalité : UTG commence
    const r2 = mk('V6_1', 4, dealStack(withSixth(['4d', '9s', '4c', '7h']), BOARD));
    expect(r2.awaiting()).toEqual(['P0']);
    expect(r2.view(null).info).toMatchObject({ next: 'P0', reason: 'LOWEST_SIXTH_CARD' });
  });

  it('l\'As est la carte la plus forte, et les couleurs ne départagent pas', () => {
    // 6es cartes : P0=As, P1=3c, P2=5d, P3=9s → si l'As valait 1, P0 commencerait ; il vaut 14 : P1 (3) commence
    const r = mk('V6_1', 4, dealStack(withSixth(['As', '3c', '5d', '9s']), BOARD));
    expect(r.awaiting()).toEqual(['P1']);
    // même rang, couleurs différentes : égalité, donc UTG
    const r2 = mk('V6_1', 4, dealStack(withSixth(['3s', '3c', '5d', '9s']), BOARD));
    expect(r2.awaiting()).toEqual(['P0']);
  });
});

describe('6-1 : révélation dynamique', () => {
  // 2 joueurs — scénario détaillé
  const H2 = [
    ['Kd', '3h', '4s', '5d', '6h', '2d'],
    ['8c', '9d', '4d', '5h', '6s', '9c'],
  ];
  const stack = () => dealStack(H2, BOARD);

  it('Test C : après une révélation, le joueur le plus faible change → ordre recalculé', () => {
    const r = mk('V6_1', 2, stack());
    expect(r.awaiting()).toEqual(['P0']); // 2 < 9
    const ev = reveal(r, 'P0'); // Kd → P0 : double paire K-2 ; P1 : paire de 9 (plateau)
    expect(ev.map((e) => e.type)).toEqual(['CARD_REVEALED', 'REVEAL_ORDER_RECOMPUTED']);
    expect(r.awaiting()).toEqual(['P1']);
    expect(history(r)[0]).toMatchObject({ revealer: 'P0', card: 'Kd', nextRevealer: 'P1', reason: 'WEAKEST' });
    expect(history(r)[0]!.ranking.P0!.category).toBe(C.TwoPair);
    expect(history(r)[0]!.ranking.P1!.category).toBe(C.Pair);
  });

  it('Test D : une révélation transforme une paire en brelan → reclassement immédiat', () => {
    const r = mk('V6_1', 2, stack());
    reveal(r, 'P0');
    reveal(r, 'P1'); // 8c : P1 reste à la paire de 9 → encore le plus faible
    expect(r.awaiting()).toEqual(['P1']);
    expect(history(r)[1]!.ranking.P1!.category).toBe(C.Pair);
    reveal(r, 'P1'); // 9d → brelan de 9 (9c 9d + 9h du plateau)
    expect(history(r)[2]!.ranking.P1!.category).toBe(C.ThreeOfAKind);
    expect(r.awaiting()).toEqual(['P0']); // P0 (double paire) devient le plus faible
  });

  it('le propriétaire découvre ses propres cartes au même rythme que ses adversaires, jamais avant', () => {
    const r = mk('V6_1', 2, stack());
    const before = r.view('P0').cards.hands.P0 as { cards: { code: string | null; visible: boolean }[] };
    expect(before.cards.filter((c) => !c.visible).every((c) => c.code === null)).toBe(true); // rien avant révélation
    reveal(r, 'P0'); // P0 retourne sa propre carte (Kd)
    const after = r.view('P0').cards.hands.P0 as { cards: { code: string | null; visible: boolean }[] };
    const revealed = after.cards.filter((c) => c.visible);
    expect(revealed.map((c) => c.code)).toContain('Kd'); // celle qu'il vient de retourner : connue
    expect(after.cards.filter((c) => !c.visible).every((c) => c.code === null)).toBe(true); // les autres : toujours masquées, même pour lui
  });

  it('Test E : toutes les cartes visibles (5 × n révélations) → showdown Omaha 2+3 exact', () => {
    const r = mk('V6_1', 2, stack());
    let steps = 0;
    while (!r.result()) {
      reveal(r, r.awaiting()[0]!);
      steps++;
    }
    expect(steps).toBe(10);
    // P1 : brelan de 9 avec 9d 9c (2 privées) + 9h Kc Js (3 communes) ; P0 : double paire au mieux
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P1', points: 1 });
    expect(r.view(null).cards.hands.P0).toMatchObject({ hiddenCount: 0 });
  });

  it('seul le joueur désigné peut révéler ; commandes étrangères refusées', () => {
    const r = mk('V6_1', 2, stack());
    expect(() => reveal(r, 'P1')).toThrowError(/pas le joueur désigné/);
    expect(() => r.apply({ type: 'VALIDATE', player: 'P0' })).toThrowError(RuleError);
    expect(() => r.apply({ type: 'SELECT', player: 'P0', cards: [] })).toThrowError(RuleError);
    expect(r.awaiting()).toEqual(['P0']);
  });

  it('minuteur de 30 s : à l\'échéance, la prochaine carte du joueur désigné est retournée automatiquement', () => {
    const manual = mk('V6_1', 2, stack());
    const auto = mk('V6_1', 2, stack());
    const ev = reveal(manual, 'P0');
    const evAuto = auto.apply({ type: 'TIMEOUT' });
    expect(evAuto.find((e) => e.type === 'CARD_REVEALED')!.data).toMatchObject({ player: 'P0', card: 'Kd', auto: true });
    expect(ev.find((e) => e.type === 'CARD_REVEALED')!.data).toMatchObject({ player: 'P0', card: 'Kd', auto: false });
    // même effet qu'un retournement manuel : mêmes cartes visibles, même prochain révélateur
    expect(auto.view(null).cards).toEqual(manual.view(null).cards);
    expect(auto.awaiting()).toEqual(manual.awaiting());
    expect(history(auto)[0]).toEqual(history(manual)[0]);
  });

  it('une manche entière au minuteur seul donne le même résultat qu\'une manche jouée à la main', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 10; seed++) {
        const a = mk('V6_1', n, undefined, seed);
        const b = mk('V6_1', n, undefined, seed);
        let steps = 0;
        while (!a.result()) {
          a.apply({ type: 'TIMEOUT' });
          steps++;
        }
        while (!b.result()) reveal(b, b.awaiting()[0]!);
        expect(steps).toBe(5 * n);
        expect(a.result()).toEqual(b.result());
        expect(history(a).map((h) => h.card)).toEqual(history(b).map((h) => h.card));
      }
    }
  });

  it('égalité stricte : le dernier révélateur en retourne une nouvelle ; sinon le plus proche en ordre UTG', () => {
    // Plateau sans paire ni couleur ; P0 et P1 ont des 6es cartes identiques en rang (3 et 3)
    const board = ['2c', '7d', '9h', 'Js', 'Kc'];
    const h = [
      ['Ah', '5d', '6d', '8d', 'Td', '3d'], // P0
      ['Ac', '5h', '6h', '8h', 'Th', '3h'], // P1  (mêmes rangs que P0, autres couleurs)
      ['Qs', 'Qd', 'Qh', 'Qc', '4s', '4d'], // P2  (main forte)
    ];
    const r = mk('V6_1', 3, dealStack(h, board));
    expect(r.awaiting()).toEqual(['P0']); // 3 = 3 < 4 : égalité → UTG
    reveal(r, 'P0'); // Ah : P0 = A K J 9 7 ; P1 = K J 9 7 3 → P1 devient le plus faible (P2 : Q K J 9 7)
    expect(r.awaiting()).toEqual(['P1']);
    reveal(r, 'P1'); // Ac : P1 = A K J 9 7 = P0 (égalité stricte) ; P2 : Q K J 9 7 → P2 le plus faible
    expect(r.awaiting()).toEqual(['P2']);
    expect(history(r)[1]!.ranking.P0!.rank).toBe(history(r)[1]!.ranking.P1!.rank);
  });
});

/** Oracle indépendant : ne connaît QUE la vue publique (aucune carte cachée). */
function oracleNext(view: RoundView, order: string[], last: string | null): string {
  const board = view.cards.board.map((c) => parseCard(c!));
  const hands = view.cards.hands as Record<string, { shown: string[]; hiddenCount: number }>;
  if (last === null) {
    const six = order.map((p) => ({ p, rank: parseCard(hands[p]!.shown[0]!).rank as number }));
    const low = Math.min(...six.map((x) => x.rank));
    return six.find((x) => x.rank === low)!.p;
  }
  const cand = order.filter((p) => hands[p]!.hiddenCount > 0);
  const rank = (p: string) => evaluateVisible(board, hands[p]!.shown.map(parseCard)).rank;
  const low = Math.min(...cand.map(rank));
  const group = cand.filter((p) => rank(p) === low);
  if (group.length === 1) return group[0]!;
  return group.includes(last) ? last : group[0]!;
}

describe('6-1 : propriétés sur parties aléatoires (2 à 6 joueurs)', () => {
  it('l\'ordre de révélation correspond à un oracle qui ne voit que les cartes visibles, à chaque étape', () => {
    let total = 0;
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 40; seed++) {
        const r = mk('V6_1', n, undefined, seed * 31 + n);
        const order = names(n);
        let last: string | null = null;
        let steps = 0;
        while (!r.result()) {
          const expected = oracleNext(r.view(null), order, last);
          expect(r.awaiting()).toEqual([expected]);
          reveal(r, expected);
          last = expected;
          steps++;
          r.checkInvariants();
        }
        expect(steps).toBe(5 * n);
        for (const p of order) expect((r.view(null).cards.hands[p] as { hiddenCount: number }).hiddenCount).toBe(0);
        total++;
      }
    }
    expect(total).toBe(200);
  });

  it('le joueur le plus faible sans carte cachée ne peut pas révéler : le suivant le plus faible qui en a encore une révèle', () => {
    let skipCases = 0;
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 60; seed++) {
        const r = mk('V6_1', n, undefined, seed * 17 + n);
        while (!r.result()) reveal(r, r.awaiting()[0]!);
        const steps = history(r);
        const done: Record<string, number> = {};
        steps.forEach((step) => {
          done[step.revealer] = (done[step.revealer] ?? 0) + 1;
          if (step.nextRevealer === null) return;
          const left = (p: string) => 5 - (done[p] ?? 0);
          const ranks = names(n).map((p) => ({ p, rank: step.ranking[p]!.rank }));
          const overallMin = Math.min(...ranks.map((x) => x.rank));
          const weakest = ranks.filter((x) => x.rank === overallMin).map((x) => x.p);
          if (weakest.every((p) => left(p) === 0)) {
            skipCases++;
            const cand = ranks.filter((x) => left(x.p) > 0);
            const candMin = Math.min(...cand.map((x) => x.rank));
            expect(left(step.nextRevealer)).toBeGreaterThan(0);
            expect(step.ranking[step.nextRevealer]!.rank).toBe(candMin);
            expect(weakest).not.toContain(step.nextRevealer);
          }
        });
      }
    }
    expect(skipCases).toBeGreaterThan(0); // le cas est bien exercé par les parties aléatoires
  });

  it('la vue ne montre que des cartes visibles (aucune carte cachée adverse) pendant toute la manche', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = mk('V6_1', 4, undefined, seed);
      while (!r.result()) {
        const hands = r.snapshot().cards.hands;
        const own = new Set((r.view('P0').cards.hands.P0 as { cards: { code: string }[] }).cards.map((c) => c.code));
        const seen = codesIn(r.view('P0'));
        for (const p of names(4)) {
          for (const e of hands[p]!) {
            const code = ALL_CARDS[e.id]!.code;
            if (!e.visible && !own.has(code)) expect(seen.has(code)).toBe(false);
          }
        }
        reveal(r, r.awaiting()[0]!);
      }
    }
  });

  it('reprise après snapshot : même suite de révélations, même résultat', () => {
    const a = mk('V6_1', 4, undefined, 77);
    const b = mk('V6_1', 4, undefined, 77);
    for (let i = 0; i < 7; i++) {
      reveal(a, a.awaiting()[0]!);
      reveal(b, b.awaiting()[0]!);
    }
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });
});

