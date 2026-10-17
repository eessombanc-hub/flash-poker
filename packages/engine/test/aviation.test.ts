import { describe, expect, it } from 'vitest';
import { RuleError } from '../src/variants';
import { codesIn, dealStack, mk, pick, sel, TIMEOUT, val } from './helpers';

const boardOf = (r: ReturnType<typeof mk>) => r.view('P0').cards.board;

describe('Aviation (4 cartes, jeter 1 puis 1)', () => {
  const hands = [
    ['As', 'Ad', '2c', '3d'],
    ['Ks', 'Kd', '4c', '5d'],
    ['7s', '8d', '9c', 'Th'],
  ];
  const board = ['Ah', '9s', 'Js', '3c', '2h'];
  const stack = () => dealStack(hands, board);

  it('flop ouvert, turn puis river révélés après chaque défausse, showdown à 2 cartes restantes', () => {
    const r = mk('AVIATION', 3, stack());
    expect(r.phase()).toBe('DISCARD_1');
    expect(boardOf(r)).toEqual(['Ah', '9s', 'Js', null, null]);
    pick(r, 'P0', ['2c']);
    pick(r, 'P1', ['4c']);
    const ev = (r.apply(sel('P2', ['9c'])), r.apply(val('P2')));
    expect(ev.find((e) => e.type === 'BOARD_REVEALED')!.data).toEqual({ slot: 3, card: '3c' });
    expect(r.phase()).toBe('DISCARD_2');
    expect(boardOf(r)).toEqual(['Ah', '9s', 'Js', '3c', null]);
    pick(r, 'P0', ['3d']);
    pick(r, 'P1', ['5d']);
    const end = (r.apply(sel('P2', ['Th'])), r.apply(val('P2')));
    expect(end.some((e) => e.type === 'SHOWDOWN')).toBe(true);
    expect(boardOf(r)).toEqual(['Ah', '9s', 'Js', '3c', '2h']);
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 }); // brelan d'As
  });

  it('défausse obligatoire et exacte : valider sans carte est refusé', () => {
    const r = mk('AVIATION', 3, stack());
    expect(() => r.apply(val('P0'))).toThrowError(/exactement 1/);
    expect(() => r.apply(sel('P0', ['2c', '3d']))).toThrowError(/maximum/);
    expect(() => r.apply(sel('P0', ['Ks']))).toThrowError(RuleError);
  });

  it('absent 30 s : main foldée, hors manche jusqu\'à la fin, cartes jamais révélées', () => {
    const r = mk('AVIATION', 3, stack());
    pick(r, 'P0', ['2c']);
    pick(r, 'P1', ['4c']);
    const ev = r.apply(TIMEOUT); // P2 n'a rien fait
    expect(ev.filter((e) => e.type === 'PLAYER_FOLDED').map((e) => e.data.player)).toEqual(['P2']);
    expect(r.awaiting()).toEqual(['P0', 'P1']); // P2 n'est plus attendu
    expect(r.view('P0').info.status).toEqual({ P0: 'ACTIVE', P1: 'ACTIVE', P2: 'FOLDED' });
    pick(r, 'P0', ['3d']);
    const end = (r.apply(sel('P1', ['5d'])), r.apply(val('P1')));
    const showdown = end.find((e) => e.type === 'SHOWDOWN')!;
    expect(Object.keys(showdown.data.hands as object)).toEqual(['P0', 'P1']); // P2 absent du showdown
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 });
    // les cartes du joueur foldé ne sont jamais montrées
    expect(codesIn(r.view('P0')).has('7s')).toBe(false);
    expect(r.view('P0').cards.hands.P2).toMatchObject({ kind: 'opponent', shown: [] });
  });

  it('un seul joueur restant : il gagne sans showdown et sans révéler sa main', () => {
    const r = mk('AVIATION', 3, stack());
    pick(r, 'P0', ['2c']);
    const ev = r.apply(TIMEOUT); // P1 et P2 foldent
    expect(ev.filter((e) => e.type === 'PLAYER_FOLDED')).toHaveLength(2);
    expect(ev.some((e) => e.type === 'SHOWDOWN')).toBe(false);
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
    const seen = codesIn(r.view('P1'));
    for (const c of hands[0]!) expect(seen.has(c)).toBe(false);
  });

  it('tous foldent : aucun gagnant, 0 point', () => {
    const r = mk('AVIATION', 3, stack());
    r.apply(TIMEOUT);
    expect(r.result()).toEqual({ kind: 'NO_WINNER', reason: 'ALL_FOLDED' });
  });

  it('foldé au flop = reste foldé : aucun minuteur au turn pour lui', () => {
    const r = mk('AVIATION', 3, stack());
    pick(r, 'P0', ['2c']);
    pick(r, 'P1', ['4c']);
    r.apply(TIMEOUT);
    expect(r.awaiting()).not.toContain('P2');
    expect(() => r.apply(sel('P2', ['7s']))).toThrowError(/pas attendu/);
  });

  it('égalité au showdown : Hold\'em de départage entre les seuls joueurs restés en jeu', () => {
    const h = [
      ['As', 'Ad', '5c', '6d'],
      ['Ah', 'Ac', '5s', '6h'],
      ['2d', '3h', '7c', '8s'],
    ];
    const r = mk('AVIATION', 3, dealStack(h, ['Kh', 'Qs', '9d', '4c', '2s']));
    pick(r, 'P0', ['5c']);
    pick(r, 'P1', ['5s']);
    r.apply(TIMEOUT); // P2 fold
    pick(r, 'P0', ['6d']);
    pick(r, 'P1', ['6h']);
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });

  it('un brouillon complet non validé est appliqué à l\'échéance ; avertissement pour qui n\'a pas fini', () => {
    const r = mk('AVIATION', 3, stack());
    r.apply(sel('P0', ['2c'])); // complet (1 carte requise), non validé
    expect(r.warnings()).toEqual(['P1', 'P2']);
    pick(r, 'P1', ['4c']);
    expect(r.warnings()).toEqual(['P2']);
    r.apply(TIMEOUT);
    expect(r.view('P0').info.status).toEqual({ P0: 'ACTIVE', P1: 'ACTIVE', P2: 'FOLDED' });
  });

  it('rien ne fuit : les mains adverses restent cachées pendant la manche', () => {
    const r = mk('AVIATION', 3, stack());
    r.apply(sel('P0', ['2c']));
    const seen = codesIn(r.view('P1'));
    expect(seen).toEqual(new Set([...hands[1]!, 'Ah', '9s', 'Js']));
  });
});

