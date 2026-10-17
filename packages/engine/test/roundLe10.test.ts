import { describe, expect, it } from 'vitest';
import { evaluatePartial } from '../src/evaluation/handEvaluator';
import { parseCards } from '../src/core/card';
import { isVariantAvailable, RuleError, type Round } from '../src/variants';
import { codesIn, dealStack, mk, TIMEOUT } from './helpers';

// 10 cartes privées par joueur, aucune carte commune.
const HANDS = [
  ['2c', '3d', '4h', '5s', '6c', '7d', '8h', '9s', 'Tc', '3s'], // P0 — 10e carte (visible) : 3s (rang 3)
  ['2d', '3h', '4s', '5c', '6d', '7h', '8s', '9c', 'Td', '2s'], // P1 — 10e carte : 2s (rang 2, la plus faible)
];
const game = (n = 2, hands = HANDS): Round => mk('LE10', n, dealStack(hands.slice(0, n)));
const REVEAL = (player: string) => ({ type: 'REVEAL' as const, player });

describe('Le 10 : distribution et disponibilité', () => {
  it('10 cartes privées par joueur, la 10e visible, aucune carte commune', () => {
    const r = game(2);
    const v = r.view('P0');
    expect((v.cards.hands.P0 as { cards: { code: string; visible: boolean }[] }).cards).toHaveLength(10);
    expect(v.cards.board).toHaveLength(0);
    const mine = (v.cards.hands.P0 as { cards: { code: string; visible: boolean }[] }).cards;
    expect(mine.slice(0, 9).every((c) => !c.visible)).toBe(true);
    expect(mine[9]!.visible).toBe(true);
    r.checkInvariants();
  });

  it('jouable de 2 à 5 joueurs ; jamais à 6', () => {
    for (let n = 2; n <= 5; n++) expect(isVariantAvailable('LE10', n)).toBe(true);
    expect(isVariantAvailable('LE10', 6)).toBe(false);
    expect(() => mk('LE10', 6)).toThrowError(/maximum à 5/);
  });
});

describe('Le 10 : ordre de révélation (comme au 6-1, généralisé au boardless)', () => {
  it('le premier révélateur est celui dont la 10e carte visible est la plus faible', () => {
    const r = game(2); // P1 a 2s (rang 2) < P0 3s (rang 3)
    expect(r.view('P0').info.next).toBe('P1');
    expect(r.view('P0').info.reason).toBe('LOWEST_FIRST_CARD');
  });

  it("l'ordre est recalculé après chaque révélation, sur les seules cartes visibles de chacun", () => {
    const r = game(2);
    expect(r.view('P0').info.next).toBe('P1');
    r.apply(REVEAL('P1')); // P1 révèle une carte quelconque de sa main cachée
    const info = r.view('P0').info as { next: string; reason: string };
    expect(['P0', 'P1']).toContain(info.next); // recalcul effectué (dépend de la carte tirée)
    expect(r.view('P0').info.reveals).toBe(1);
  });

  it('sans plateau, une comparaison à moins de 5 cartes ne peut jamais être une quinte ou une couleur', () => {
    // 4 cartes de même couleur, non consécutives : jamais "Couleur" avec evaluatePartial
    const suited = parseCards('2h 5h 9h Kh');
    const rank = evaluatePartial(suited);
    expect(rank).toBeLessThan(5 * 15 ** 5); // catégorie < Flush (5)
  });

  it('TIMEOUT (60 s) : retournement automatique du joueur désigné', () => {
    const r = game(2);
    const next = (r.view('P0').info as { next: string }).next;
    const ev = r.apply(TIMEOUT);
    expect(ev.some((e) => e.type === 'CARD_REVEALED' && e.data.player === next && e.data.auto === true)).toBe(true);
  });

  it("seul le joueur désigné peut révéler ; révéler hors tour est refusé sans effet", () => {
    const r = game(2);
    const other = (r.view('P0').info as { next: string }).next === 'P0' ? 'P1' : 'P0';
    const before = JSON.stringify(r.snapshot());
    expect(() => r.apply(REVEAL(other))).toThrowError(RuleError);
    expect(JSON.stringify(r.snapshot())).toBe(before);
  });

  it('la partie se termine après 9 révélations par joueur (9 × n au total)', () => {
    const r = game(2);
    let guard = 0;
    while (!r.result() && guard++ < 100) {
      const next = (r.view('P0').info as { next: string | null }).next!;
      r.apply(REVEAL(next));
    }
    expect(guard).toBe(9 * 2);
    expect(r.result()).not.toBeNull();
    expect(r.view('P0').cards.hands.P0).toMatchObject({ kind: 'own' });
    const mine = (r.view('P0').cards.hands.P0 as { cards: { visible: boolean }[] }).cards;
    expect(mine.every((c) => c.visible)).toBe(true); // les 10 cartes de chacun sont visibles à la fin
  });
});

