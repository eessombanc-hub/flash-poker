import { describe, expect, it } from 'vitest';
import { isVariantAvailable, RuleError, type Round } from '../src/variants';
import { codesIn, dealStack, mk, TIMEOUT, val } from './helpers';

// Grille 3×3 (indices 0-8) : LINES[0..2] = lignes, [3..5] = colonnes, [6,7] = diagonales.
const HANDS = [
  ['As', 'Ad', '2c', '3d'], // P0
  ['Kc', 'Kd', '2d', '3c'], // P1
  ['7h', '8h', '2h', '3h'], // P2
];
const BOARD9 = ['Ah', '5c', '6d', '9c', 'Tc', 'Jc', '2s', '3s', '4s'];
// ligne 0 (row0) = Ah,5c,6d · ligne 1 (row1) = 9c,Tc,Jc · ligne 2 (row2) = 2s,3s,4s
// colonne 0 = Ah,9c,2s · colonne 1 = 5c,Tc,3s · colonne 2 = 6d,Jc,4s · diag = Ah,Tc,4s / 6d,Tc,2s

const game = (n = 3): Round => mk('MORPION', n, dealStack(HANDS.slice(0, n), BOARD9));
const selLine = (player: string, cards: string[], line: number | null) => ({ type: 'SELECT' as const, player, cards, line });

describe('Morpion : distribution et disponibilité', () => {
  it('4 cartes privées par joueur, 9 cartes communes toutes visibles dès le départ', () => {
    const r = game(3);
    const v = r.view('P0');
    expect((v.cards.hands.P0 as { cards: unknown[] }).cards).toHaveLength(4);
    expect(v.cards.board).toHaveLength(9);
    expect(v.cards.board.every((c) => c !== null)).toBe(true);
    r.checkInvariants();
  });

  it('jouable de 2 à 6 joueurs, sans restriction particulière', () => {
    for (let n = 2; n <= 6; n++) expect(isVariantAvailable('MORPION', n)).toBe(true);
  });
});

