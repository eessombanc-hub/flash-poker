import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Même accès à `node:sqlite` que `store.ts` (voir l'explication là-bas).
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Base des comptes joueurs (fichier SQLite, ou `:memory:` en test) : comptes, sessions, jetons de
 * réinitialisation, parties terminées, favoris. Aucune donnée de carte d'une partie en cours n'y figure :
 * seules les parties terminées (faits devenus publics) y sont archivées.
 */
export class AccountDb {
  readonly db: DatabaseSyncType;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT NOT NULL,
        avatar TEXT,
        notify_email INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        ended_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_games (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        net_cents INTEGER NOT NULL,
        won INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, game_id)
      );
      CREATE INDEX IF NOT EXISTS user_games_by_date ON user_games (user_id, ended_at);
      CREATE TABLE IF NOT EXISTS fav_rounds (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        round_no INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, game_id, round_no)
      );
      CREATE TABLE IF NOT EXISTS fav_players (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fav_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, fav_id)
      );
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT COLLATE NOCASE,
        created_at INTEGER NOT NULL,
        accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        accepted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS invites_by_inviter ON invites (inviter_id, created_at);
      CREATE TABLE IF NOT EXISTS referrals (
        invitee_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_refills (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        PRIMARY KEY (user_id, at)
      );
      CREATE TABLE IF NOT EXISTS notify_log (
        user_id TEXT NOT NULL,
        fav_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (user_id, fav_id, day)
      );
    `);
  }

  close(): void {
    this.db.close();
  }
}