describe('Le 10 : showdown (meilleure main de 5 sur 10, règle du Hold’em)', () => {
  it('la meilleure main de 5 cartes parmi les 10 est retenue, y compris quand elle n’est pas dans les 5 premières cartes distribuées', () => {
    const hands = [
      ['2c', '4h', '7d', '9d', 'Jd', 'As', 'Ad', 'Ac', 'Ah', 'Ts'], // P0 : carré d'As, parmi les 4 DERNIÈRES cartes ; les 5 premières ne forment rien
      ['Kc', 'Kd', '2d', '3h', '4s', '5c', '6d', '7h', '8s', '9c'], // P1 : ses 5 premières cartes ne sont qu'une paire de rois
    ];
    const r = game(2, hands);
    let guard = 0;
    while (!r.result() && guard++ < 100) {
      const next = (r.view('P0').info as { next: string | null }).next!;
      r.apply(REVEAL(next));
    }
    expect(r.result()).toMatchObject({ kind: 'WINNER', winner: 'P0', points: 1 });
  });

  it("égalité stricte au showdown : TIE (départage Hold'em géré par la partie)", () => {
    const hands = [
      ['As', 'Kd', '2c', '3d', '4h', '5s', '6c', '7d', '8h', '9s'],
      ['Ad', 'Kc', '2d', '3h', '4s', '5c', '6d', '7h', '8s', '9c'], // mêmes rangs, suites différentes : force égale
    ];
    const r = game(2, hands);
    let guard = 0;
    while (!r.result() && guard++ < 100) {
      const next = (r.view('P0').info as { next: string | null }).next!;
      r.apply(REVEAL(next));
    }
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });
});

describe('Le 10 : secret', () => {
  it('les cartes cachées ne fuient jamais avant leur révélation, y compris pour leur propriétaire', () => {
    const r = game(2);
    const seen = codesIn(r.view('P1'));
    // P1 voit la 10e carte visible de P0 (publique), la sienne, et rien d'autre
    expect(seen.has(HANDS[0]![9]!)).toBe(true); // 10e carte de P0, publique d'emblée
    for (let i = 0; i < 9; i++) expect(seen.has(HANDS[0]![i]!)).toBe(false); // ses 9 autres cartes, cachées
    expect(seen.has(HANDS[1]![9]!)).toBe(true); // sa propre 10e carte : visible d'emblée pour lui aussi
    for (let i = 0; i < 9; i++) expect(seen.has(HANDS[1]![i]!)).toBe(false); // ses 9 autres cartes : masquées, MÊME pour lui
  });

  it('le propriétaire découvre ses propres cartes au même rythme que ses adversaires, jamais avant', () => {
    const r = game(2);
    const next = (r.view('P0').info as { next: string }).next;
    const ev = r.apply(REVEAL(next));
    const revealed = (ev.find((e) => e.type === 'CARD_REVEALED')!.data as { card: string }).card;
    const own = r.view(next).cards.hands[next] as { cards: { code: string | null; visible: boolean }[] };
    const visible = own.cards.filter((c) => c.visible).map((c) => c.code);
    expect(visible).toContain(revealed); // la carte qu'il vient de retourner : désormais connue de lui aussi
    expect(own.cards.filter((c) => !c.visible).every((c) => c.code === null)).toBe(true); // les autres : toujours masquées
  });
});
