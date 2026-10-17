import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import {
  assertInsuranceAllowed,
  insuredPartner,
  playersOneFromEnd,
  settle,
  type Insurance,
  type InsuranceType,
} from '../src/game/insurance';
import { RuleError } from '../src/variants';
import { names } from './helpers';

const P6 = names(6); // 6 joueurs × 20 € = 120 €
const STAKE = 2000;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const pair = (a: string, b: string, type: InsuranceType): Insurance => ({ players: [a, b], type });

describe('règlement — exemples du cahier des charges (cagnotte 120 €)', () => {
  it('« Le perdant ne paye pas » : A gagne → A reçoit 100 €, B récupère sa mise de 20 €', () => {
    const s = settle({ players: P6, stakeCents: STAKE, winner: 'P0', insurances: [pair('P0', 'P1', 'LOSER_NOT_PAYING')] });
    expect(s.potCents).toBe(12000);
    expect(s.payouts).toEqual({ P0: 10000, P1: 2000, P2: 0, P3: 0, P4: 0, P5: 0 });
    expect(s.applied).toEqual(pair('P0', 'P1', 'LOSER_NOT_PAYING'));
  });

  it('« 50 / 50 » : A gagne → A reçoit 60 €, B reçoit 60 €', () => {
    const s = settle({ players: P6, stakeCents: STAKE, winner: 'P0', insurances: [pair('P0', 'P1', 'SPLIT_50_50')] });
    expect(s.payouts).toEqual({ P0: 6000, P1: 6000, P2: 0, P3: 0, P4: 0, P5: 0 });
  });

  it('symétrique : si c\'est B (l\'autre assuré) qui gagne, les montants sont les mêmes rôles inversés', () => {
    const a = settle({ players: P6, stakeCents: STAKE, winner: 'P1', insurances: [pair('P0', 'P1', 'LOSER_NOT_PAYING')] });
    expect(a.payouts).toMatchObject({ P1: 10000, P0: 2000 });
    const b = settle({ players: P6, stakeCents: STAKE, winner: 'P1', insurances: [pair('P0', 'P1', 'SPLIT_50_50')] });
    expect(b.payouts).toMatchObject({ P1: 6000, P0: 6000 });
  });
});

describe('règlement — vainqueur hors assurance', () => {
  it('sans aucune assurance : le vainqueur récupère toute la cagnotte', () => {
    const s = settle({ players: P6, stakeCents: STAKE, winner: 'P3', insurances: [] });
    expect(s.payouts.P3).toBe(12000);
    expect(sum(s.payouts)).toBe(12000);
    expect(s.applied).toBeNull();
  });

  it('vainqueur non assuré : il récupère tout, quelle que soit l\'assurance des autres (les deux types)', () => {
    for (const type of ['LOSER_NOT_PAYING', 'SPLIT_50_50'] as const) {
      const s = settle({ players: P6, stakeCents: STAKE, winner: 'P3', insurances: [pair('P0', 'P1', type)] });
      expect(s.payouts).toEqual({ P0: 0, P1: 0, P2: 0, P3: 12000, P4: 0, P5: 0 });
      expect(s.applied).toBeNull();
    }
  });

  it('plusieurs paires : seule l\'assurance qui contient le vainqueur s\'applique', () => {
    const ins = [pair('P0', 'P1', 'SPLIT_50_50'), pair('P2', 'P3', 'LOSER_NOT_PAYING')];
    const s = settle({ players: P6, stakeCents: STAKE, winner: 'P2', insurances: ins });
    expect(s.payouts).toEqual({ P0: 0, P1: 0, P2: 10000, P3: 2000, P4: 0, P5: 0 });
    expect(s.applied).toEqual(ins[1]);
  });

  it('2 joueurs assurés entre eux : « perdant ne paye pas » = chacun retrouve sa mise', () => {
    const s = settle({ players: ['A', 'B'], stakeCents: 500, winner: 'A', insurances: [pair('A', 'B', 'LOSER_NOT_PAYING')] });
    expect(s.payouts).toEqual({ A: 500, B: 500 });
  });
});

