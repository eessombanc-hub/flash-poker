import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, BjError, handValue, recommend, replayTable, seatRound, startTable, startTableFromShoe, tableApply, tableLegal, tableView, type TableRound, type BjAction } from '../src/blackjack';
import { commitmentOf, shoeFromSeed } from '../src/blackjack';

const rules = { ...DEFAULT_RULES };
/** Table sur un sabot imposé : cartes dans l'ordre de distribution (une par place, croupier, une par place, croupier, puis le reste). */
const withShoe = (bets: number[], shoe: string[], r = rules): TableRound => startTableFromShoe(r, bets, [...shoe, ...shoeFromSeed('reste', 6)]);

describe('Table à plusieurs : distribution', () => {
  it('de 1 à 6 places seulement', () => {
    expect(() => startTable(rules, [], 'a')).toThrow(BjError);
    expect(() => startTable(rules, Array(7).fill(10), 'a')).toThrow(BjError);
    expect(() => startTable(rules, [0], 'a')).toThrow(BjError);
    for (let n = 1; n <= 6; n++) {
      const t = startTable(rules, Array(n).fill(10), 'graine');
      expect(t.seats).toHaveLength(n);
      expect(t.seats.every((s) => s.hands[0]!.cards.length === 2)).toBe(true);
      expect(t.dealer).toHaveLength(2);
      expect(t.pos).toBe(2 * n + 2);
    }
  });
  it('sabot reconstructible depuis la graine, ordre de distribution classique', () => {
    const shoe = shoeFromSeed('graine', 6);
    const t = startTable(rules, [10, 10, 10], 'graine');
    expect(t.seats.map((s) => s.hands[0]!.cards)).toEqual([
      [shoe[0], shoe[4]],
      [shoe[1], shoe[5]],
      [shoe[2], shoe[6]],
    ]);
    expect(t.dealer).toEqual([shoe[3], shoe[7]]);
    expect(commitmentOf('graine')).toHaveLength(64);
  });
  it('la carte cachée du croupier ne sort pas de la vue publique', () => {
    const t = startTable(rules, [10, 10], 'a');
    if (t.phase === 'PLAYER') expect(tableView(t).dealer[1]).toBeNull();
  });
});

