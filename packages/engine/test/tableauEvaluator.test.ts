import { describe, expect, it } from 'vitest';
import { ALL_CARDS, compareColumns, describePartial, evaluate5, evaluateColumn, forEachCombination, TableauCategory as C, tableauCategoryOf } from '../src';

const col = (s: string): string[] => s.trim().split(/\s+/);
const cat = (s: string): C => evaluateColumn(col(s)).category;
const cmp = (a: string, b: string): number => compareColumns(col(a), col(b));

describe('Tableau — les dix combinaisons', () => {
  it('reconnaît chaque catégorie', () => {
    expect(cat('As Kd 9h 6c 3s')).toBe(C.HighCard);
    expect(cat('8h 8d As 5c 2s')).toBe(C.Pair);
    expect(cat('Kh Kd 4s 4c 9d')).toBe(C.TwoPair);
    expect(cat('7h 7d 7s Kc 2d')).toBe(C.ThreeOfAKind);
    expect(cat('5h 6d 7s 8c 9d')).toBe(C.Straight);
    expect(cat('Ah 9h 7h 4h 2h')).toBe(C.Flush);
    expect(cat('Qh Qd Qs 3c 3d')).toBe(C.FullHouse);
    expect(cat('9h 9d 9s 9c Kd')).toBe(C.FourOfAKind);
    expect(cat('4h 5h 6h 7h 8h')).toBe(C.StraightFlush);
    expect(cat('Th Jh Qh Kh Ah')).toBe(C.RoyalFlush);
  });

  it('la quinte flush royale bat toute autre quinte flush ; la roue flush est la plus faible', () => {
    expect(cmp('Th Jh Qh Kh Ah', '9h Th Jh Qh Kh')).toBe(1);
    expect(cmp('Ah 2h 3h 4h 5h', '2s 3s 4s 5s 6s')).toBe(-1);
    expect(cat('Ah 2h 3h 4h 5h')).toBe(C.StraightFlush);
  });

  it('chaque catégorie bat la précédente, quelles que soient les cartes', () => {
    const ladder = ['As Kd 9h 6c 3s', '2h 2d 3s 4c 5d', '3h 3d 4s 4c 5d', '2h 2d 2s 3c 4d', '2h 3d 4s 5c 6d', '2h 3h 4h 5h 7h', '2h 2d 2s 3c 3d', '2h 2d 2s 2c 3d', '2h 3h 4h 5h 6h', 'Th Jh Qh Kh Ah'];
    for (let i = 1; i < ladder.length; i++) expect(cmp(ladder[i]!, ladder[i - 1]!)).toBe(1);
    // la plus forte carte haute reste inférieure à la plus faible paire
    expect(cmp('Ad Kd Qh Jc 9s', '2h 2d 3s 4c 5d')).toBe(-1);
    // la plus forte quinte reste inférieure à la plus faible couleur
    expect(cmp('Th Jd Qs Kc Ah', '2h 3h 4h 5h 7h')).toBe(-1);
  });
});

describe('Tableau — quintes et roue', () => {
  it('A-2-3-4-5 est une quinte au 5 (la plus faible)', () => {
    const h = evaluateColumn(col('Ad 2h 3s 4c 5d'));
    expect(h.category).toBe(C.Straight);
    expect(h.label).toContain('roue');
    expect(h.cards[0]).toBe('5d');
    expect(h.cards[4]).toBe('Ad');
    expect(cmp('2h 3d 4s 5c 6d', 'Ad 2h 3s 4c 5d')).toBe(1);
    expect(cmp('Ad 2h 3s 4c 5d', 'Ah 2d 3c 4s 5h')).toBe(0);
  });
  it('10-J-Q-K-A est la plus haute quinte', () => {
    expect(cmp('Th Jd Qs Kc Ad', '9h Td Js Qc Kd')).toBe(1);
  });
  it('pas de quinte circulaire (Q-K-A-2-3)', () => {
    expect(cat('Qh Kd As 2c 3d')).toBe(C.HighCard);
    expect(cat('Kh As 2d 3c 4d')).toBe(C.HighCard);
  });
  it('quinte : seule la carte haute compte, les couleurs ne départagent pas', () => {
    expect(cmp('5h 6d 7s 8c 9d', '5s 6h 7c 8d 9h')).toBe(0);
    expect(cmp('6h 7d 8s 9c Td', '5h 6d 7s 8c 9d')).toBe(1);
  });
});