describe('règlement — centimes et invariants', () => {
  it('cagnotte impaire en 50/50 : aucun centime perdu ; le centime impair revient au vainqueur (hypothèse)', () => {
    const s = settle({ players: names(3), stakeCents: 333, winner: 'P0', insurances: [pair('P0', 'P1', 'SPLIT_50_50')] });
    expect(s.potCents).toBe(999);
    expect(s.payouts).toEqual({ P0: 500, P1: 499, P2: 0 });
  });

  it('mise à 0 : tout est à 0', () => {
    const s = settle({ players: names(3), stakeCents: 0, winner: 'P1', insurances: [pair('P1', 'P2', 'SPLIT_50_50')] });
    expect(sum(s.payouts)).toBe(0);
  });

  it('propriété : la somme des gains égale toujours la cagnotte, aucun montant négatif, le vainqueur touche au moins son partenaire', () => {
    const rng = new SeededRng(2026);
    for (let i = 0; i < 2000; i++) {
      const n = 2 + rng.int(5);
      const players = names(n);
      const stakeCents = rng.int(1_000_001);
      const winner = players[rng.int(n)]!;
      const others = players.filter((p) => p !== winner);
      const partner = others[rng.int(others.length)]!;
      const type: InsuranceType = rng.int(2) === 0 ? 'LOSER_NOT_PAYING' : 'SPLIT_50_50';
      const withIns = rng.int(3) > 0;
      const s = settle({ players, stakeCents, winner, insurances: withIns ? [pair(winner, partner, type)] : [] });
      expect(sum(s.payouts)).toBe(stakeCents * n);
      for (const v of Object.values(s.payouts)) expect(v).toBeGreaterThanOrEqual(0);
      expect(s.payouts[winner]!).toBeGreaterThanOrEqual(withIns ? s.payouts[partner]! : 0);
      for (const p of others) if (p !== partner || !withIns) expect(s.payouts[p]).toBe(0);
    }
  });

  it('entrées invalides refusées : vainqueur inconnu, joueur assuré hors table, joueur dans deux assurances, assurance à soi-même', () => {
    const base = { players: names(4), stakeCents: 100 };
    expect(() => settle({ ...base, winner: 'X', insurances: [] })).toThrowError(RuleError);
    expect(() => settle({ ...base, winner: 'P0', insurances: [pair('P0', 'Z', 'SPLIT_50_50')] })).toThrowError(/inconnu/);
    expect(() => settle({ ...base, winner: 'P0', insurances: [pair('P0', 'P1', 'SPLIT_50_50'), pair('P1', 'P2', 'SPLIT_50_50')] })).toThrowError(/deux assurances/);
    expect(() => settle({ ...base, winner: 'P0', insurances: [pair('P0', 'P0', 'SPLIT_50_50')] })).toThrowError(/exactement 2/);
    expect(() => settle({ ...base, stakeCents: -1, winner: 'P0', insurances: [] })).toThrowError(RuleError);
  });

  it('insuredPartner', () => {
    const ins = [pair('P0', 'P1', 'SPLIT_50_50')];
    expect(insuredPartner('P0', ins)).toBe('P1');
    expect(insuredPartner('P1', ins)).toBe('P0');
    expect(insuredPartner('P2', ins)).toBeNull();
  });
});

describe('éligibilité : uniquement des joueurs à 1 point de la fin de la partie', () => {
  const order = names(4);
  const ctx = (scores: Record<string, number>, existing: Insurance[] = [], target = 10) => ({ order, scores, targetPoints: target, existing });

  it('joueurs à exactement objectif − 1', () => {
    expect(playersOneFromEnd(order, { P0: 9, P1: 9, P2: 8, P3: 0 }, 10)).toEqual(['P0', 'P1']);
    expect(playersOneFromEnd(order, { P0: 0, P1: 0, P2: 1, P3: 0 }, 1)).toEqual(['P0', 'P1', 'P3']);
    expect(playersOneFromEnd(order, { P0: 0, P1: 0, P2: 0, P3: 0 }, 10)).toEqual([]);
  });

  it('le proposant ET le partenaire doivent tous deux être à 1 point de la fin', () => {
    const scores = { P0: 9, P1: 9, P2: 8, P3: 9 };
    expect(() => assertInsuranceAllowed('P0', 'P1', ctx(scores))).not.toThrow();
    expect(() => assertInsuranceAllowed('P0', 'P2', ctx(scores))).toThrowError(/P2 n'est pas à 1 point/); // partenaire à 2 points
    expect(() => assertInsuranceAllowed('P2', 'P0', ctx(scores))).toThrowError(/P2 n'est pas à 1 point/); // proposant à 2 points
    try {
      assertInsuranceAllowed('P0', 'P2', ctx(scores));
    } catch (e) {
      expect((e as RuleError).code).toBe('INSURANCE_NOT_ELIGIBLE');
    }
  });

  it('exclusivité : un joueur déjà assuré ne peut plus entrer dans une autre assurance', () => {
    const scores = { P0: 9, P1: 9, P2: 9, P3: 9 };
    const existing = [pair('P0', 'P1', 'SPLIT_50_50')];
    expect(() => assertInsuranceAllowed('P2', 'P0', ctx(scores, existing))).toThrowError(/déjà assuré/);
    expect(() => assertInsuranceAllowed('P1', 'P3', ctx(scores, existing))).toThrowError(/déjà assuré/);
    expect(() => assertInsuranceAllowed('P2', 'P3', ctx(scores, existing))).not.toThrow(); // libre pour deux autres joueurs
  });

  it('exactement 2 joueurs distincts, présents à la table', () => {
    const scores = { P0: 9, P1: 9, P2: 9, P3: 9 };
    expect(() => assertInsuranceAllowed('P0', 'P0', ctx(scores))).toThrowError(/exactement 2/);
    expect(() => assertInsuranceAllowed('P0', 'ZZ', ctx(scores))).toThrowError(/inconnu/);
  });

  it('un joueur qui a déjà atteint ou dépassé l\'objectif n\'est pas à 1 point', () => {
    expect(playersOneFromEnd(order, { P0: 10, P1: 11, P2: 9, P3: 0 }, 10)).toEqual(['P2']);
  });
});
