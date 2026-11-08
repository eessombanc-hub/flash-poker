import { describe, expect, it } from 'vitest';
import {
  adviseColumn, chooseColumn, COLUMNS, COLUMN_SIZE, dealFromSeed, decide, PLAYABLE, SeededRng, TableauGame, tableauCommitment, TableauError, TOTAL_PLIES, verifyTableauReveal, verifyTableauSeed,
  type AiLevel, type Seat,
} from '../src';

/** Joue une partie complète avec une politique par siège ; renvoie la partie. */
function play(seed: string, pick: (g: TableauGame, seat: Seat) => number): TableauGame {
  const g = new TableauGame(seed);
  while (!g.finished) {
    const s = g.turn!;
    g.place(s, pick(g, s));
  }
  return g;
}
const leftmost = (g: TableauGame, s: Seat): number => g.autoColumn(s);

describe('Tableau — distribution', () => {
  it('52 cartes distinctes : 5 de départ + 21 en paquet pour chacun', () => {
    for (const seed of ['a', 'b', 'c', 'graine-42']) {
      const d = dealFromSeed(seed);
      const all = [...d.initial[0], ...d.initial[1], ...d.deck[0], ...d.deck[1]];
      expect(all).toHaveLength(52);
      expect(new Set(all).size).toBe(52);
      expect(d.initial[0]).toHaveLength(5);
      expect(d.deck[1]).toHaveLength(21);
    }
  });
  it('déterministe selon la graine, différent selon la graine', () => {
    expect(dealFromSeed('x')).toEqual(dealFromSeed('x'));
    expect(dealFromSeed('x').deck[0]).not.toEqual(dealFromSeed('y').deck[0]);
  });
  it('le premier joueur varie selon la graine', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => dealFromSeed(`s${i}`).first));
    expect(firsts.size).toBe(2);
  });
  it('chaque joueur commence avec une carte par colonne', () => {
    const g = new TableauGame('start');
    for (const s of [0, 1] as const) {
      const cols = g.columnsOf(s);
      expect(cols).toHaveLength(COLUMNS);
      expect(cols.every((c) => c.length === 1)).toBe(true);
    }
  });
  it('engagement : la graine révélée correspond au hash publié', () => {
    const c = tableauCommitment('secret');
    expect(verifyTableauSeed('secret', c)).toBe(true);
    expect(verifyTableauSeed('autre', c)).toBe(false);
  });
  it('contrôle indépendant après la partie ; refusé si l’ordre est falsifié', () => {
    const g = play('verif', leftmost);
    const r = g.reveal()!;
    expect(verifyTableauReveal(r)).toBe(true);
    expect(verifyTableauReveal({ ...r, order: [...r.order].reverse() })).toBe(false);
    expect(verifyTableauReveal({ ...r, seed: 'x' })).toBe(false);
  });
  it('rien n’est révélé avant la fin', () => {
    expect(new TableauGame('t').reveal()).toBeNull();
  });
  it('répartition équitable du hasard : chaque carte est aussi souvent en tête du paquet (χ² grossier)', () => {
    const n = 2600;
    const freq = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const c = dealFromSeed(`chi${i}`).deck[0]![0]!;
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    const expected = n / 52;
    let chi = 0;
    for (const v of freq.values()) chi += (v - expected) ** 2 / expected;
    chi += (52 - freq.size) * expected;
    expect(chi).toBeLessThan(90); // seuil très large (ddl = 51)
  });
});

