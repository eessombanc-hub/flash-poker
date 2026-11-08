import { describe, expect, it } from 'vitest';
import { chooseMove, COLUMNS, SeededRng, TableauError, TableauGame, verifyTableauReveal, type AiLevel, type Seat } from '../src';

const SEED = 'main5';
function playAuto(seed: string): TableauGame {
  const g = new TableauGame(seed, 'hand5');
  while (!g.finished) {
    const s = g.turn!;
    g.place(s, g.autoColumn(s), true, g.autoCard(s));
  }
  return g;
}

describe('Tableau 5 cartes — règles', () => {
  it('départ : une carte ouvre chaque colonne, 5 cartes en main, pioche de 16 dont 15 jouables', () => {
    const g = new TableauGame(SEED, 'hand5');
    for (const s of [0, 1] as const) {
      expect(g.columnsOf(s).map((c) => c[0])).toEqual(g.deal.initial[s]);
      expect(g.columnsOf(s).every((c) => c.length === 1)).toBe(true);
      expect(g.handOf(s)).toEqual(g.deal.deck[s]!.slice(0, 5));
    }
    const v = g.view(g.turn!);
    expect(v.variant).toBe('hand5');
    expect(v.remaining).toEqual([20, 20]);
    expect(v.pile).toEqual([15, 15]);
    expect(v.handCount).toEqual([5, 5]);
    expect(v.hand).toHaveLength(5);
  });

  it('à son tour : la carte piochée ou une carte de la main ; la piochée rejoint alors la main', () => {
    const g = new TableauGame(SEED, 'hand5');
    const s = g.turn!;
    const drawn = g.drawn(s)!;
    const inHand = g.handOf(s)[2]!;
    expect(g.options(s)).toEqual([drawn, ...g.handOf(s)]);
    g.place(s, 0, false, inHand);
    expect(g.columnsOf(s)[0]).toEqual([g.deal.initial[s][0], inHand]);
    expect(g.handOf(s)).toContain(drawn);
    expect(g.handOf(s)).not.toContain(inHand);
    expect(g.handOf(s)).toHaveLength(5);
    // jouer la piochée laisse la main intacte
    const t = g.turn!;
    const hand = g.handOf(t);
    const d = g.drawn(t)!;
    g.place(t, 1, false, d);
    expect(g.handOf(t)).toEqual(hand);
    expect(g.columnsOf(t)[1]).toEqual([g.deal.initial[t][1], d]);
  });

  it('carte inconnue ou déjà jouée : refusée ; l’adversaire ne joue pas votre main', () => {
    const g = new TableauGame(SEED, 'hand5');
    const s = g.turn!;
    const other = g.handOf((1 - s) as Seat)[0]!;
    expect(() => g.place(s, 0, false, other)).toThrowError(TableauError);
    expect(() => g.place(s, 0, false, 'Zz')).toThrow(/jouable/);
    const played = g.handOf(s)[0]!;
    g.place(s, 0, false, played);
    g.place(g.turn!, 0, false, g.autoCard(g.turn!));
    expect(() => g.place(s, 1, false, played)).toThrow(/jouable/);
  });

  it('partie complète : 40 coups, 15 pioches puis 5 cartes de la main, cinq colonnes pleines, 16e carte jamais jouée', () => {
    const g = playAuto(SEED);
    expect(g.ply).toBe(40);
    expect(g.placed).toEqual([20, 20]);
    for (const s of [0, 1] as const) {
      expect(g.columnsOf(s).every((c) => c.length === 5)).toBe(true);
      expect(g.handOf(s)).toHaveLength(0);
      expect(g.columnsOf(s).flat()).not.toContain(g.deal.deck[s]![20]);
      expect(g.columnsOf(s).flat()).not.toContain(g.deal.deck[s]![15 + 5]);
    }
    const all = [0, 1].flatMap((s) => g.columnsOf(s as Seat).flat());
    expect(new Set(all).size).toBe(50);
    expect(g.result()!.score[0] + g.result()!.score[1] + g.result()!.ties).toBe(5);
    expect(verifyTableauReveal(g.reveal()!)).toBe(true);
  });

  it('dernière carte du paquet : plus de pioche, on joue obligatoirement la main', () => {
    const g = new TableauGame(SEED, 'hand5');
    for (let i = 0; i < 30; i++) {
      const s = g.turn!;
      g.place(s, g.autoColumn(s), true, g.autoCard(s));
    }
    // 15 pioches chacun faites : il reste 1 carte au paquet
    const s = g.turn!;
    const v = g.view(s);
    expect(v.pile).toEqual([0, 0]);
    expect(v.yourCard).toBeNull();
    expect(v.hand).toHaveLength(5);
    expect(g.options(s)).toEqual(g.handOf(s));
    expect(() => g.place(s, g.legalColumns(s)[0]!, false, g.deal.deck[s]![20])).toThrow(/jouable/);
    while (!g.finished) g.place(g.turn!, g.autoColumn(g.turn!), true, g.autoCard(g.turn!));
    expect(g.ply).toBe(40);
  });

  it('la vue adverse ne contient ni la main ni la pioche de l’autre', () => {
    const g = new TableauGame(SEED, 'hand5');
    for (let i = 0; i < 7; i++) g.place(g.turn!, g.autoColumn(g.turn!), true, g.autoCard(g.turn!));
    for (const you of [0, 1] as const) {
      const json = JSON.stringify(g.view(you));
      const opp = (1 - you) as Seat;
      for (const c of g.handOf(opp)) if (!g.columnsOf(opp).flat().includes(c)) expect(json.includes(`"${c}"`)).toBe(false);
      for (const c of g.deal.deck[opp]!.slice(0)) if (!g.columnsOf(opp).flat().includes(c)) expect(json.includes(`"${c}"`)).toBe(false);
    }
  });

  it('reprise : le journal (avec les cartes jouées) redonne exactement l’état', () => {
    const g = new TableauGame(SEED, 'hand5');
    for (let i = 0; i < 23; i++) {
      const s = g.turn!;
      const o = g.options(s);
      g.place(s, g.legalColumns(s).at(-1)!, false, o[i % o.length]);
    }
    const r = TableauGame.replay(SEED, g.log, 'hand5');
    for (const s of [0, 1] as const) {
      expect(r.view(s)).toEqual(g.view(s));
      expect(r.handOf(s)).toEqual(g.handOf(s));
    }
  });

  it('la variante classique reste inchangée', () => {
    const g = new TableauGame(SEED);
    expect(g.variant).toBe('classic');
    expect(g.view(0).hand).toEqual([]);
    expect(g.totalPlies).toBe(40);
    expect(g.columnsOf(0).every((c) => c.length === 1)).toBe(true);
  });
});

