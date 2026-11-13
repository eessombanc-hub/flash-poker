import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { tableCosmetics } from '../src/accounts/cosmetics';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { BlackjackService } from '../src/blackjack/service';
import { BlackjackTables } from '../src/blackjack/tables';
import type { BjTableDto } from '../src/blackjack/types';

describe('récompenses affichées à la table', () => {
  it('rien pour un invité ou un joueur sans récompense équipée ; le changement d’équipement est vu aussitôt', async () => {
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(false, () => undefined), { now: () => 1_000_000, log: () => undefined });
    const id = (await accounts.register({ nickname: 'Ana', email: 'a@x.fr', password: 'tapis-vert-42' })).account.id;
    expect(tableCosmetics(store.db, id)).toBeNull();
    expect(tableCosmetics(store.db, 'guest:' + 'a1'.repeat(16))).toBeNull();
    expect(tableCosmetics(store.db, null)).toBeNull();
    accounts.equip(id, { slot: 'title', id: 'title.novice' });
    expect(tableCosmetics(store.db, id)).toEqual({ title: 'title.novice', frame: null, emblem: null });
    accounts.equip(id, { slot: 'frame', id: 'frame.bronze' });
    expect(tableCosmetics(store.db, id)).toEqual({ title: 'title.novice', frame: 'frame.bronze', emblem: null });
    accounts.equip(id, { slot: 'title', id: null });
    accounts.equip(id, { slot: 'frame', id: null });
    expect(tableCosmetics(store.db, id)).toBeNull();
  });

  it('la vue d’une table de Blackjack porte les récompenses du joueur inscrit, et null pour les CPU et les invités', async () => {
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(false, () => undefined), { now: () => 1_000_000, log: () => undefined });
    const id = (await accounts.register({ nickname: 'Ana', email: 'a@x.fr', password: 'tapis-vert-42' })).account.id;
    accounts.equip(id, { slot: 'frame', id: 'frame.bronze' });
    const bj = new BlackjackService(store, { now: () => 1_000_000 });
    const tables = new BlackjackTables(store, bj, { now: () => 1_000_000 });
    const v = tables.create({ userId: id, nickname: 'Ana', avatar: null }, { table: 'decouverte', seats: ['human', 'cpu', 'human'] }) as BjTableDto;
    expect(v.seats[0]!.cosmetics).toEqual({ title: null, frame: 'frame.bronze', emblem: null });
    expect(v.seats[1]!.cosmetics).toBeNull();
    expect(v.seats[2]!.cosmetics).toBeNull();
  });
});
