import { SeededRng } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { BlackjackService } from '../src/blackjack/service';
import { BlackjackTables } from '../src/blackjack/tables';
import { TableauService } from '../src/tableau/service';

// Parties ouvertes du Blackjack à plusieurs et du Tableau : listées tant qu'elles attendent, jamais si privées.

const A = { userId: 'guest:' + 'a1'.repeat(16), nickname: 'Ana', avatar: null };
const B = { userId: 'guest:' + 'b2'.repeat(16), nickname: 'Ben', avatar: null };

function setup() {
  const store = new AccountDb(':memory:');
  let t = 7_000_000;
  let n = 0;
  const seed = () => (++n).toString(16).padStart(64, '0');
  const bj = new BlackjackService(store, { now: () => t });
  const tables = new BlackjackTables(store, bj, { now: () => t, seed });
  const tb = new TableauService(store, bj, { now: () => t, seed, rng: new SeededRng(3), aiSims: 8, aiBudgetMs: 1000 });
  return { tables, tb };
}

describe('Blackjack : tables ouvertes', () => {
  it('une table publique en attente est listée, une table privée jamais', () => {
    const { tables } = setup();
    expect(tables.listOpen()).toEqual([]);
    tables.create(A, { table: 'decouverte', seats: ['human', 'human', 'cpu'] });
    expect(tables.listOpen()).toEqual([]);
    const pub = tables.create(B, { table: 'decouverte', seats: ['human', 'human', 'human'], public: true });
    const open = tables.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ code: pub.code, host: 'Ben', seatsLeft: 2, humanSeats: 3 });
  });

  it('elle disparaît de la liste quand les places humaines sont prises ou quand la partie démarre', () => {
    const { tables } = setup();
    const C = { userId: 'guest:' + 'c3'.repeat(16), nickname: 'Cléo', avatar: null };
    const v = tables.create(A, { table: 'decouverte', seats: ['human', 'human', 'human'], public: true });
    tables.join(v.code, B);
    expect(tables.listOpen()[0]).toMatchObject({ seatsLeft: 1 });
    tables.join(v.code, C);
    expect(tables.listOpen()).toEqual([]);
    const w = tables.create({ userId: 'guest:' + 'd4'.repeat(16), nickname: 'Dan', avatar: null }, { table: 'decouverte', seats: ['human', 'human'], public: true });
    expect(tables.listOpen()).toHaveLength(1);
    tables.start(w.code, 'guest:' + 'd4'.repeat(16));
    expect(tables.listOpen()).toEqual([]);
  });
});

describe('Tableau : parties amicales ouvertes', () => {
  it('une partie amicale publique en attente est listée, puis retirée à l’arrivée de l’adversaire', () => {
    const { tb } = setup();
    tb.create(A, { mode: 'friendly' });
    expect(tb.listOpen()).toEqual([]); // privée par défaut
    tb.create(B, { mode: 'friendly', variant: 'hand5', public: true });
    const open = tb.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ variant: 'hand5', nickname: 'Ben' });
    tb.join(open[0]!.code, { userId: 'guest:' + 'c3'.repeat(16), nickname: 'Cléo', avatar: null });
    expect(tb.listOpen()).toEqual([]);
  });

  it('l’option ne concerne que le mode amical', () => {
    const { tb } = setup();
    tb.create(A, { mode: 'training', public: true });
    expect(tb.listOpen()).toEqual([]);
  });
});