describe('Morpion : désignation (2 cartes + un alignement) et évaluation', () => {
  it('brelan (ligne) bat paire (colonne) : le meilleur alignement désigné gagne', () => {
    const r = game(3);
    r.apply(selLine('P0', ['As', 'Ad'], 0)); // As,Ad + Ah,5c,6d = brelan d'As
    r.apply(val('P0'));
    r.apply(selLine('P1', ['Kc', 'Kd'], 1)); // Kc,Kd + 9c,Tc,Jc = paire de rois
    r.apply(val('P1'));
    r.apply(TIMEOUT); // P2 n'a rien désigné
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('deux joueurs choisissent le même alignement : la meilleure paire privée l’emporte', () => {
    const r = game(3);
    r.apply(selLine('P0', ['As', 'Ad'], 0)); // brelan d'As
    r.apply(val('P0'));
    r.apply(selLine('P2', ['7h', '8h'], 0)); // Ah,5c,6d + 7h,8h = carte haute (As)
    r.apply(val('P2'));
    r.apply(TIMEOUT);
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it('égalité stricte entre deux joueurs : TIE (départage Hold’em géré par la partie)', () => {
    const r = game(2);
    r.apply(selLine('P0', ['2c', '3d'], 2)); // 2c,3d + 2s,3s,4s = deux paires (2 et 3), kicker 4
    r.apply(val('P0'));
    r.apply(selLine('P1', ['2d', '3c'], 2)); // même ligne, même rang de paires (2 et 3), kicker 4 : rigoureusement égal
    r.apply(val('P1'));
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });

  it('alignement invalide (hors 0-7) refusé, aucun effet', () => {
    const r = game(3);
    const before = JSON.stringify(r.snapshot());
    expect(() => r.apply(selLine('P0', ['As', 'Ad'], 8))).toThrowError(RuleError);
    expect(() => r.apply(selLine('P0', ['As', 'Ad'], -1))).toThrowError(RuleError);
    expect(JSON.stringify(r.snapshot())).toBe(before);
  });

  it('plus de 2 cartes refusé ; valider sans 2 cartes ET un alignement refusé', () => {
    const r = game(3);
    expect(() => r.apply(selLine('P0', ['As', 'Ad', '2c'], 0))).toThrowError(RuleError); // 3 cartes
    expect(() => r.apply(val('P0'))).toThrowError(/exactement 2 cartes et un alignement|Désignez/);
    r.apply(selLine('P0', ['As', 'Ad'], null)); // cartes seules, pas d'alignement
    expect(() => r.apply(val('P0'))).toThrowError(RuleError);
    r.apply(selLine('P0', [], 0)); // alignement seul, pas de cartes
    expect(() => r.apply(val('P0'))).toThrowError(RuleError);
  });

  it('le brouillon (cartes et alignement) reste modifiable jusqu’à la validation', () => {
    const r = game(3);
    r.apply(selLine('P0', ['As', 'Ad'], 0));
    r.apply(selLine('P0', ['2c', '3d'], 1)); // change d'avis : nouvelles cartes ET nouvel alignement
    expect(r.view('P0').info.yourDraft).toEqual({ cards: ['2c', '3d'], line: 1 });
    r.apply(val('P0'));
    expect(() => r.apply(selLine('P0', ['As', 'Ad'], 0))).toThrowError(/déjà validé/);
  });

  it('avertissement à 10 s pour une désignation commencée mais incomplète', () => {
    const r = game(3);
    r.apply(selLine('P0', ['As', 'Ad'], null)); // cartes choisies, pas encore d'alignement
    expect(r.warnings()).toEqual(['P0']);
    r.apply(selLine('P1', [], 3)); // alignement choisi, pas encore de cartes
    expect(r.warnings().sort()).toEqual(['P0', 'P1']);
  });

  it('personne ne désigne (2 cartes + alignement complets) : aucun vainqueur', () => {
    const r = game(3);
    r.apply(TIMEOUT);
    expect(r.result()).toEqual({ kind: 'NO_WINNER', reason: 'NO_DESIGNATION' });
  });

  it('la clôture est immédiate dès que tous ont validé, sans attendre l’échéance', () => {
    const r = game(2);
    r.apply(selLine('P0', ['As', 'Ad'], 0));
    r.apply(val('P0'));
    r.apply(selLine('P1', ['Kc', 'Kd'], 1));
    r.apply(val('P1'));
    expect(r.phase()).toBe('DONE');
  });
});

describe('Morpion : les 8 alignements pointent les bonnes cases de la grille', () => {
  it('chaque ligne, colonne et diagonale correspond exactement aux 3 cartes attendues', () => {
    const expected: [number, number, number][] = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // lignes
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonnes
      [0, 4, 8], [2, 4, 6],           // diagonales
    ];
    for (let line = 0; line < 8; line++) {
      const r = game(2);
      r.apply(selLine('P0', ['As', 'Ad'], line));
      r.apply(val('P0'));
      const ev = r.apply(TIMEOUT);
      const showdown = ev.find((e) => e.type === 'SHOWDOWN')!;
      const cards = (showdown.data.hands as Record<string, { cards: string[] }>).P0!.cards;
      const [a, b, c] = expected[line]!;
      expect(cards.slice(2).sort()).toEqual([BOARD9[a], BOARD9[b], BOARD9[c]].sort());
    }
  });
});

describe('Morpion : secret', () => {
  it('les cartes privées adverses restent invisibles jusqu’au showdown ; le plateau est toujours public', () => {
    const r = game(3);
    r.apply(selLine('P0', ['As', 'Ad'], 0));
    const seen = codesIn(r.view('P1'));
    expect(seen).toEqual(new Set([...HANDS[1]!, ...BOARD9])); // sa main + le plateau, rien de la main de P0/P2
    r.apply(val('P0'));
    const ev = r.apply(TIMEOUT);
    const showdown = ev.find((e) => e.type === 'SHOWDOWN')!;
    const revealed = codesIn(showdown);
    expect(revealed.has('As')).toBe(true); // désignation de P0 dévoilée au showdown
    expect(revealed.has('2c')).toBe(false); // le reste de la main de P0 n'est jamais montré
  });
});
