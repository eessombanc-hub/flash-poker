import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Même accès à `node:sqlite` que `store.ts` (voir l'explication là-bas).
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Tables du Blackjack. `user_id` désigne un compte ou un invité (« guest:… ») : volontairement SANS clé étrangère
 * vers `users`, puisque le Blackjack se joue aussi sans compte.
 */
const BJ_SCHEMA = `
      CREATE TABLE IF NOT EXISTS bj_profile (
        user_id TEXT PRIMARY KEY,
        chips INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        rounds INTEGER NOT NULL DEFAULT 0,
        hands INTEGER NOT NULL DEFAULT 0,
        hands_won INTEGER NOT NULL DEFAULT 0,
        hands_lost INTEGER NOT NULL DEFAULT 0,
        hands_pushed INTEGER NOT NULL DEFAULT 0,
        blackjacks INTEGER NOT NULL DEFAULT 0,
        doubles_won INTEGER NOT NULL DEFAULT 0,
        splits_won INTEGER NOT NULL DEFAULT 0,
        net_chips INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        max_chips INTEGER NOT NULL,
        last_refill_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS bj_active (
        user_id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL,
        rules TEXT NOT NULL,
        bet INTEGER NOT NULL,
        seed TEXT NOT NULL,
        commitment TEXT NOT NULL,
        start_chips INTEGER NOT NULL,
        actions TEXT NOT NULL,
        started_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bj_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        table_id TEXT NOT NULL,
        bet INTEGER NOT NULL,
        net INTEGER NOT NULL,
        wagered INTEGER NOT NULL,
        seed TEXT NOT NULL,
        commitment TEXT NOT NULL,
        rules TEXT NOT NULL,
        actions TEXT NOT NULL,
        summary TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS bj_history_by_user ON bj_history (user_id, ended_at);
      CREATE TABLE IF NOT EXISTS bj_challenges (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        challenge_id TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, challenge_id)
      );
      CREATE TABLE IF NOT EXISTS bj_table (
        code TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bj_achievements (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (user_id, achievement_id)
      );
      CREATE TABLE IF NOT EXISTS tb_game (
        code TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tb_seat (
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        PRIMARY KEY (user_id, code)
      );
      CREATE TABLE IF NOT EXISTS tb_profile (
        user_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        rating INTEGER NOT NULL,
        peak INTEGER NOT NULL,
        games INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        sf_wins INTEGER NOT NULL DEFAULT 0,
        cols_won INTEGER NOT NULL DEFAULT 0,
        cols_played INTEGER NOT NULL DEFAULT 0,
        ranked_games INTEGER NOT NULL DEFAULT 0,
        ranked_wins INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, variant)
      );
      CREATE INDEX IF NOT EXISTS tb_profile_rating ON tb_profile (variant, rating);
      CREATE TABLE IF NOT EXISTS tb_queue (
        user_id TEXT PRIMARY KEY,
        variant TEXT NOT NULL,
        rating INTEGER NOT NULL,
        since INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tb_daily (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        challenge_id TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, challenge_id)
      );
`;
const BJ_TABLES = ['bj_profile', 'bj_active', 'bj_history', 'bj_challenges', 'bj_achievements'] as const;

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
    this.migrateBlackjack();
  }

  close(): void {
    this.db.close();
  }

  /** Crée les tables du Blackjack ; retire d'anciennes clés étrangères vers `users` (incompatibles avec les invités). */
  private migrateBlackjack(): void {
    this.db.exec(BJ_SCHEMA);
    const legacy = BJ_TABLES.filter((t) => this.db.prepare(`PRAGMA foreign_key_list(${t})`).all().length > 0);
    if (legacy.length === 0) return;
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      for (const t of legacy) this.db.exec(`ALTER TABLE ${t} RENAME TO ${t}_old`);
      this.db.exec(BJ_SCHEMA.replace(/CREATE INDEX IF NOT EXISTS/g, '-- '));
      for (const t of legacy) {
        this.db.exec(`INSERT INTO ${t} SELECT * FROM ${t}_old`);
        this.db.exec(`DROP TABLE ${t}_old`);
      }
      this.db.exec(BJ_SCHEMA);
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }
}
