import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/card';
import { categoryOf, evaluate5, HandCategory as C } from '../src/evaluation/handEvaluator';
import { evaluateHoldem } from '../src/evaluation/holdemEvaluator';
import { evaluateOmaha, evaluateOmahaWithPair } from '../src/evaluation/omahaEvaluator';
import { evaluateVisible } from '../src/evaluation/visibleEvaluator';

const cs = parseCards;

describe('HoldemEvaluator (Aviation, Avia 6, départage)', () => {
  it('0 carte privée : le plateau seul', () => {
    expect(categoryOf(evaluateHoldem([], cs('Th Jh Qh Kh Ah')).rank)).toBe(C.StraightFlush);
  });
  it('1 carte privée', () => {
    const r = evaluateHoldem(cs('Ah'), cs('2h 5h 9h Jh Kc'));
    expect(categoryOf(r.rank)).toBe(C.Flush);
  });
  it('2 cartes privées', () => {
    const r = evaluateHoldem(cs('Ah Ad'), cs('As 5c 9h Jd 2c'));
    expect(categoryOf(r.rank)).toBe(C.ThreeOfAKind);
  });
  it('le plateau joue : deux joueurs égaux', () => {
    const board = cs('Tc Jd Qh Ks Ac');
    expect(evaluateHoldem(cs('2c 3d'), board).rank).toBe(evaluateHoldem(cs('4h 5s'), board).rank);
  });
  it('rejette 3 cartes privées, un plateau ≠ 5, les doublons', () => {
    expect(() => evaluateHoldem(cs('Ah Ad Ac'), cs('2c 5c 9h Jd 3c'))).toThrow();
    expect(() => evaluateHoldem(cs('Ah'), cs('2c 5c 9h Jd'))).toThrow();
    expect(() => evaluateHoldem(cs('Ah'), cs('Ah 5c 9h Jd 3c'))).toThrow(/double/);
  });
});

describe('OmahaEvaluator : exactement 2 privées + exactement 3 communes', () => {
  it('1 seule carte privée ne suffit jamais : quinte flush royale possible en Hold\'em, pas en Omaha', () => {
    const hand = cs('Th 3c 4d 5s 6c 7d');
    const board = cs('Ah Kh Qh Jh 2c');
    expect(categoryOf(evaluateHoldem(cs('Th 3c'), board).rank)).toBe(C.StraightFlush);
    expect(categoryOf(evaluateOmaha(hand, board).rank)).toBe(C.HighCard);
  });
  it('un carré sur le plateau ne compte que pour un brelan', () => {
    const r = evaluateOmaha(cs('As 3h'), cs('Ks Kh Kd Kc 2s'));
    expect(categoryOf(r.rank)).toBe(C.ThreeOfAKind);
    expect(r.rank).toBe(evaluate5(cs('Ks Kh Kd As 3h')));
  });
  it('un carré est possible avec une paire privée', () => {
    const r = evaluateOmaha(cs('Ks Kh 3h'), cs('Kd Kc 2s 9c 4d'));
    expect(categoryOf(r.rank)).toBe(C.FourOfAKind);
  });
  it('les 5 cartes retenues comptent exactement 2 privées + 3 communes', () => {
    const hand = cs('Ah Ad 7c 8d 2s 3s');
    const board = cs('Ac Kd Kh 9s 4d');
    const r = evaluateOmaha(hand, board);
    const priv = r.cards.filter((c) => hand.some((h) => h.id === c.id));
    const comm = r.cards.filter((c) => board.some((b) => b.id === c.id));
    expect(priv).toHaveLength(2);
    expect(comm).toHaveLength(3);
    expect(categoryOf(r.rank)).toBe(C.FullHouse);
  });
  it('rejette : moins de 2 privées, plateau ≠ 5, doublons', () => {
    expect(() => evaluateOmaha(cs('As'), cs('2c 5c 9h Jd 3c'))).toThrow();
    expect(() => evaluateOmaha(cs('As Ah'), cs('2c 5c 9h Jd'))).toThrow();
    expect(() => evaluateOmaha(cs('As Ah'), cs('As 5c 9h Jd 3c'))).toThrow(/double/);
  });
});

