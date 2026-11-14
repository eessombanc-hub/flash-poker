import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { logRank } from '../src/accounts/rankings';
import { AccountService } from '../src/accounts/service';

async function setup() {
  const db = new AccountDb(':memory:');
  const now = 1_800_000_000_000;
  const accounts = new AccountService(db, new LogMailer(true, () => undefined), { now: () => now, log: () => undefined });
  const mk = async (n: string, club: string | null) => {
    const r = await accounts.register({ nickname: n, email: `${n}@x.fr`, password: 'tapis-vert-42' });
    if (club) accounts.updateProfile(r.account.id, { club });
    return r.account.id;
  };
  const log = (userId: string, game: string, won: number, played: number, score = 0, ref = Math.random().toString()) =>
    logRank(db.db, { userId, game: game as never, ref, endedAt: now - 1000, played, won, score });
  return { accounts, mk, log };
}

describe('classement par club', () => {
  it('affiche le club à côté du joueur dans le classement individuel', async () => {
    const { accounts, mk, log } = await setup();
    const a = await mk('Ana', 'Amical Poker Club');
    const b = await mk('Bob', null);
    log(a, 'poker', 2, 3);
    log(b, 'poker', 1, 3);
    const r = accounts.rankings(a, { game: 'poker', period: 'all' });
    expect(r.rows.map((x) => [x.nickname, x.club])).toEqual([['Ana', 'Amical Poker Club'], ['Bob', null]]);
  });

  it('additionne les victoires des membres, écarte les clubs de moins de deux membres et repère le sien', async () => {
    const { accounts, mk, log } = await setup();
    const a1 = await mk('Ana', 'Amical Poker Club');
    const a2 = await mk('Ari', 'amical poker-club');
    const b1 = await mk('Bob', 'Cercle Élysée');
    const b2 = await mk('Bea', 'Cercle Élysée');
    const solo = await mk('Sol', 'Club Solitaire');
    log(a1, 'poker', 1, 2);
    log(a2, 'poker', 1, 1);
    log(b1, 'poker', 3, 4);
    log(b2, 'poker', 0, 2);
    log(solo, 'poker', 9, 9);
    const r = accounts.clubGameRanking(a1, { game: 'poker', period: 'all' });
    expect(r.clubs).toBe(2);
    expect(r.rows.map((x) => [x.name, x.wins, x.played, x.active, x.members, x.you])).toEqual([
      ['Cercle Élysée', 3, 6, 2, 2, false],
      ['Amical Poker Club', 2, 3, 2, 2, true],
    ]);
  });

  it('au blackjack, le gain net départage ; la période exclut les anciennes parties', async () => {
    const { accounts, mk, log } = await setup();
    const a1 = await mk('Ana', 'Alpha');
    const a2 = await mk('Ari', 'Alpha');
    const b1 = await mk('Bob', 'Beta');
    const b2 = await mk('Bea', 'Beta');
    log(a1, 'blackjack', 5, 10, -300);
    log(b1, 'blackjack', 1, 10, 800);
    log(a2, 'blackjack', 1, 1, 100);
    log(b2, 'blackjack', 0, 1, -100);
    const r = accounts.clubGameRanking(a1, { game: 'blackjack', period: 'week' });
    expect(r.rows.map((x) => [x.name, x.net])).toEqual([['Beta', 700], ['Alpha', -200]]);
  });
});