describe('Avia 6 (6 cartes, jeter 2 puis 2)', () => {
  const hands = [
    ['As', 'Ad', '2c', '3d', '4h', '5s'],
    ['Ks', 'Kd', '6c', '7d', '8h', '9s'],
    ['Qs', 'Qd', 'Tc', 'Td', 'Th', '2d'],
  ];
  const stack = () => dealStack(hands, ['Ah', 'Jc', 'Js', '3c', '2s']);

  it('jeter 2 au flop puis 2 au turn, 2 cartes restantes, showdown Hold\'em', () => {
    const r = mk('AVIA_6', 3, stack());
    pick(r, 'P0', ['2c', '3d']);
    pick(r, 'P1', ['6c', '7d']);
    pick(r, 'P2', ['Tc', 'Td']);
    pick(r, 'P0', ['4h', '5s']);
    pick(r, 'P1', ['8h', '9s']);
    pick(r, 'P2', ['Th', '2d']);
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('une seule carte choisie sur 2 = absence : main foldée ; avertissement neutre avant', () => {
    const r = mk('AVIA_6', 3, stack());
    pick(r, 'P0', ['2c', '3d']);
    r.apply(sel('P1', ['6c'])); // incomplet
    pick(r, 'P2', ['Tc', 'Td']);
    expect(r.warnings()).toEqual(['P1']);
    expect(() => r.apply(val('P1'))).toThrowError(/exactement 2/);
    const ev = r.apply(TIMEOUT);
    expect(ev.filter((e) => e.type === 'PLAYER_FOLDED').map((e) => e.data.player)).toEqual(['P1']);
    expect(r.view('P2').info.status).toMatchObject({ P1: 'FOLDED' });
  });
});