describe('Table à plusieurs : tours et résultats', () => {
  it('chaque place joue à son tour, puis le croupier', () => {
    // Place 0 : 10+6, place 1 : 9+9 ; croupier 10 + 7 = 17
    const t0 = withShoe([10, 20], ['Tc', '9c', 'Ts', '6d', '9d', '7h', '5c', '2c', 'Kd', 'Qd'], rules);
    expect(t0.turn).toBe(0);
    expect(tableLegal(t0, 1)).toEqual([]); // pas son tour
    expect(() => tableApply(t0, 1, 'STAND')).toThrow(BjError);
    const t1 = tableApply(t0, 0, 'STAND');
    expect(t1.turn).toBe(1);
    const t2 = tableApply(t1, 1, 'STAND');
    expect(t2.phase).toBe('DONE');
    expect(t2.dealer).toEqual(['Ts', '7h']);
    // 16 < 17 : place 0 perd ; 18 > 17 : place 1 gagne 20
    expect(t2.seats[0]!.net).toBe(-10);
    expect(t2.seats[1]!.net).toBe(20);
    expect(t0.phase).toBe('PLAYER'); // l'état précédent n'est pas modifié
  });
  it('la place qui dépasse ne bloque pas les suivantes ; le croupier ne tire pas si tout le monde a perdu', () => {
    const t0 = withShoe([10, 10], ['Tc', 'Th', '6s', '6d', '6h', '6c', 'Kd', 'Qd', '2c'], rules);
    // place 0 : T+6=16 ; place 1 : T+6=16 ; croupier 6+6=12
    let t = tableApply(t0, 0, 'HIT'); // K -> 26, dépasse
    expect(t.turn).toBe(1);
    t = tableApply(t, 1, 'HIT'); // Q -> 26
    expect(t.phase).toBe('DONE');
    expect(t.dealer).toHaveLength(2); // aucun tirage inutile
    expect(t.seats.map((s) => s.net)).toEqual([-10, -10]);
  });
  it('Blackjack naturel d’une place : réglé d’emblée, 3 contre 2 ; les autres jouent', () => {
    // p0 : A + K ; p1 : 9 + 9 ; croupier : 5 + 7 (tire ensuite)
    const a = withShoe([10, 10], ['As', '9c', '5d', 'Ks', '9d', '7h', 'Tc']);
    expect(a.seats[0]!.hands[0]!.done).toBe(true);
    expect(a.turn).toBe(1);
    const done = tableApply(a, 1, 'STAND');
    expect(done.phase).toBe('DONE');
    expect(done.seats[0]!.net).toBe(15);
    expect(done.seats[0]!.hands[0]!.result).toBe('BLACKJACK');
  });
  it('Blackjack du croupier : toutes les places sont réglées sans jouer', () => {
    // p0 : 10+9, p1 : A+K (égalité), croupier : A + K
    const t = withShoe([10, 10], ['Tc', 'As', 'Ad', '9c', 'Ks', 'Kd']);
    expect(t.phase).toBe('DONE');
    expect(t.dealerBlackjack).toBe(true);
    expect(t.seats[0]!.net).toBe(-10);
    expect(t.seats[1]!.net).toBe(0);
  });
  it('doublement et séparation : mises par place, jetons contrôlés', () => {
    const t0 = withShoe([10, 10], ['8c', '5c', '9d', '8d', '6s', '7h', '3c', '4c', 'Td', 'Tc', 'Kd'], rules);
    expect(tableLegal(t0, 0, 100)).toContain('SPLIT');
    expect(tableLegal(t0, 0, 10)).not.toContain('SPLIT'); // pas assez de jetons libres (10 engagés)
    const t1 = tableApply(t0, 0, 'SPLIT', 100);
    expect(t1.seats[0]!.hands).toHaveLength(2);
    expect(t1.seats[0]!.wagered).toBe(20);
    expect(t1.turn).toBe(0);
    expect(t1.seats[1]!.wagered).toBe(10);
  });
  it('rejeu : la graine et le journal redonnent la manche', () => {
    const seed = 'rejeu-1';
    let t = startTable(rules, [10, 10, 10], seed);
    const bets = [10, 10, 10];
    for (let i = 0; i < 40 && t.phase === 'PLAYER'; i++) {
      const rec = recommend(seatRound(t, t.turn), 1e9);
      const legal = tableLegal(t, t.turn);
      const a: BjAction = rec && legal.includes(rec.action) ? rec.action : 'STAND';
      t = tableApply(t, t.turn, a);
    }
    expect(t.phase).toBe('DONE');
    const again = replayTable(rules, bets, seed, t.log);
    expect(again.dealer).toEqual(t.dealer);
    expect(again.seats.map((s) => s.net)).toEqual(t.seats.map((s) => s.net));
  });
  it('2 000 tables aléatoires : toujours terminées, bilan cohérent, croupier valide', () => {
    for (let k = 0; k < 2000; k++) {
      const n = 1 + (k % 6);
      let t = startTable({ ...rules, decks: 1 + (k % 8) }, Array(n).fill(10), `sim-${k}`);
      let guard = 0;
      while (t.phase === 'PLAYER') {
        if (++guard > 200) throw new Error('boucle');
        const legal = tableLegal(t, t.turn, 1e9);
        expect(legal.length).toBeGreaterThan(0);
        const rec = recommend(seatRound(t, t.turn), 1e9);
        t = tableApply(t, t.turn, rec && legal.includes(rec.action) ? rec.action : legal[0]!, 1e9);
      }
      const dv = handValue(t.dealer);
      const allLost = t.seats.every((s) => s.hands.every((h) => h.surrendered || handValue(h.cards).bust));
      if (!allLost) expect(dv.total >= 17).toBe(true);
      for (const s of t.seats) {
        expect(s.hands.every((h) => h.result !== null)).toBe(true);
        expect(s.net).toBe(s.hands.reduce((a, h) => a + h.net, 0));
      }
    }
  });
});
