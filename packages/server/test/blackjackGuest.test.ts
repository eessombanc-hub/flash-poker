import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { BlackjackService } from '../src/blackjack/service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('Blackjack : invités', () => {
  it('un invité a son profil, sans compte', () => {
    const bj = new BlackjackService(new AccountDb(':memory:'));
    const g = `guest:${'ab'.repeat(16)}`;
    expect(bj.overview(g).profile.chips).toBe(1000);
    const { active } = bj.startRound(g, { table: 'decouverte', bet: 50 });
    expect(active.bet).toBe(50);
    expect(bj.leaderboard('xp')).toEqual([]); // les invités n'apparaissent pas au classement
  });

  it('ancienne base avec clés étrangères : migrée sans perdre les données', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bj-'));
    const file = join(dir, 'accounts.sqlite');
    try {
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, nickname TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, avatar TEXT, notify_email INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
        CREATE TABLE bj_profile (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, chips INTEGER NOT NULL, xp INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0, hands INTEGER NOT NULL DEFAULT 0, hands_won INTEGER NOT NULL DEFAULT 0, hands_lost INTEGER NOT NULL DEFAULT 0, hands_pushed INTEGER NOT NULL DEFAULT 0, blackjacks INTEGER NOT NULL DEFAULT 0, doubles_won INTEGER NOT NULL DEFAULT 0, splits_won INTEGER NOT NULL DEFAULT 0, net_chips INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, max_chips INTEGER NOT NULL, last_refill_at INTEGER NOT NULL DEFAULT 0);
        INSERT INTO users VALUES ('u1','Ana','a@x.fr','h',NULL,1,1);
        INSERT INTO bj_profile (user_id, chips, xp, max_chips) VALUES ('u1', 777, 40, 1200);`);
      old.close();
      const store = new AccountDb(file);
      const bj = new BlackjackService(store);
      expect(bj.overview('u1').profile).toMatchObject({ chips: 777, xp: 40, maxChips: 1200 });
      expect(bj.overview(`guest:${'cd'.repeat(16)}`).profile.chips).toBe(1000);
      store.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
