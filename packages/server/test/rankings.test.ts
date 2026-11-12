import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { logRank, periodBounds, pokerEntries } from '../src/accounts/rankings';
import { AccountService } from '../src/accounts/service';
import type { FinishedGame } from '../src/accounts/types';

const D = 86_400_000;
// Jeudi 12 novembre 2026, midi à Paris (UTC+1).
const NOW = Date.UTC(2026, 10, 12, 11, 0, 0);
const parisMidnightWinter = (y: number, m: number, d: number) => Date.UTC(y, m, d) - 3_600_000;

describe('périodes de classement (heure de Paris)', () => {
  it('semaine : du lundi 00 h au lundi suivant ; mois : du 1er au 1er du mois suivant', () => {
    expect(periodBounds(NOW, 'week')).toEqual({ since: parisMidnightWinter(2026, 10, 9), until: parisMidnightWinter(2026, 10, 16) });
    expect(periodBounds(NOW, 'month')).toEqual({ since: parisMidnightWinter(2026, 10, 1), until: parisMidnightWinter(2026, 11, 1) });
    expect(periodBounds(NOW, 'all')).toEqual({ since: 0, until: null });
  });
  it('le dimanche soir à 23 h 30 appartient encore à la semaine qui finit', () => {
    const sundayLate = Date.UTC(2026, 10, 15, 22, 30);
    expect(periodBounds(sundayLate, 'week').since).toBe(parisMidnightWinter(2026, 10, 9));
    expect(periodBounds(sundayLate + 3_600_000, 'week').since).toBe(parisMidnightWinter(2026, 10, 16));
  });
  it('changement d’heure : la semaine du 29 mars 2026 compte 167 heures', () => {
    const b = periodBounds(Date.UTC(2026, 2, 27, 12), 'week');
    expect(b.until! - b.since).toBe(7 * D - 3_600_000);
  });
});