describe('6-3 : évaluation de la paire DÉSIGNÉE (aucune aide au joueur)', () => {
  const hand = cs('Ah Ad 7c 8d 2s 3s');
  const board = cs('Ac Kd Kh 9s 4d');
  it('une paire moins bonne donne un rang plus faible, même si une meilleure existe', () => {
    const [bad1, bad2] = cs('7c 8d');
    const [good1, good2] = cs('Ah Ad');
    const bad = evaluateOmahaWithPair([bad1!, bad2!], hand, board);
    const good = evaluateOmahaWithPair([good1!, good2!], hand, board);
    expect(categoryOf(bad.rank)).toBe(C.Pair);
    expect(categoryOf(good.rank)).toBe(C.FullHouse);
    expect(bad.rank).toBeLessThan(good.rank);
    expect(good.rank).toBe(evaluateOmaha(hand, board).rank);
  });
  it('les 3 cartes du plateau sont les meilleures pour la paire désignée', () => {
    const [a, b] = cs('Ah Ad');
    const r = evaluateOmahaWithPair([a!, b!], hand, board);
    expect(r.rank).toBe(evaluate5(cs('Ah Ad Ac Kd Kh')));
  });
  it('rejette une paire hors main, ou deux fois la même carte', () => {
    const [q, x] = cs('Qs 7c');
    const [a] = cs('Ah');
    expect(() => evaluateOmahaWithPair([q!, x!], hand, board)).toThrow(/main du joueur/);
    expect(() => evaluateOmahaWithPair([a!, a!], hand, board)).toThrow(/deux fois/);
  });
  it('les cartes privées restent réutilisables à chaque ligne (mêmes cartes, plateaux différents)', () => {
    const [a, b] = cs('Ah Ad');
    const l1 = evaluateOmahaWithPair([a!, b!], hand, cs('Ac Kd Kh 9s 4d'));
    const l2 = evaluateOmahaWithPair([a!, b!], hand, cs('Ac Kd Kh 9s 5d'));
    expect(l1.rank).toBe(l2.rank);
  });
  it('quinte flush désignée détectable (catégorie 8) ; non désignée : non détectée', () => {
    const h = cs('9h Th 2c 3d 4s 5s');
    const b = cs('Jh Qh Kh 2d 7c');
    const [nine, ten] = cs('9h Th');
    const [two, three] = cs('2c 3d');
    expect(categoryOf(evaluateOmahaWithPair([nine!, ten!], h, b).rank)).toBe(C.StraightFlush);
    expect(categoryOf(evaluateOmahaWithPair([two!, three!], h, b).rank)).not.toBe(C.StraightFlush);
  });
});

describe('6-1 : évaluation partielle (plateau + cartes visibles, sans contrainte 2+3)', () => {
  const board = cs('2c 7d 9h Js Kc');
  it('carte haute → paire → brelan quand une carte est révélée (test D du cahier des charges)', () => {
    const none = categoryOf(evaluateVisible(board, []).rank);
    const one = categoryOf(evaluateVisible(board, cs('Kd')).rank);
    const two = categoryOf(evaluateVisible(board, cs('Kd Ks')).rank);
    expect([none, one, two]).toEqual([C.HighCard, C.Pair, C.ThreeOfAKind]);
  });
  it('une carte visible peut améliorer la main sans contrainte de nombre de cartes privées', () => {
    const r = evaluateVisible(cs('2h 5h 9h Jh Kc'), cs('Ah'));
    expect(categoryOf(r.rank)).toBe(C.Flush);
  });
  it('plateau ≠ 5 rejeté', () => {
    expect(() => evaluateVisible(cs('2c 7d 9h Js'), cs('Kd'))).toThrow();
  });
});
