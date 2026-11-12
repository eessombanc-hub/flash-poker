import { describe, expect, it } from 'vitest';
import { computeEngagement, parisDay } from '../src/accounts/engagement';

const H = 3_600_000;
const D = 24 * H;
// Midi à Paris, un jour d'hiver (UTC+1) : évite toute ambiguïté de changement d'heure.
const NOW = Date.UTC(2026, 10, 12, 11, 0, 0);

describe('engagement', () => {
  it('jour de Paris : 23h30 UTC bascule au lendemain', () => {
    expect(parisDay(Date.UTC(2026, 10, 12, 23, 30))).toBe('2026-11-13');
    expect(parisDay(Date.UTC(2026, 10, 12, 22, 30))).toBe('2026-11-12');
  });

  it('sans partie : tout est à zéro et rien n’est débloqué', () => {
    const e = computeEngagement([], NOW);
    expect(e.streak).toBe(0);
    expect(e.challenges.every((c) => !c.done && c.progress === 0)).toBe(true);
    expect(e.trophies.every((t) => !t.unlocked)).toBe(true);
  });

  it('défis du jour : progression plafonnée à la cible', () => {
    const e = computeEngagement([{ endedAt: NOW - H, won: true }, { endedAt: NOW - 2 * H, won: false }], NOW);
    const by = Object.fromEntries(e.challenges.map((c) => [c.id, c]));
    expect(by.play1!.done).toBe(true);
    expect(by.play3).toMatchObject({ progress: 2, done: false });
    expect(by.win1!.done).toBe(true);
  });

  it('série : continue si on a joué hier, retombe à zéro après deux jours sans partie', () => {
    const yesterday = [{ endedAt: NOW - D, won: false }, { endedAt: NOW - 2 * D, won: false }];
    expect(computeEngagement(yesterday, NOW).streak).toBe(2);
    const old = [{ endedAt: NOW - 3 * D, won: false }, { endedAt: NOW - 4 * D, won: false }];
    const e = computeEngagement(old, NOW);
    expect(e.streak).toBe(0);
    expect(e.bestStreak).toBe(2);
  });

  it('plusieurs parties le même jour comptent pour un seul jour de série', () => {
    const e = computeEngagement([{ endedAt: NOW - H, won: false }, { endedAt: NOW - 2 * H, won: false }, { endedAt: NOW - D, won: false }], NOW);
    expect(e.streak).toBe(2);
  });

  it('trophées : victoires, série de victoires, série de jours', () => {
    const games = [1, 2, 3].map((i) => ({ endedAt: NOW - (4 - i) * D, won: true }));
    const e = computeEngagement(games, NOW);
    const open = (id: string) => e.trophies.find((t) => t.id === id)!.unlocked;
    expect(open('first_game')).toBe(true);
    expect(open('first_win')).toBe(true);
    expect(open('win_row_3')).toBe(true);
    expect(open('streak_3')).toBe(true);
    expect(open('wins_10')).toBe(false);
    expect(open('streak_7')).toBe(false);
  });
});

import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';

describe('classement hebdomadaire entre favoris', () => {
  it('compte les victoires des sept derniers jours du joueur et de ses favoris seulement', async () => {
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(true, () => undefined), { now: () => NOW, log: () => undefined });
    const ana = (await accounts.register({ nickname: 'Ana', email: 'a@x.fr', password: 'tapis-vert-42' })).account;
    const bea = (await accounts.register({ nickname: 'Bea', email: 'b@x.fr', password: 'tapis-vert-42' })).account;
    const cyr = (await accounts.register({ nickname: 'Cyr', email: 'c@x.fr', password: 'tapis-vert-42' })).account;
    accounts.addFavorite(ana.id, { nickname: 'Bea' });
    let n = 0;
    const add = (uid: string, won: number, at: number) => {
      const gid = `g${++n}`;
      store.db.prepare('INSERT INTO games (id, ended_at, data) VALUES (?, ?, ?)').run(gid, at, '{}');
      store.db.prepare('INSERT INTO user_games (user_id, game_id, player_id, net_cents, won, ended_at) VALUES (?, ?, ?, 0, ?, ?)').run(uid, gid, 'p', won, at);
    };
    add(ana.id, 1, NOW - D);
    add(bea.id, 1, NOW - 2 * D);
    add(bea.id, 1, NOW - 3 * D);
    add(bea.id, 1, NOW - 9 * D); // hors fenêtre
    add(cyr.id, 1, NOW - D); // pas un favori
    const rows = accounts.leaderboard(ana.id);
    expect(rows.map((r) => [r.nickname, r.wins, r.games, r.you])).toEqual([['Bea', 2, 2, false], ['Ana', 1, 1, true]]);
  });
});
