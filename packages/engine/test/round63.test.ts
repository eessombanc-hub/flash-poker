import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/core/card';
import type { Round } from '../src/variants';
import { LINE_UNITS, RuleError } from '../src/variants';
import { codesIn, dealStack, mk, names, sel, TIMEOUT, val } from './helpers';

// 4 joueurs ; les 3 premiers servent aux tables de 2-3 joueurs
const HANDS = [
  ['9h', 'Th', 'As', 'Ad', '3c', '4d'],
  ['Ah', 'Ac', '5s', '6d', '8c', '3h'],
  ['Kd', 'Ks', '7s', '8d', '9s', '2h'],
  ['5d', '6c', '7h', '8h', '3s', '4h'],
];
const AA: [string, string] = ['As', 'Ad']; // P0
const AAh: [string, string] = ['Ah', 'Ac']; // P1 (même rang que AA sur tous les plateaux)
const KK: [string, string] = ['Kd', 'Ks']; // P2 (plus faible que AA/AAh sur les plateaux ci-dessous)

/**
 * Plateau standard des tests « points »/« minuteur »/« secret » : 3 lignes indépendantes de 5 cartes
 * (flop 3 + turn 1 + river 1), sans carte partagée entre lignes, sans rang A ni K en dehors des mains
 * (pour ne jamais changer AA/AAh/KK en trio ou en quinte par accident).
 *   Ligne 1 (tout visible d'emblée)      : flop Jh Qh 2d - turn 4c - river 7c
 *   Ligne 2 (river cachée au départ)     : flop 9d Tc 3d - turn 5h - river 2s
 *   Ligne 3 (river cachée au départ)     : flop 9c Jc 6h - turn 5c - river 4s
 */
const BOARD15 = ['Jh', 'Qh', '2d', '4c', '7c', '9d', 'Tc', '3d', '5h', '2s', '9c', 'Jc', '6h', '5c', '4s'];
const L1_VISIBLE = BOARD15.slice(0, 5); // ligne 1 entière
const L23_PRE_VISIBLE = [...BOARD15.slice(5, 9), ...BOARD15.slice(10, 14)]; // flop+turn des lignes 2 et 3

const game = (n: number, hands = HANDS): Round => mk('V6_3', n, dealStack(hands.slice(0, n), BOARD15));

/** Joue une ligne : seuls les joueurs listés désignent (les autres laissent le minuteur expirer). */
function line(r: Round, n: number, picks: Record<string, [string, string]>): void {
  for (const [p, pair] of Object.entries(picks)) {
    r.apply(sel(p, pair));
    r.apply(val(p));
  }
  if (Object.keys(picks).length < n) r.apply(TIMEOUT);
}

/** Cartes de remplissage déterministes, disjointes de `used`, en évitant les As/Rois et, par défaut, les
 * cœurs (réservés aux tests de quinte flush) pour ne jamais créer de combinaison involontaire. */
function fillerCards(used: readonly string[], count: number, allowHearts = false): string[] {
  const usedSet = new Set(used);
  const pool = ALL_CARDS.filter((c) => c.rank < 13 && (allowHearts || c.suit !== 'h') && !usedSet.has(c.code));
  if (pool.length < count) throw new Error('Pas assez de cartes de remplissage disponibles');
  return pool.slice(0, count).map((c) => c.code);
}

describe('6-3 : plateau et déroulé (3 plateaux indépendants de 5 cartes, 15 au total)', () => {
  it('13 cartes visibles dès le départ (ligne 1 entière + flop/turn des lignes 2 et 3), 2 cachées (rivers 2 et 3)', () => {
    const r = game(3);
    expect(r.phase()).toBe('LINE_1');
    const board = r.view('P0').cards.board;
    expect(board).toHaveLength(15);
    expect(board.filter((c) => c !== null)).toHaveLength(13);
    expect(board.slice(0, 5)).toEqual(L1_VISIBLE); // ligne 1 : tout visible
    expect(board.slice(5, 9)).toEqual(BOARD15.slice(5, 9)); // ligne 2 : flop+turn visibles
    expect(board[9]).toBeNull(); // ligne 2 : river cachée
    expect(board.slice(10, 14)).toEqual(BOARD15.slice(10, 14)); // ligne 3 : flop+turn visibles
    expect(board[14]).toBeNull(); // ligne 3 : river cachée
  });

  it('river de la ligne 2 révélée après clôture de la ligne 1 ; river de la ligne 3 après la ligne 2', () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    expect(r.phase()).toBe('LINE_2');
    expect(r.view('P0').cards.board[9]).toBe(BOARD15[9]);
    expect(r.view('P0').cards.board[14]).toBeNull();
    line(r, 3, { P0: AA });
    expect(r.phase()).toBe('LINE_3');
    expect(r.view('P0').cards.board[14]).toBe(BOARD15[14]);
  });

  it('les 3 plateaux ne partagent aucune carte (15 cartes distinctes)', () => {
    expect(new Set(BOARD15).size).toBe(15);
  });

  it('distribution : 6 cartes privées par joueur, 15 cartes de plateau, 1 carte restante à 6 joueurs', () => {
    const r = mk('V6_3', 6);
    const v = r.view('P0');
    expect(v.cards.hands.P0).toMatchObject({ kind: 'own' });
    expect((v.cards.hands.P0 as { cards: unknown[] }).cards).toHaveLength(6);
    expect(v.cards.board).toHaveLength(15);
    expect(v.cards.deckCount).toBe(52 - 36 - 15);
    r.checkInvariants();
  });
});

