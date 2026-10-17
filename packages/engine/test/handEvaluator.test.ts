import { describe, expect, it } from 'vitest';
import { ALL_CARDS, parseCards, type Card } from '../src/core/card';
import { bestOf, categoryOf, describeCategory, evaluate5, HandCategory as C } from '../src/evaluation/handEvaluator';
import { rankGroups } from '../src/evaluation/ranking';

const r5 = (s: string) => evaluate5(parseCards(s));

describe('HandEvaluator : distribution exacte sur les 2 598 960 mains', () => {
  it('effectifs par catégorie et classes d\'équivalence (7 462) conformes à la théorie', () => {
    const counts = new Array<number>(9).fill(0);
    const distinct = Array.from({ length: 9 }, () => new Set<number>());
    const hand: Card[] = [ALL_CARDS[0]!, ALL_CARDS[0]!, ALL_CARDS[0]!, ALL_CARDS[0]!, ALL_CARDS[0]!];
    let total = 0;
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = ALL_CARDS[a]!;
              hand[1] = ALL_CARDS[b]!;
              hand[2] = ALL_CARDS[c]!;
              hand[3] = ALL_CARDS[d]!;
              hand[4] = ALL_CARDS[e]!;
              const rank = evaluate5(hand);
              const cat = categoryOf(rank);
              counts[cat]!++;
              distinct[cat]!.add(rank);
              total++;
            }
    expect(total).toBe(2_598_960);
    expect(counts[C.HighCard]).toBe(1_302_540);
    expect(counts[C.Pair]).toBe(1_098_240);
    expect(counts[C.TwoPair]).toBe(123_552);
    expect(counts[C.ThreeOfAKind]).toBe(54_912);
    expect(counts[C.Straight]).toBe(10_200); // roue incluse
    expect(counts[C.Flush]).toBe(5_108);
    expect(counts[C.FullHouse]).toBe(3_744);
    expect(counts[C.FourOfAKind]).toBe(624);
    expect(counts[C.StraightFlush]).toBe(40); // dont 4 quintes flush royales, roue incluse
    expect(distinct.map((s) => s.size)).toEqual([1277, 2860, 858, 858, 10, 1277, 156, 156, 10]);
    expect(distinct.reduce((n, s) => n + s.size, 0)).toBe(7462);
  });
});

describe('HandEvaluator : ordre des mains', () => {
  const ascending = [
    '2c 3d 4h 5s 7c', // carte haute 7
    'Ac Kd Qh Js 9c', // carte haute As
    '2c 2d 3h 4s 5h', // paire de 2
    'Ac Ad Kh Qs Tc', // paire d'As, kickers K Q 10
    'Ac Ad Kh Qs Jc', // paire d'As, kickers K Q J
    '3c 3d 2h 2s 4c', // double paire, kicker 4
    '3c 3d 2h 2s 5c', // double paire, kicker 5
    'Kc Kd Qh Qs 2c', // double paire K-Q
    '2c 2d 2h 3s 4c', // brelan de 2
    'Ac Ad Ah Ks Qc', // brelan d'As
    'Ac 2d 3h 4s 5c', // quinte au 5 (roue)
    '2c 3d 4h 5s 6c', // quinte au 6
    'Tc Jd Qh Ks Ac', // quinte à l'As
    '2h 3h 4h 5h 7h', // couleur
    'Ah Kh Qh Jh 9h', // couleur à l'As
    '2c 2d 2h 3s 3c', // full 2 par 3
    'Ac Ad Ah Ks Kc', // full As par Rois
    '2c 2d 2h 2s 3c', // carré de 2
    'Ac Ad Ah As Kc', // carré d'As
    'Ah 2h 3h 4h 5h', // quinte flush (roue)
    '2h 3h 4h 5h 6h', // quinte flush au 6
    'Th Jh Qh Kh Ah', // quinte flush royale
  ];
  it('chaque main est strictement supérieure à la précédente', () => {
    for (let i = 1; i < ascending.length; i++) {
      expect(r5(ascending[i]!), `${ascending[i - 1]} < ${ascending[i]}`).toBeGreaterThan(r5(ascending[i - 1]!));
    }
  });
  it('catégories', () => {
    const cats = ascending.map((h) => categoryOf(r5(h)));
    expect(cats).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8]);
    expect(describeCategory(r5('Th Jh Qh Kh Ah'))).toBe('Quinte flush');
  });
  it('la roue A-2-3-4-5 est une quinte au 5 ; pas de quinte circulaire', () => {
    expect(categoryOf(r5('Ac 2d 3h 4s 5c'))).toBe(C.Straight);
    expect(r5('Ac 2d 3h 4s 5c')).toBeLessThan(r5('2c 3d 4h 5s 6c'));
    expect(categoryOf(r5('Qc Kd Ah 2s 3c'))).toBe(C.HighCard);
    expect(categoryOf(r5('Jc Qd Kh As 2c'))).toBe(C.HighCard);
  });
  it('les couleurs ne départagent jamais', () => {
    expect(r5('As Kd Qh Jc 9s')).toBe(r5('Ac Kh Qd Js 9c'));
    expect(r5('Ac Ad Kh Qs Jc')).toBe(r5('Ah As Kd Qc Jh'));
    expect(r5('2c 3d 4h 5s 6c')).toBe(r5('2s 3s 4d 5h 6d'));
    expect(r5('Ah Kh Qh Jh 9h')).toBe(r5('As Ks Qs Js 9s'));
  });
  it('kickers décisifs', () => {
    expect(r5('Ac Ad Kh Qs 2c')).toBeGreaterThan(r5('Ac Ad Kh Js Tc'));
    expect(r5('Kc Kd Ah 2s 3c')).toBeLessThan(r5('Ac Ad 4h 5s 7c'));
    expect(r5('Kc Kd 5h 5s Ac')).toBeGreaterThan(r5('Kc Kd 4h 4s Ac'));
    expect(r5('Kc Kd 5h 5s Ac')).toBeGreaterThan(r5('Kc Kd 5h 5s Qc'));
    expect(r5('3c 3d 3h Ks Qc')).toBeGreaterThan(r5('3c 3d 3h Ks Jc'));
    expect(r5('3c 3d 3h 9s 9c')).toBeLessThan(r5('4c 4d 4h 2s 2c'));
  });
  it('argument invalide', () => {
    expect(() => evaluate5(parseCards('As Kd Qh'))).toThrow();
    expect(() => bestOf(parseCards('As Kd Qh Jc'))).toThrow();
    expect(() => bestOf(parseCards('As As Qh Jc 9d'))).toThrow(/double/);
  });
});

describe('bestOf / rankGroups', () => {
  it('meilleure main de 7 cartes', () => {
    const res = bestOf(parseCards('Ah Kh 2h 5h Jh 9c 9d'));
    expect(categoryOf(res.rank)).toBe(C.Flush);
    expect(res.cards).toHaveLength(5);
  });
  it('rankGroups : groupes du meilleur au plus faible, égalités regroupées', () => {
    const groups = rankGroups([
      { player: 'A', rank: r5('Ac Ad Kh Qs Jc') },
      { player: 'B', rank: r5('2c 3d 4h 5s 7c') },
      { player: 'C', rank: r5('Ah As Kd Qc Jh') },
      { player: 'D', rank: r5('2h 3h 4h 5h 6h') },
    ]);
    expect(groups).toEqual([['D'], ['A', 'C'], ['B']]);
  });
});