describe('Tableau 5 cartes — IA', () => {
  const rng = new SeededRng(5);
  for (const level of ['beginner', 'intermediate', 'expert'] as AiLevel[]) {
    it(`${level} joue une partie complète, légalement, avec des cartes de sa main`, () => {
      const g = new TableauGame(`ai-${level}`, 'hand5');
      let fromHand = 0;
      while (!g.finished) {
        const s = g.turn!;
        const m = chooseMove(g.view(s), level, { rng, maxSims: 12, budgetMs: 1000 });
        expect(g.options(s)).toContain(m.card);
        expect(g.legalColumns(s)).toContain(m.col);
        if (m.card !== g.drawn(s)) fromHand++;
        g.place(s, m.col, false, m.card);
      }
      expect(g.ply).toBe(40);
      expect(COLUMNS).toBe(5);
      expect(fromHand).toBeGreaterThan(0);
    });
  }

  it('Intermédiaire bat le Débutant en variante 5 cartes (parties appariées)', () => {
    let pts = 0;
    const games = 30;
    for (let i = 0; i < games; i++) {
      const swap = i % 2 === 1;
      const levels: AiLevel[] = swap ? ['beginner', 'intermediate'] : ['intermediate', 'beginner'];
      const r = new SeededRng(300 + i);
      const g = new TableauGame(`h5-${i}`, 'hand5');
      while (!g.finished) {
        const s = g.turn!;
        const m = chooseMove(g.view(s), levels[s]!, { rng: r });
        g.place(s, m.col, false, m.card);
      }
      const w = g.result()!.winner;
      if (w === null) pts += 0.5;
      else if ((w === 0) !== swap) pts += 1;
    }
    expect(pts / games).toBeGreaterThan(0.55);
  }, 60_000);
});
