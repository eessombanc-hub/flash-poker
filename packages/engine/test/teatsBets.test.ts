import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { GameManager, STARTING_CHIPS } from '../src/game/gameManager';
import { HandCategory } from '../src/evaluation/handEvaluator';
import { createRound, restoreRound, RuleError } from '../src/variants';
import type { LineResult, Round, SideBetResult } from '../src/variants';
import { Round63 } from '../src/variants';
import { dealStack, names, sel, TIMEOUT, val } from './helpers';

// Tétines et paris extérieurs du 6-3.

const HANDS = [
  ['As', 'Ad', '6s', '7s', '8s', '9s'], // P0
  ['Ks', 'Kd', 'Qs', 'Qd', 'Js', 'Jd'], // P1
  ['Ts', 'Td', '4s', '4d', '3s', '3d'], // P2
];
// Ligne 1 : quatre cœurs et un trèfle ; avec la tétine Kh, cinq cœurs communs (couleur jouée par tous).
const BOARD15 = ['2h', '5h', '9h', 'Jh', '3c', '2c', '5c', '9c', 'Jc', '8d', '2d', '5d', '9d', 'Qc', 'Tc'];
const TEATS = ['Kh', '7h'];
const AA: [string, string] = ['As', 'Ad'];
const KK: [string, string] = ['Ks', 'Kd'];
const TT: [string, string] = ['Ts', 'Td'];

function make(n: number, opts: { teats?: number; sideBets?: boolean; budgets?: number; hands?: string[][] } = {}): Round {
  const stack = dealStack((opts.hands ?? HANDS).slice(0, n), [...BOARD15, ...TEATS]);
  const budgets: Record<string, number> = {};
  for (const p of names(n)) budgets[p] = opts.budgets ?? 1000;
  return createRound('V6_3', { players: names(n), rng: new SeededRng(1), stackedDeck: stack, teats: opts.teats, sideBets: opts.sideBets, budgets });
}
const info = (r: Round, p = 'P0') => r.view(p).info as Record<string, any>;
const bet = (player: string, bets: { line: 1 | 2 | 3; amount: number }[]) => ({ type: 'BET' as const, player, bets });
const designate = (r: Round, picks: Record<string, [string, string]>, n: number) => {
  for (const [p, pair] of Object.entries(picks)) {
    r.apply(sel(p, pair));
    r.apply(val(p));
  }
  if (Object.keys(picks).length < n) r.apply(TIMEOUT);
};
const lastLine = (r: Round63): LineResult => r.lineResults().at(-1)!;