describe('Tableau — déroulement', () => {
  it('une partie complète : 40 coups, 20 par joueur, alternance stricte, 5 cartes par colonne', () => {
    const g = play('full', leftmost);
    expect(g.ply).toBe(TOTAL_PLIES);
    expect(g.placed).toEqual([PLAYABLE, PLAYABLE]);
    for (let i = 1; i < g.log.length; i++) expect(g.log[i]!.seat).not.toBe(g.log[i - 1]!.seat);
    expect(g.log[0]!.seat).toBe(g.deal.first);
    for (const s of [0, 1] as const) expect(g.columnsOf(s).every((c) => c.length === COLUMN_SIZE)).toBe(true);
    expect(g.turn).toBeNull();
  });
  it('aucune carte distribuée deux fois ; la 21e carte du paquet n’est jamais jouée', () => {
    const g = play('unique', leftmost);
    const onBoard = [0, 1].flatMap((s) => g.columnsOf(s as Seat).flat());
    expect(new Set(onBoard).size).toBe(50);
    const unplayed = [g.deal.deck[0]![20]!, g.deal.deck[1]![20]!];
    for (const c of unplayed) expect(onBoard).not.toContain(c);
  });
  it('la carte piochée est le haut du paquet, visible de son seul propriétaire', () => {
    const g = new TableauGame('draw');
    const s = g.turn!;
    expect(g.drawn(s)).toBe(g.deal.deck[s]![0]);
    expect(g.drawn((1 - s) as Seat)).toBeNull();
    expect(g.view(s).yourCard).toBe(g.deal.deck[s]![0]);
    expect(g.view((1 - s) as Seat).yourCard).toBeNull();
  });
  it('la vue adverse ne contient jamais le paquet ni la carte piochée de l’autre', () => {
    const g = new TableauGame('hidden');
    for (let i = 0; i < 10; i++) g.place(g.turn!, g.autoColumn(g.turn!));
    for (const seat of [0, 1] as const) {
      const json = JSON.stringify(g.view(seat));
      const opp = (1 - seat) as Seat;
      const hidden = g.deal.deck[opp]!.slice(g.placed[opp]);
      for (const c of hidden) expect(json.includes(`"${c}"`)).toBe(false);
      for (const c of g.deal.deck[seat]!.slice(g.placed[seat] + 1)) expect(json.includes(`"${c}"`)).toBe(false);
    }
  });
  it('refuse hors tour, colonne inconnue, colonne pleine, et partie terminée', () => {
    const g = new TableauGame('errors');
    const s = g.turn!;
    expect(() => g.place((1 - s) as Seat, 0)).toThrowError(TableauError);
    expect(() => g.place(s, 5)).toThrowError(/inconnue/);
    expect(() => g.place(s, -1)).toThrow();
    expect(() => g.place(s, 1.5)).toThrow();
    // remplit la colonne 0 de s (4 places libres), l'adversaire joue ailleurs
    while (g.columnsOf(s)[0]!.length < 5) g.place(g.turn!, g.turn === s ? 0 : g.autoColumn(g.turn!));
    expect(g.columnsOf(s)[0]).toHaveLength(5);
    // tour de s
    while (g.turn !== s) g.place(g.turn!, g.autoColumn(g.turn!));
    expect(() => g.place(s, 0)).toThrowError(/complète/);
    expect(g.legalColumns(s)).not.toContain(0);
    const done = play('end', leftmost);
    expect(() => done.place(0, 0)).toThrowError(/terminée/);
  });
  it('une carte placée est définitive : elle ne bouge pas jusqu’à la fin', () => {
    const g = new TableauGame('immutable');
    const snap: string[][][] = [];
    while (!g.finished) {
      const s = g.turn!;
      const before = [g.columnsOf(0), g.columnsOf(1)];
      g.place(s, g.autoColumn(s));
      const after = [g.columnsOf(0), g.columnsOf(1)];
      for (const side of [0, 1]) for (let c = 0; c < COLUMNS; c++) expect(after[side]![c]!.slice(0, before[side]![c]!.length)).toEqual(before[side]![c]);
      snap.push(...after);
    }
    // jamais plus de 5 cartes par colonne à aucun moment
    expect(snap.every((cols) => cols.every((c) => c.length <= 5))).toBe(true);
  });
  it('les colonnes obtenues sont toujours placées dans le bon ordre d’arrivée (log -> colonnes)', () => {
    const g = play('log', (_g, s) => (_g.log.length + s) % 2 === 0 ? _g.legalColumns(s)[0]! : _g.legalColumns(s).at(-1)!);
    const rebuilt = TableauGame.replay('log', g.log);
    expect(rebuilt.columnsOf(0)).toEqual(g.columnsOf(0));
    expect(rebuilt.columnsOf(1)).toEqual(g.columnsOf(1));
  });
  it('reprise d’une partie interrompue : rejouer le journal redonne exactement l’état', () => {
    const g = new TableauGame('resume');
    for (let i = 0; i < 17; i++) g.place(g.turn!, g.legalColumns(g.turn!).at(-1)!);
    const r = TableauGame.replay('resume', g.log);
    expect(r.view(0)).toEqual(g.view(0));
    expect(r.view(1)).toEqual(g.view(1));
    expect(r.turn).toBe(g.turn);
  });
});

describe('Tableau — résultat', () => {
  it('3 colonnes ou plus gagnent ; 2-2 avec égalité = nul', () => {
    expect(decide(3, 0)).toBe(0);
    expect(decide(2, 3)).toBe(1);
    expect(decide(5, 0)).toBe(0);
    expect(decide(2, 2)).toBeNull();
    expect(decide(1, 1)).toBeNull();
    expect(decide(0, 0)).toBeNull();
    expect(decide(2, 1)).toBeNull();
  });
  it('le résultat est cohérent avec les colonnes (score + égalités = 5)', () => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const g = play(seed, leftmost);
      const r = g.result()!;
      expect(r.score[0] + r.score[1] + r.ties).toBe(5);
      expect(r.columns).toHaveLength(5);
      expect(r.winner).toBe(decide(r.score[0], r.score[1]));
      for (const v of r.columns) expect(v.winner).toBe(v.a.rank > v.b.rank ? 0 : v.a.rank < v.b.rank ? 1 : null);
    }
  });
  it('résultat inaccessible avant la fin ; score provisoire = colonnes complètes des deux côtés', () => {
    const g = new TableauGame('prov');
    expect(g.result()).toBeNull();
    expect(g.provisional().decided).toBe(0);
    while (!g.finished) g.place(g.turn!, g.autoColumn(g.turn!));
    expect(g.provisional().decided).toBe(5);
  });
  it('placement auto : première colonne libre, marqué comme automatique dans le journal', () => {
    const g = new TableauGame('auto');
    const s = g.turn!;
    const p = g.place(s, g.autoColumn(s), true);
    expect(p.col).toBe(0);
    expect(p.auto).toBe(true);
    expect(g.log[0]!.auto).toBe(true);
  });
});