describe('6-3 : points (règle de la table v1.1)', () => {
  it('Cas 2 : le même joueur gagne seul les 3 lignes -> 2 points', () => {
    const r = game(3);
    for (let i = 0; i < 3; i++) line(r, 3, { P0: AA });
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 2 });
  });

  it('A / A / B -> A gagne le plus de lignes : 1 point', () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA });
    line(r, 3, { P2: KK });
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('A / B / C à 3 joueurs : égalité en tête -> 0 point pour tous', () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    line(r, 3, { P1: AAh });
    line(r, 3, { P2: KK });
    expect(r.result()).toEqual({ kind: 'NO_WINNER', reason: 'TIE_SMALL_TABLE' });
  });

  it("Cas 1 (A / B / C) à 4 joueurs : Hold'em de départage entre les 3 ex aequo", () => {
    const r = game(4);
    line(r, 4, { P0: AA });
    line(r, 4, { P1: AAh });
    line(r, 4, { P2: KK });
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1', 'P2'] }); // P3 (0 point de ligne) n'y participe pas
  });

  it("A / B / égalité A-B : 1,5 chacun -> 0 point à 3 joueurs, Hold'em entre A et B à 4 joueurs", () => {
    const play = (n: number) => {
      const r = game(n);
      line(r, n, { P0: AA });
      line(r, n, { P1: AAh });
      line(r, n, { P0: AA, P1: AAh }); // même rang en ligne 3 : point partagé
      const l = r.view('P0').info.lines as { winners: string[]; unitsEach: number }[];
      expect(l[2]).toMatchObject({ winners: ['P0', 'P1'], unitsEach: LINE_UNITS / 2 });
      return r.result();
    };
    expect(play(3)).toEqual({ kind: 'NO_WINNER', reason: 'TIE_SMALL_TABLE' });
    expect(play(4)).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });

  it("A / A / égalité A-B : A a 2,5 points de ligne mais n'a pas gagné seul les 3 lignes -> 1 point", () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA, P1: AAh });
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('A / A / personne (temps écoulé) -> 1 point', () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA });
    r.apply(TIMEOUT); // personne ne désigne
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('personne ne désigne sur les 3 lignes -> 0 point', () => {
    const r = game(3);
    r.apply(TIMEOUT);
    r.apply(TIMEOUT);
    r.apply(TIMEOUT);
    expect(r.result()).toEqual({ kind: 'NO_WINNER', reason: 'NO_DESIGNATION' });
  });

  it('la meilleure main désignée gagne la ligne ; une paire plus faible perd même si le joueur en avait une meilleure', () => {
    const r = game(3);
    // ligne 1 : P0 désigne une mauvaise paire (3c 4d), P2 la paire de rois -> P2 gagne
    line(r, 3, { P0: ['3c', '4d'], P1: AAh, P2: KK });
    const l1 = (r.view('P0').info.lines as { winners: string[] }[])[0]!;
    expect(l1.winners).toEqual(['P1']); // paire d'As > paire de rois > rien
  });

  it('la ligne se clôt dès que tous ont validé (sans attendre le minuteur)', () => {
    const r = game(3);
    line(r, 3, { P0: AA, P1: AAh, P2: KK });
    expect(r.phase()).toBe('LINE_2');
  });
});

