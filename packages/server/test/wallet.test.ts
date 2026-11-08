import { SeededRng } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService, WALLET_REFILL_DELAY_MS } from '../src/accounts/service';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const HOUR = 3_600_000;

async function ana(t: { now: number }) {
  const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { appUrl: 'https://jeu.test', now: () => t.now, log: () => undefined });
  const r = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
  return { accounts, id: r.account.id };
}

/** Enregistre une partie fictive dont le net pour le compte vaut `net`. */
function lose(accounts: AccountService, id: string, net: number, endedAt: number): void {
  const db = accounts['store'].db;
  db.prepare('INSERT INTO games (id, ended_at, data) VALUES (?, ?, ?)').run(`g${endedAt}`, endedAt, '{}');
  db.prepare('INSERT INTO user_games (user_id, game_id, player_id, net_cents, won, ended_at) VALUES (?, ?, ?, ?, 0, ?)').run(id, `g${endedAt}`, 'p', net, endedAt);
}

describe('portefeuille : solde de départ et recharge différée', () => {
  it('5 000 jetons à l’inscription, aucune recharge programmée', async () => {
    const t = { now: 1_000 };
    const { accounts, id } = await ana(t);
    expect(accounts.wallet(id)).toMatchObject({ balance: 5_000, nextRefillAt: null });
    expect(accounts.canAfford(id, 1_000)).toBe(true);
    expect(accounts.canAfford(id, 0)).toBe(true);
  });

  it('les parties modifient le solde ; sous 1 000, recharge à 2 000 après 2 h, pas avant', async () => {
    const t = { now: 10_000 };
    const { accounts, id } = await ana(t);
    lose(accounts, id, -4_500, 20_000);
    t.now = 30_000;
    const w = accounts.wallet(id);
    expect(w.balance).toBe(500);
    expect(w.nextRefillAt).toBe(20_000 + WALLET_REFILL_DELAY_MS);
    expect(accounts.canAfford(id, 600)).toBe(false);
    t.now = 20_000 + 2 * HOUR - 1;
    expect(accounts.wallet(id).balance).toBe(500);
    t.now = 20_000 + 2 * HOUR;
    expect(accounts.wallet(id)).toMatchObject({ balance: 2_000, nextRefillAt: null });
    expect(accounts.canAfford(id, 1_000)).toBe(true);
  });

  it('pas de recharge au-dessus du seuil, même après longtemps', async () => {
    const t = { now: 10_000 };
    const { accounts, id } = await ana(t);
    lose(accounts, id, -3_000, 20_000);
    t.now += 10 * HOUR;
    expect(accounts.wallet(id).balance).toBe(2_000);
  });

  it('la recharge n’est appliquée qu’une fois', async () => {
    const t = { now: 10_000 };
    const { accounts, id } = await ana(t);
    lose(accounts, id, -4_900, 20_000);
    t.now = 20_000 + 3 * HOUR;
    expect(accounts.wallet(id).balance).toBe(2_000);
    expect(accounts.wallet(id).balance).toBe(2_000);
  });

  it('une table dont la mise dépasse le solde est refusée à la création et à l’arrivée', async () => {
    const t = { now: 10_000 };
    const { accounts, id } = await ana(t);
    lose(accounts, id, -4_500, 20_000);
    t.now = 30_000;
    const m = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: () => undefined, canAfford: (a, s) => accounts.canAfford(a, s) } });
    const ref = { id, nickname: 'Ana', avatar: null };
    expect(() => m.createRoom({ name: 'T', maxPlayers: 2, targetPoints: 1, stakeChips: 800, nickname: 'Ana' }, ref)).toThrowError(/Solde insuffisant/);
    const ok = m.createRoom({ name: 'T', maxPlayers: 2, targetPoints: 1, stakeChips: 400, nickname: 'Ana' }, ref);
    expect(ok.code).toBeTruthy();
    // Un invité n’est pas concerné
    expect(m.createRoom({ name: 'U', maxPlayers: 2, targetPoints: 1, stakeChips: 800, nickname: 'Invité' }).code).toBeTruthy();
  });
});