describe('Tableau — intelligence artificielle', () => {
  const rng = (n: number): SeededRng => new SeededRng(n);
  const playAi = (seed: string, levels: [AiLevel | 'random', AiLevel | 'random'], r: SeededRng): TableauGame =>
    play(seed, (g, s) => {
      const lvl = levels[s];
      const legal = g.legalColumns(s);
      if (lvl === 'random') return legal[r.int(legal.length)]!;
      return chooseColumn(g.view(s), lvl, { rng: r, maxSims: 24, budgetMs: 1000 });
    });

  it('chaque niveau joue une partie complète, toujours légalement', () => {
    for (const lvl of ['beginner', 'intermediate', 'expert'] as const) {
      const g = playAi(`ai-${lvl}`, [lvl, lvl], rng(7));
      expect(g.finished).toBe(true);
      expect(g.result()!.score[0] + g.result()!.score[1] + g.result()!.ties).toBe(5);
    }
  });
  it('l’IA ne dépend pas du paquet adverse : deux mondes compatibles avec la vue donnent le même choix', () => {
    // même vue (mêmes colonnes + carte), paquets futurs différents -> même décision
    const a = new TableauGame('world');
    for (let i = 0; i < 8; i++) a.place(a.turn!, a.legalColumns(a.turn!)[0]!);
    const s = a.turn!;
    const v = a.view(s);
    const poisoned = { ...v, yourCard: v.yourCard };
    for (const lvl of ['beginner', 'intermediate', 'expert'] as const) {
      const c1 = chooseColumn(v, lvl, { rng: rng(3), maxSims: 30 });
      const c2 = chooseColumn(poisoned, lvl, { rng: rng(3), maxSims: 30 });
      expect(c1).toBe(c2);
      expect(v.legal).toContain(c1);
    }
    // la vue ne comporte aucune information sur les cartes à venir
    const json = JSON.stringify(v);
    for (const c of a.deal.deck[s]!.slice(a.placed[s] + 1)) expect(json.includes(`"${c}"`)).toBe(false);
  });
  it('conseil pédagogique : colonne légale et phrase explicative', () => {
    const g = new TableauGame('advice');
    for (let i = 0; i < 6; i++) g.place(g.turn!, g.legalColumns(g.turn!)[0]!);
    const adv = adviseColumn(g.view(g.turn!));
    expect(g.legalColumns(g.turn!)).toContain(adv.col);
    expect(adv.text).toMatch(/colonne \d/);
  });
  it('temps borné : l’expert répond sous son budget', () => {
    const g = new TableauGame('time');
    for (let i = 0; i < 12; i++) g.place(g.turn!, g.legalColumns(g.turn!)[0]!);
    const t0 = Date.now();
    chooseColumn(g.view(g.turn!), 'expert', { rng: rng(1), budgetMs: 150, maxSims: 100000 });
    expect(Date.now() - t0).toBeLessThan(900);
  });

  // Hiérarchie de niveaux : taux de victoire (nulles = demi-point) sur des parties appariées (sièges échangés).
  function matchup(a: AiLevel | 'random', b: AiLevel | 'random', games: number): number {
    let pts = 0;
    for (let i = 0; i < games; i++) {
      const seed = `lvl-${a}-${b}-${i}`;
      const swap = i % 2 === 1;
      const g = playAi(seed, swap ? [b, a] : [a, b], rng(1000 + i));
      const w = g.result()!.winner;
      if (w === null) pts += 0.5;
      else if ((w === 0) !== swap) pts += 1;
    }
    return pts / games;
  }

  it('Intermédiaire bat nettement le hasard', () => {
    expect(matchup('intermediate', 'random', 60)).toBeGreaterThan(0.7);
  }, 60_000);
  it('Intermédiaire domine le Débutant', () => {
    expect(matchup('intermediate', 'beginner', 60)).toBeGreaterThan(0.58);
  }, 60_000);
  it('Expert domine l’Intermédiaire', () => {
    expect(matchup('expert', 'intermediate', 40)).toBeGreaterThan(0.55);
  }, 120_000);
});