describe('6-3 : minuteur et désignation', () => {
  it("une seule carte désignée à l'échéance : ligne perdue ; avertissement à 10 s", () => {
    const r = game(3);
    r.apply(sel('P0', ['As']));
    expect(r.warnings()).toEqual(['P0']);
    r.apply(sel('P1', ['Ah', 'Ac']));
    r.apply(val('P1'));
    expect(() => r.apply(val('P0'))).toThrowError(/exactement 2/);
    r.apply(TIMEOUT);
    const l1 = (r.view('P0').info.lines as { winners: string[]; designations: Record<string, unknown> }[])[0]!;
    expect(l1.designations.P0).toBeNull();
    expect(l1.winners).toEqual(['P1']);
  });

  it("deux cartes désignées mais non validées : comptent à l'échéance", () => {
    const r = game(3);
    r.apply(sel('P0', AA));
    r.apply(TIMEOUT);
    expect((r.view('P0').info.lines as { winners: string[] }[])[0]!.winners).toEqual(['P0']);
  });

  it('cartes privées réutilisables : la même paire peut être désignée à chaque ligne', () => {
    const r = game(3);
    for (let i = 0; i < 3; i++) line(r, 3, { P0: AA });
    expect(r.view('P0').info.lines).toHaveLength(3);
  });

  it("le brouillon est modifiable jusqu'à la validation, puis verrouillé", () => {
    const r = game(3);
    r.apply(sel('P0', ['3c', '4d']));
    r.apply(sel('P0', AA));
    expect(r.view('P0').info.yourDraft).toEqual(AA);
    r.apply(val('P0'));
    expect(() => r.apply(sel('P0', ['3c', '4d']))).toThrowError(/déjà validé/);
    expect(() => r.apply(sel('P0', ['Ks', 'Kd']))).toThrowError(RuleError);
  });

  it('un joueur déconnecté suit le même minuteur : sans désignation, ligne perdue', () => {
    const r = game(3);
    line(r, 3, { P1: AAh, P2: KK }); // P0 absent
    expect((r.view('P1').info.lines as { designations: Record<string, unknown> }[])[0]!.designations.P0).toBeNull();
  });
});