describe('classements par jeu', () => {
  async function setup() {
    const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { now: () => NOW, log: () => undefined });
    const ids: Record<string, string> = {};
    for (const n of ['Ana', 'Bea', 'Cleo']) ids[n] = (await accounts.register({ nickname: n, email: `${n}@x.fr`, password: 'tapis-vert-42' })).account.id;
    const db = accounts['store'].db;
    return { accounts, db, ids };
  }

  it('victoires sur la période, puis moins de parties jouées ; l’ancien est exclu de la semaine mais compte au total', async () => {
    const { accounts, db, ids } = await setup();
    const add = (who: string, ref: string, at: number, won: number) => logRank(db, { userId: ids[who]!, game: 'V6_3', ref, endedAt: at, played: 1, won });
    add('Ana', 'a1', NOW - D, 1); add('Ana', 'a2', NOW - 2 * D, 1);
    add('Bea', 'b1', NOW - D, 1); add('Bea', 'b2', NOW - 2 * D, 0);
    add('Cleo', 'c1', NOW - 20 * D, 1); // le mois dernier
    const week = accounts.rankings(ids.Ana!, { game: 'V6_3', period: 'week' });
    expect(week.rows.map((r) => [r.nickname, r.wins, r.played])).toEqual([['Ana', 2, 2], ['Bea', 1, 2]]);
    expect(week.rows[0]!.you).toBe(true);
    expect(accounts.rankings(ids.Ana!, { game: 'V6_3', period: 'month' }).rows.map((r) => r.nickname)).toEqual(['Ana', 'Bea']);
    expect(accounts.rankings(ids.Ana!, { game: 'V6_3', period: 'all' }).rows.map((r) => r.nickname)).toEqual(['Ana', 'Cleo', 'Bea']);
    // un autre jeu reste vide
    expect(accounts.rankings(ids.Ana!, { game: 'LE10', period: 'all' }).rows).toEqual([]);
  });

  it('blackjack : classé au gain net ; un joueur hors du haut du classement voit sa propre position', async () => {
    const { accounts, db, ids } = await setup();
    logRank(db, { userId: ids.Ana!, game: 'blackjack', ref: 'x1', endedAt: NOW - D, played: 1, won: 1, score: 50 });
    logRank(db, { userId: ids.Bea!, game: 'blackjack', ref: 'x2', endedAt: NOW - D, played: 1, won: 0, score: -20 });
    const r = accounts.rankings(ids.Bea!, { game: 'blackjack', period: 'week' });
    expect(r.rows.map((x) => [x.nickname, x.net])).toEqual([['Ana', 50], ['Bea', -20]]);
    expect(r.mine).toBeNull(); // déjà dans la liste
    for (let i = 0; i < 25; i++) {
      db.prepare('INSERT INTO users (id, nickname, email, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(`u${i}`, `Bot${i}`, `b${i}@x.fr`, 'x', 0);
      logRank(db, { userId: `u${i}`, game: 'blackjack', ref: `r${i}`, endedAt: NOW - D, played: 1, won: 1, score: 100 + i });
    }
    const low = accounts.rankings(ids.Bea!, { game: 'blackjack', period: 'week' });
    expect(low.rows).toHaveLength(20);
    expect(low.mine).toMatchObject({ nickname: 'Bea', rank: 27, you: true });
  });

  it('les invités ne figurent jamais au classement', async () => {
    const { accounts, db, ids } = await setup();
    logRank(db, { userId: 'guest:zz', game: 'blackjack', ref: 'g1', endedAt: NOW, played: 1, won: 1, score: 999 });
    expect(accounts.rankings(ids.Ana!, { game: 'blackjack', period: 'all' }).rows).toEqual([]);
  });

  it('jeu ou période inconnus : requête refusée ; valeurs par défaut : poker, semaine', async () => {
    const { accounts, ids } = await setup();
    expect(() => accounts.rankings(ids.Ana!, { game: 'belote' })).toThrow();
    expect(accounts.rankings(ids.Ana!, {})).toMatchObject({ game: 'poker', period: 'week' });
  });

  it('une partie de poker alimente le classement des parties et celui de chaque variante jouée', () => {
    const g = {
      endedAt: NOW,
      history: [
        { variant: 'V6_3', points: { p1: 1, p2: 0 }, award: { kind: 'POINTS', winner: 'p1' } },
        { variant: 'V6_3', points: { p1: 0, p2: 1 }, award: { kind: 'POINTS', winner: 'p2' } },
        { variant: 'LE10', points: { p1: 1, p2: 0 }, award: { kind: 'POINTS', winner: 'p1' } },
      ],
    } as unknown as FinishedGame;
    const e = pokerEntries(g, 'g1', 'u1', 'p1', true);
    expect(e.map((x) => [x.game, x.played, x.won])).toEqual([['poker', 1, 1], ['V6_3', 2, 1], ['LE10', 1, 1]]);
  });

  it('le journal est reconstitué depuis les archives au premier démarrage (blackjack et Tableau compris)', () => {
    const store = new AccountDb(':memory:');
    store.db.prepare('INSERT INTO users (id, nickname, email, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'Ana', 'a@x.fr', 'x', 0);
    store.db.prepare("INSERT INTO bj_history (user_id, ended_at, table_id, bet, net, wagered, seed, commitment, rules, actions, summary) VALUES ('u1', ?, 't', 10, 15, 10, 's', 'c', 'r', 'a', '{}')").run(NOW);
    store.db.prepare("INSERT INTO tb_profile (user_id, variant, rating, peak, ranked_games, ranked_wins) VALUES ('u1', 'classic', 1500, 1500, 4, 3)").run();
    store.db.exec('DELETE FROM rank_log');
    // relance du rattrapage sur un journal vide
    const again = new AccountService(store, new LogMailer(false, () => undefined), { now: () => NOW, log: () => undefined });
    void again;
    return import('../src/accounts/rankings').then(({ backfillRankLog, computeRanking }) => {
      backfillRankLog(store.db);
      expect(computeRanking(store.db, 'u1', 'blackjack', 'all', NOW).rows[0]).toMatchObject({ wins: 1, net: 15 });
      const tb = computeRanking(store.db, 'u1', 'tableau:classic', 'all', NOW).rows[0];
      expect(tb).toMatchObject({ wins: 3, played: 4 });
      expect(computeRanking(store.db, 'u1', 'tableau:classic', 'week', NOW).rows).toEqual([]); // sans date : total seulement
    });
  });
});