describe('6-3 : tétines', () => {
  it('sans tétine : aucune carte en plus, comportement inchangé', () => {
    const r = make(3, { teats: 0 });
    expect(info(r).teats).toBe(0);
    expect(info(r).teatCards).toEqual([]);
    expect(r.view('P0').cards.board).toHaveLength(15);
  });

  it('refuse un nombre de tétines hors de 0 à 2', () => {
    expect(() => make(3, { teats: 3 })).toThrow(RuleError);
    expect(() => make(3, { teats: -1 })).toThrow(RuleError);
    expect(() => make(3, { teats: 1.5 })).toThrow(RuleError);
  });

  it('les tétines sont des cartes supplémentaires, visibles de tous dès la distribution', () => {
    const r = make(3, { teats: 2 });
    const board = r.view('P1').cards.board;
    expect(board).toHaveLength(17);
    expect(board.slice(15)).toEqual(TEATS);
    expect(info(r, 'P2').teatCards).toEqual(TEATS);
    expect(info(r).teats).toBe(2);
    expect(() => r.checkInvariants()).not.toThrow();
  });

  it('une seule tétine : un seul emplacement', () => {
    const r = make(3, { teats: 1 });
    expect(r.view('P0').cards.board.slice(15)).toEqual(['Kh']);
  });

  it('avec tétines : toujours 2 cartes désignées + exactement 3 cartes communes (règle Omaha), tétines comprises', () => {
    // P0 détient deux cœurs : avec la tétine Kh, sa couleur monte (A Q K J 9 de cœur). P1 forme un brelan de rois
    // avec la tétine Kh. P2 n'a aucun cœur : les cinq cœurs communs ne lui donnent PAS de couleur (il faudrait
    // jouer 0 carte privée).
    const hands = [['Ah', 'Qh', '6s', '7s', '8s', '9s'], HANDS[1]!, HANDS[2]!];
    const r = make(3, { teats: 2, hands }) as Round63;
    designate(r, { P0: ['Ah', 'Qh'], P1: KK, P2: TT }, 3);
    const l = lastLine(r);
    expect(l.designations.P0!.category).toBe(HandCategory.Flush);
    expect(l.designations.P1!.category).toBe(HandCategory.ThreeOfAKind);
    expect(l.designations.P2!.category).toBe(HandCategory.Pair);
    // Sans tétine, la couleur de P0 est plus faible (Q J 9 5 2 au lieu de A Q K J 9) : la tétine l'améliore.
    expect(l.designations.P0!.baseRank).toBeLessThan(l.designations.P0!.rank);
    expect(l.winners).toEqual(['P0']);
  });

  it('une tétine ne remplace jamais une carte désignée : sans cœur en main, pas de couleur commune', () => {
    const r = make(3, { teats: 2 }) as Round63;
    designate(r, { P0: AA, P1: KK, P2: TT }, 3);
    const l = lastLine(r);
    for (const p of names(3)) expect(l.designations[p]!.category).not.toBe(HandCategory.Flush);
    expect(l.designations.P1!.category).toBe(HandCategory.ThreeOfAKind); // Ks Kd + la tétine Kh
    expect(l.winners).toEqual(['P1']);
  });

  it('les tétines coulissent à la ligne suivante une fois la ligne résolue', () => {
    const r = make(3, { teats: 2 }) as Round63;
    expect(info(r).line).toBe(1);
    designate(r, { P0: AA, P1: KK, P2: TT }, 3);
    expect(info(r).line).toBe(2);
    expect(info(r).teatCards).toEqual(TEATS); // les mêmes cartes, désormais posées sur la ligne 2
    expect(r.view('P0').cards.board.slice(15)).toEqual(TEATS);
    designate(r, { P0: AA, P1: KK, P2: TT }, 3);
    expect(info(r).line).toBe(3);
    // La ligne 2 (quatre trèfles, tétines en cœur) ne donne pas de couleur : paire désignée + tétines.
    expect(r.lineResults()[1]!.designations.P0!.category).toBe(HandCategory.Pair);
  });

  it('tétines et assistance : la catégorie annoncée tient compte des tétines', () => {
    const hands = [['Ah', 'Qh', '6s', '7s', '8s', '9s'], HANDS[1]!, HANDS[2]!];
    const r = createRound('V6_3', { players: names(3), rng: new SeededRng(1), stackedDeck: dealStack(hands, [...BOARD15, ...TEATS]), teats: 2, assistance: true });
    r.apply(sel('P0', ['Ah', 'Qh']));
    expect(info(r).assistCategory).toBe(HandCategory.Flush);
    r.apply(sel('P1', KK));
    expect(info(r, 'P1').assistCategory).toBe(HandCategory.ThreeOfAKind);
  });
});