describe('6-3 : quinte flush désignée = victoire immédiate de la partie', () => {
  const SF: [string, string] = ['9h', 'Th'];
  const usedHands = HANDS.flat();

  it('Cas 3 : quinte flush complète dès la ligne 1 (son propre plateau contient déjà les 3 cœurs manquants)', () => {
    const l1 = ['Jh', 'Qh', 'Kh', '2c', '4s']; // avec 9h/Th (pocket) : quinte flush 9-10-V-D-R
    const filler = fillerCards([...usedHands, ...l1], 10);
    const r = mk('V6_3', 3, dealStack(HANDS.slice(0, 3), [...l1, ...filler]));
    line(r, 3, { P0: SF, P1: AAh });
    expect(r.result()).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 1 });
    expect(r.phase()).toBe('DONE');
    expect(() => r.apply(TIMEOUT)).toThrowError(/terminée/);
  });

  it("Cas 4 : quinte flush qui ne se complète qu'à la ligne 2 (river cachée de la ligne 2)", () => {
    const l1safe = fillerCards(usedHands, 5); // ligne 1 : aucune quinte flush possible
    const usedAfterL1 = [...usedHands, ...l1safe];
    const l2Filler = fillerCards(usedAfterL1, 2); // 2 cartes neutres du flop de la ligne 2
    // ligne 2 : flop = [Jh, Qh, filler] (visible d'emblée), turn = filler, river = Kh (cachée) -> quinte flush 9-10-V-D-R
    const l2 = [l2Filler[0]!, 'Jh', 'Qh', l2Filler[1]!, 'Kh'];
    const l3 = fillerCards([...usedAfterL1, ...l2], 5);
    const stack = [...l1safe, ...l2, ...l3];
    const r = mk('V6_3', 3, dealStack(HANDS.slice(0, 3), stack));
    line(r, 3, { P0: SF }); // ligne 1 : pas de quinte flush possible
    expect(r.result()).toBeNull();
    expect(r.phase()).toBe('LINE_2');
    line(r, 3, { P0: SF, P2: KK });
    expect(r.result()).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 2 });
  });

  it("Cas 5 : quinte flush qui ne se complète qu'à la ligne 3 (river cachée de la ligne 3)", () => {
    const l1safe = fillerCards(usedHands, 5);
    const l2safe = fillerCards([...usedHands, ...l1safe], 5);
    const usedAfterL2 = [...usedHands, ...l1safe, ...l2safe];
    const l3Filler = fillerCards(usedAfterL2, 2);
    const l3 = [l3Filler[0]!, 'Jh', 'Qh', l3Filler[1]!, 'Kh']; // flop+turn visibles, river cachée = Kh
    const stack = [...l1safe, ...l2safe, ...l3];
    const r = mk('V6_3', 3, dealStack(HANDS.slice(0, 3), stack));
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA });
    expect(r.phase()).toBe('LINE_3');
    line(r, 3, { P0: SF, P2: KK }); // KK reste un simple brelan possible, mais la quinte flush l'emporte
    expect(r.result()).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 3 });
  });

  it('indépendante du score : même si un autre joueur menait aux lignes', () => {
    const l1 = fillerCards(usedHands, 5); // ligne 1 : neutre, aucun résultat de quinte flush
    const usedAfterL1 = [...usedHands, ...l1];
    const l2Filler = fillerCards(usedAfterL1, 2);
    const l2 = [l2Filler[0]!, 'Jh', 'Qh', l2Filler[1]!, 'Kh'];
    const l3 = fillerCards([...usedAfterL1, ...l2], 5);
    const r = mk('V6_3', 3, dealStack(HANDS.slice(0, 3), [...l1, ...l2, ...l3]));
    line(r, 3, { P1: AAh }); // P1 gagne seul la ligne 1 (aucun point encore décisif : la manche continue)
    expect(r.result()).toBeNull();
    line(r, 3, { P0: SF });
    expect(r.result()).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 2 });
  });

  it("non désignée = non détectée : la paire n'est jamais choisie à la place du joueur", () => {
    const r = game(3);
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA });
    line(r, 3, { P0: AA }); // il détient 9h/Th mais a désigné autre chose
    expect(r.result()!.kind).toBe('WINNER');
  });

  it("deux quintes flush désignées sur la même ligne : la plus haute l'emporte", () => {
    const hands = [
      ['3h', '4h', 'Ac', 'Kd', '2c', '9d'],
      ['8h', '9h', 'Qc', 'Jd', '2d', 'Tc'],
      ['As', 'Ks', 'Qs', 'Js', 'Ts', '2s'],
    ];
    // Plateau de la ligne 1 : 5h 6h 7h (+ Ad, Kc en remplissage).
    // P0 (3h4h) + 5h6h7h = quinte flush 3-4-5-6-7 ; P1 (8h9h) + 5h6h7h = quinte flush 5-6-7-8-9 (plus haute)
    const l1 = ['5h', '6h', '7h', 'Ad', 'Kc'];
    const r = mk('V6_3', 3, dealStack(hands, l1));
    line(r, 3, { P0: ['3h', '4h'], P1: ['8h', '9h'] });
    expect(r.result()).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P1', line: 1 });
  });
});

describe('6-3 : secret', () => {
  it('brouillons et cartes adverses invisibles ; désignations révélées ensemble à la clôture de la ligne', () => {
    const r = game(3);
    r.apply(sel('P0', AA));
    r.apply(val('P0'));
    r.apply(sel('P1', ['Ah']));
    const seen = codesIn(r.view('P2'));
    // sa main + les 13 cartes visibles du plateau (ligne 1 entière + flop/turn des lignes 2 et 3)
    expect(seen).toEqual(new Set([...HANDS[2]!, ...L1_VISIBLE, ...L23_PRE_VISIBLE]));
    expect(r.view('P2').info.validated).toEqual(['P0']); // on sait QUI a validé, pas ce qui est désigné
    r.apply(TIMEOUT);
    const after = codesIn(r.view('P2'));
    for (const c of AA) expect(after.has(c)).toBe(true); // paire désignée et validée : publique à la clôture
    expect(after.has('Ah')).toBe(false); // brouillon incomplet (1 carte) : ligne perdue, jamais révélé
    expect(after.has('Ac')).toBe(false); // le reste de la main de P1 reste caché
    expect(after.has('5s')).toBe(false);
    expect(after.has(BOARD15[9]!)).toBe(true); // ligne 1 close -> on entre en ligne 2 : sa river se révèle aussitôt
    expect(after.has(BOARD15[14]!)).toBe(false); // river de la ligne 3 : toujours cachée à ce stade
  });

  it("la meilleure paire d'un joueur n'est jamais calculée ni exposée", () => {
    const r = game(3);
    const ser = JSON.stringify(r.view('P0')) + JSON.stringify(r.snapshot().state);
    expect(ser).not.toMatch(/best|meilleure/i);
  });

  it('table de 3 joueurs uniquement pour ces tests : noms P0..P2', () => {
    expect(names(3)).toEqual(['P0', 'P1', 'P2']);
  });
});