describe('Tableau — départages (kickers)', () => {
  it('carte haute : comparaison carte par carte', () => {
    expect(cmp('Ah Kd 9s 6c 3d', 'Ad Kc 9h 6s 2d')).toBe(1);
    expect(cmp('Ah Kd 9s 6c 3d', 'As Kh 9d 6d 3c')).toBe(0);
    expect(cmp('Ah Qd Js 8c 7d', 'Ah Qd Js 8c 6d')).toBe(1);
  });
  it('paire : la valeur de la paire d’abord, puis les kickers', () => {
    expect(cmp('9h 9d 2s 3c 4d', '8h 8d As Kc Qd')).toBe(1);
    expect(cmp('9h 9d As 3c 4d', '9s 9c Ks Qc Jd')).toBe(1);
    expect(cmp('9h 9d As Kc 4d', '9s 9c As Kd 3d')).toBe(1);
    expect(cmp('9h 9d As Kc 4d', '9s 9c Ad Ks 4c')).toBe(0);
  });
  it('double paire : haute paire, basse paire, puis kicker', () => {
    expect(cmp('Kh Kd 2s 2c 3d', 'Qh Qd Js Jc Ad')).toBe(1);
    expect(cmp('Kh Kd 5s 5c 3d', 'Ks Kc 4h 4d Ad')).toBe(1);
    expect(cmp('Kh Kd 5s 5c Ad', 'Ks Kc 5h 5d Qd')).toBe(1);
    expect(cmp('Kh Kd 5s 5c Ad', 'Ks Kc 5h 5d Ac')).toBe(0);
  });
  it('brelan : valeur du brelan puis kickers', () => {
    expect(cmp('3h 3d 3s 2c 4d', '2h 2d 2s Ac Kd')).toBe(1);
    expect(cmp('7h 7d 7s Ac 4d', '7c 7s 7d Kc Qd')).toBe(1);
  });
  it('couleur : lexicographique sur les cinq cartes', () => {
    expect(cmp('Ah 9h 7h 4h 2h', 'Ks Qs Js 9s 8s')).toBe(1);
    expect(cmp('Ah 9h 7h 4h 3h', 'As 9s 7s 4s 2s')).toBe(1);
    expect(cmp('Ah 9h 7h 4h 2h', 'As 9s 7s 4s 2s')).toBe(0);
  });
  it('full : le brelan prime sur la paire', () => {
    expect(cmp('3h 3d 3s 2c 2d', 'Ah Ad Ks Kc Kd')).toBe(-1); // brelan de 3 < brelan de rois
    expect(cmp('Qh Qd Qs 3c 3d', 'Qc Qs Qd 2c 2d')).toBe(1);
    expect(cmp('Qh Qd Qs 3c 3d', 'Jh Jd Js Ac Ad')).toBe(1);
  });
  it('carré : valeur du carré puis kicker', () => {
    expect(cmp('9h 9d 9s 9c 2d', '8h 8d 8s 8c Ad')).toBe(1);
    expect(cmp('9h 9d 9s 9c Ad', '9c 9s 9d 9h Kd')).toBe(1);
  });
  it('quinte flush : carte haute', () => {
    expect(cmp('5h 6h 7h 8h 9h', '4s 5s 6s 7s 8s')).toBe(1);
  });
  it('libellés français', () => {
    expect(evaluateColumn(col('Kh Kd 2s 3c 4d')).label).toBe('Paire de rois');
    expect(evaluateColumn(col('Ah Ad 2s 3c 4d')).label).toBe("Paire d'as");
    expect(evaluateColumn(col('Ah Ad 4s 4c 9d')).label).toBe("Double paire d'as et de 4");
    expect(evaluateColumn(col('Qh Qd Qs 3c 3d')).label).toBe('Full aux dames par les 3');
    expect(evaluateColumn(col('5h 6d 7s 8c 9d')).label).toBe('Quinte au 9');
    expect(evaluateColumn(col('Th Jh Qh Kh Ah')).label).toBe('Quinte flush royale');
  });
  it('cartes constituant la combinaison', () => {
    expect(evaluateColumn(col('Kh 2d Ks 3c 4d')).forming.sort()).toEqual(['Kh', 'Ks']);
    expect(evaluateColumn(col('Kh Kd Ks 3c 3d')).forming).toHaveLength(5);
    expect(evaluateColumn(col('Ah 9d Ks 3c 4d')).forming).toEqual(['Ah']);
  });
  it('refuse les colonnes incomplètes ou en double', () => {
    expect(() => evaluateColumn(col('Ah Kd Qs'))).toThrow();
    expect(() => evaluateColumn(col('Ah Ah Qs Jc 2d'))).toThrow();
  });
});

describe('Tableau — énumération exhaustive des 2 598 960 mains', () => {
  it('répartition officielle des catégories (dont 4 royales)', () => {
    const counts = new Array<number>(10).fill(0);
    forEachCombination(ALL_CARDS, 5, (five) => {
      counts[tableauCategoryOf(evaluate5(five))]!++;
    });
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2598960);
  }, 60_000);
});

describe('Tableau — colonnes incomplètes (pédagogie)', () => {
  it('décrit paires, brelans et tirages', () => {
    expect(describePartial(col('Kh Kd'))).toBe('Paire de rois');
    expect(describePartial(col('7h 7d 7s'))).toBe('Brelan de 7');
    expect(describePartial(col('2h 9h Kh'))).toContain('couleur');
    expect(describePartial(col('5h 6d 7s'))).toContain('quinte');
    expect(describePartial(col('Ah 9d'))).toBe('Carte haute : as');
  });
});