describe('6-3 : paris extérieurs', () => {
  it('phase de paris avant la distribution : aucune carte, tout le monde est attendu', () => {
    const r = make(3, { sideBets: true });
    expect(r.phase()).toBe('BETS');
    expect(r.awaiting()).toEqual(['P0', 'P1', 'P2']);
    const v = r.view('P0');
    expect(v.cards.board).toEqual([]);
    const own = v.cards.hands.P0!;
    expect(own.kind === 'own' ? own.cards : []).toHaveLength(0);
    expect(info(r).budget).toBe(1000);
    expect(info(r).stage).toBe('BETS');
  });

  it('refuse les paris invalides ou au-dessus des jetons disponibles', () => {
    const r = make(3, { sideBets: true, budgets: 100 });
    expect(() => r.apply(bet('P0', [{ line: 4 as 1, amount: 10 }]))).toThrow(RuleError);
    expect(() => r.apply(bet('P0', [{ line: 1, amount: 0 }]))).toThrow(RuleError);
    expect(() => r.apply(bet('P0', [{ line: 1, amount: 2.5 }]))).toThrow(RuleError);
    expect(() => r.apply(bet('P0', [{ line: 1, amount: 10 }, { line: 1, amount: 20 }]))).toThrow(RuleError);
    expect(() => r.apply(bet('P0', [{ line: 1, amount: 60 }, { line: 2, amount: 60 }]))).toThrow(/insuffisants/);
    expect(() => r.apply(bet('PX', []))).toThrow(RuleError);
    expect(() => r.apply(sel('P0', AA))).toThrow(RuleError);
    r.apply(bet('P0', [{ line: 1, amount: 60 }, { line: 2, amount: 40 }])); // exactement 100 : accepté
  });

  it('un joueur modifie ses paris jusqu\'à validation, pas après', () => {
    const r = make(3, { sideBets: true });
    r.apply(bet('P0', [{ line: 1, amount: 50 }]));
    r.apply(bet('P0', [{ line: 2, amount: 70 }]));
    r.apply(val('P0'));
    expect(() => r.apply(bet('P0', []))).toThrow(RuleError);
    expect(r.awaiting()).toEqual(['P1', 'P2']);
  });

  it('seuls les paris accordés (même ligne, même montant, au moins 2 joueurs) sont engagés ; la distribution suit', () => {
    const r = make(3, { sideBets: true });
    r.apply(bet('P0', [{ line: 1, amount: 100 }, { line: 3, amount: 20 }]));
    r.apply(bet('P1', [{ line: 1, amount: 100 }]));
    r.apply(bet('P2', [{ line: 1, amount: 50 }]));
    r.apply(val('P0'));
    r.apply(val('P1'));
    const events = r.apply(val('P2'));
    expect(events.map((e) => e.type)).toContain('SIDE_BETS_LOCKED');
    expect(r.phase()).toBe('LINE_1');
    expect(info(r).pools).toEqual([{ line: 1, amount: 100, members: ['P0', 'P1'] }]);
    expect(r.view('P0').cards.board).toHaveLength(15);
    const own = r.view('P0').cards.hands.P0!;
    expect(own.kind === 'own' ? own.cards : []).toHaveLength(6);
    expect(() => r.apply(bet('P0', []))).toThrow(RuleError);
  });

  it('à l\'échéance, les paris saisis sont pris tels quels', () => {
    const r = make(2, { sideBets: true });
    r.apply(bet('P0', [{ line: 2, amount: 30 }]));
    r.apply(bet('P1', [{ line: 2, amount: 30 }]));
    r.apply(TIMEOUT);
    expect(info(r).pools).toHaveLength(1);
  });

  it('le gagnant de la ligne ramasse la cagnotte des parieurs, versée dès la clôture de la ligne', () => {
    const r = make(3, { sideBets: true }) as Round63;
    r.apply(bet('P0', [{ line: 1, amount: 100 }]));
    r.apply(bet('P1', [{ line: 1, amount: 100 }]));
    r.apply(bet('P2', []));
    for (const p of names(3)) r.apply(val(p));
    designate(r, { P0: AA, P1: KK, P2: TT }, 3);
    const res = r.sideBetResults();
    expect(res).toHaveLength(1);
    expect(res[0]!.winners).toEqual(['P0']);
    expect(res[0]!.net).toEqual({ P0: 100, P1: -100 });
    expect(r.sideBetNet()).toEqual({ P0: 100, P1: -100, P2: 0 });
    expect(r.phase()).toBe('LINE_2'); // versé avant la fin de la manche
  });

  it('les paris se jouent SANS les tétines : la ligne revient à P1 (brelan de rois avec la tétine), le pari à la meilleure main classique', () => {
    const r = make(3, { sideBets: true, teats: 2 }) as Round63;
    r.apply(bet('P0', [{ line: 1, amount: 50 }]));
    r.apply(bet('P1', [{ line: 1, amount: 50 }]));
    r.apply(bet('P2', [{ line: 1, amount: 50 }]));
    for (const p of names(3)) r.apply(val(p));
    designate(r, { P0: AA, P1: KK, P2: TT }, 3);
    expect(lastLine(r).winners).toEqual(['P1']); // brelan de rois grâce à la tétine Kh
    const res = r.sideBetResults()[0]!;
    expect(res.winners).toEqual(['P0']);
    expect(res.net).toEqual({ P0: 100, P1: -50, P2: -50 });
  });

  it('égalité entre parieurs : partage de la cagnotte, reliquat d\'arrondi au premier gagnant', () => {
    const hands = [HANDS[0]!, ['Ac', 'Ah', 'Qs', 'Qd', 'Js', 'Jd'], HANDS[2]!]; // P0 et P1 : paires d'as équivalentes
    const r = createRound('V6_3', {
      players: names(3),
      rng: new SeededRng(1),
      stackedDeck: dealStack(hands, BOARD15),
      sideBets: true,
      budgets: { P0: 1000, P1: 1000, P2: 1000 },
    }) as Round63;
    for (const p of names(3)) r.apply(bet(p, [{ line: 1, amount: 1 }]));
    for (const p of names(3)) r.apply(val(p));
    designate(r, { P0: AA, P1: ['Ac', 'Ah'], P2: TT }, 3);
    const res = r.sideBetResults()[0]!;
    expect(res.winners).toEqual(['P0', 'P1']);
    // cagnotte de 3 jetons, deux gagnants : 1 chacun, le jeton restant au premier gagnant
    expect(res.net).toEqual({ P0: 1, P1: 0, P2: -1 });
    expect(Object.values(res.net).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('personne n\'a désigné de combinaison : les mises sont rendues', () => {
    const r = make(2, { sideBets: true }) as Round63;
    r.apply(bet('P0', [{ line: 1, amount: 100 }]));
    r.apply(bet('P1', [{ line: 1, amount: 100 }]));
    r.apply(val('P0'));
    r.apply(val('P1'));
    r.apply(TIMEOUT); // ligne 1 : aucune désignation
    const res = r.sideBetResults()[0]!;
    expect(res.refunded).toBe(true);
    expect(res.net).toEqual({ P0: 0, P1: 0 });
  });

  it('un membre sans combinaison perd sa mise au profit de celui qui a désigné', () => {
    const r = make(2, { sideBets: true }) as Round63;
    r.apply(bet('P0', [{ line: 1, amount: 100 }]));
    r.apply(bet('P1', [{ line: 1, amount: 100 }]));
    r.apply(val('P0'));
    r.apply(val('P1'));
    designate(r, { P1: KK }, 2); // P0 laisse le minuteur expirer
    expect(r.sideBetResults()[0]!.net).toEqual({ P0: -100, P1: 100 });
  });

  it('les mises engagées dans un pari non résolu sont retirées des jetons disponibles', () => {
    const r = make(2, { sideBets: true }) as Round63;
    r.apply(bet('P0', [{ line: 3, amount: 300 }]));
    r.apply(bet('P1', [{ line: 3, amount: 300 }]));
    r.apply(val('P0'));
    r.apply(val('P1'));
    expect(info(r, 'P0').budget).toBe(700);
    expect(r.sideBetLocked()).toEqual({ P0: 300, P1: 300 });
    expect(r.sideBetNet()).toEqual({ P0: 0, P1: 0 });
  });

  it('sauvegarde et reprise : phase de paris et lignes en cours', () => {
    const r = make(3, { sideBets: true, teats: 2 }) as Round63;
    r.apply(bet('P0', [{ line: 1, amount: 40 }]));
    const again = restoreRound(r.snapshot(), new SeededRng(1)) as Round63;
    expect(again.phase()).toBe('BETS');
    expect(info(again).yourBets).toEqual([{ line: 1, amount: 40 }]);
    again.apply(bet('P1', [{ line: 1, amount: 40 }]));
    for (const p of names(3)) again.apply(val(p));
    designate(again, { P0: AA, P1: KK, P2: TT }, 3);
    const copy = restoreRound(again.snapshot(), new SeededRng(1)) as Round63;
    expect(copy.snapshot()).toEqual(again.snapshot());
    expect(copy.sideBetNet()).toEqual(again.sideBetNet());
  });

  it('une manche enregistrée avant les tétines et les paris se reprend sans erreur', () => {
    const r = make(3, { teats: 0 }) as Round63;
    const snap = JSON.parse(JSON.stringify(r.snapshot()));
    for (const k of ['teats', 'stage', 'sideBets', 'budgets', 'betDrafts', 'betsValidated', 'pools', 'sideResults']) delete snap.state[k];
    const old = restoreRound(snap, new SeededRng(1)) as Round63;
    expect(old.phase()).toBe('LINE_1');
    designate(old, { P0: AA, P1: KK, P2: TT }, 3);
    expect(old.lineResults()).toHaveLength(1);
  });
});

describe('6-3 : tétines et paris dans la partie', () => {
  const mkGame = () => {
    const stack = (roundNo: number, variant: string) => (roundNo === 1 && variant === 'V6_3' ? dealStack(HANDS, [...BOARD15, ...TEATS]) : undefined);
    return new GameManager({ players: names(3), targetPoints: 3, stakeChips: 200 }, new SeededRng(7), { stackedDeck: stack });
  };
  const play = (g: GameManager, cmd: any) => g.apply({ type: 'ROUND', command: cmd });

  it('les options ne concernent que le 6-3 et sont contrôlées', () => {
    const g = mkGame();
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'AVIATION', options: { teats: 1 } })).toThrow(RuleError);
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { teats: 3 } })).toThrow(RuleError);
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'AVIATION', options: { teats: 0, sideBets: false } })).not.toThrow();
  });

  it('jetons disponibles = cave − mise ; les paris réglés s\'y ajoutent immédiatement', () => {
    const g = mkGame();
    const ev = g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { teats: 2, sideBets: true } });
    expect(ev.find((e) => e.type === 'VARIANT_CHOSEN')!.data).toMatchObject({ teats: 2, sideBets: true });
    expect(g.view('P0').wallets).toEqual({ P0: STARTING_CHIPS - 200, P1: STARTING_CHIPS - 200, P2: STARTING_CHIPS - 200 });
    expect((g.view('P0').round!.info as any).budget).toBe(800);
    play(g, bet('P0', [{ line: 1, amount: 300 }]));
    play(g, bet('P1', [{ line: 1, amount: 300 }]));
    for (const p of names(3)) play(g, val(p));
    expect(g.view('P0').wallets.P0).toBe(500); // mise engagée
    for (const [p, pair] of [['P0', AA], ['P1', KK], ['P2', TT]] as const) {
      play(g, sel(p, [...pair]));
      play(g, val(p));
    }
    expect(g.view('P0').wallets).toEqual({ P0: 1100, P1: 500, P2: 800 }); // P0 a gagné 300, P1 perdu 300
  });

  it('un pari ne peut pas dépasser les jetons disponibles (la mise de la partie est déjà prélevée)', () => {
    const g = mkGame();
    g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { sideBets: true } });
    expect(() => play(g, bet('P0', [{ line: 1, amount: 801 }]))).toThrow(/insuffisants/);
  });

  it('les gains de paris sont conservés d\'une manche à l\'autre et sauvegardés', () => {
    const g = mkGame();
    g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { sideBets: true } });
    play(g, bet('P0', [{ line: 1, amount: 100 }]));
    play(g, bet('P1', [{ line: 1, amount: 100 }]));
    for (const p of names(3)) play(g, val(p));
    for (const [p, pair] of [['P0', AA], ['P1', KK], ['P2', TT]] as const) {
      play(g, sel(p, [...pair]));
      play(g, val(p));
    }
    for (let i = 0; i < 2; i++) {
      for (const [p, pair] of [['P0', AA], ['P1', KK], ['P2', TT]] as const) {
        play(g, sel(p, [...pair]));
        play(g, val(p));
      }
    }
    // La manche est finie (3 lignes) : retour au choix de variante, les gains restent acquis
    expect(g.view('P0').phase).toBe('VARIANT_SELECTION');
    expect(g.view('P0').wallets).toEqual({ P0: 900, P1: 700, P2: 800 });
    const copy = GameManager.restore(g.snapshot(), new SeededRng(7));
    expect(copy.view('P0').wallets).toEqual({ P0: 900, P1: 700, P2: 800 });
    const rec = g.view('P0').history[0]!;
    expect(rec.summary?.sideBets).toHaveLength(1);
  });

  it('la manche enregistre le nombre de tétines pour l\'historique', () => {
    const g = mkGame();
    g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3', options: { teats: 2 } });
    for (let i = 0; i < 3; i++) for (const [p, pair] of [['P0', AA], ['P1', KK], ['P2', TT]] as const) {
      play(g, sel(p, [...pair]));
      play(g, val(p));
    }
    expect(g.view('P0').history[0]!.summary?.teats).toBe(2);
  });
});

export type { SideBetResult };
