import {
  tbClampRating, tbDailyChallenges, tbDayKey, tbEloDelta, tbIsRated, tbLeagueOf, TB_CHALLENGE_XP, TB_CPU_RATING, TB_PLACEMENT_GAMES, TB_START_RATING,
  type TableauVariant, type TbGameFacts, type TbLeagueStanding,
} from '@poker/engine';
import type { AccountDb } from '../accounts/db';

/**
 * Statistiques, classement et défis du Tableau. Réservé aux comptes : les invités n'ont ni profil ni classement.
 * Le classement ne dépend que des résultats ; les défis ne rapportent qu'un peu d'expérience (profil commun).
 */
export interface TbProfileDto {
  variant: TableauVariant;
  rating: number;
  peak: number;
  standing: TbLeagueStanding;
  /** Position au classement de la variante (null tant qu'aucune partie classée n'a été jouée). */
  position: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  sfWins: number;
  colsWon: number;
  colsPlayed: number;
  rankedGames: number;
  rankedWins: number;
  /** Classement provisoire : moins de 10 parties classées (comme aux échecs, il bouge plus vite). */
  provisional: boolean;
  /** Les trois défis du jour. */
  day: string;
  challenges: { id: string; label: string; goal: number; progress: number; done: boolean }[];
}
export interface TbLeaderboardRow {
  position: number;
  nickname: string;
  avatar: string | null;
  rating: number;
  leagueId: number;
  rankedGames: number;
  provisional: boolean;
  you: boolean;
}
export interface TbRatingChange {
  before: number;
  after: number;
  delta: number;
  /** Ligues (1 à 10) avant et après la partie. */
  leagueBefore: number;
  leagueAfter: number;
}

type Row = Record<string, unknown>;

export class TableauStats {
  constructor(
    private readonly store: AccountDb,
    private readonly now: () => number,
    private readonly awardXp: ((userId: string, amount: number) => void) | null,
  ) {}

  private get db() {
    return this.store.db;
  }

  static eligible(userId: string): boolean {
    return !userId.startsWith('guest:');
  }

  private row(userId: string, variant: TableauVariant): Row {
    this.db.prepare('INSERT OR IGNORE INTO tb_profile (user_id, variant, rating, peak) VALUES (?, ?, ?, ?)').run(userId, variant, TB_START_RATING, TB_START_RATING);
    return this.db.prepare('SELECT * FROM tb_profile WHERE user_id = ? AND variant = ?').get(userId, variant) as Row;
  }

  /** Enregistre une partie terminée. Renvoie la variation de classement pour une partie classée. */
  record(userId: string, f: TbGameFacts): TbRatingChange | null {
    if (!TableauStats.eligible(userId)) return null;
    const r = this.row(userId, f.variant);
    const num = (k: string) => r[k] as number;
    const wins = num('wins') + (f.outcome === 'win' ? 1 : 0);
    const losses = num('losses') + (f.outcome === 'loss' ? 1 : 0);
    const draws = num('draws') + (f.outcome === 'draw' ? 1 : 0);
    const streak = f.outcome === 'win' ? num('streak') + 1 : 0;
    let rating = num('rating');
    let change: TbRatingChange | null = null;
    const oppRating = f.opponentRating ?? (f.opponentLevel ? TB_CPU_RATING[f.opponentLevel] : null);
    if (tbIsRated(f.mode) && oppRating !== null) {
      const delta = tbEloDelta(rating, oppRating, f.outcome, num('ranked_games'));
      const after = tbClampRating(rating + delta);
      change = { before: rating, after, delta: after - rating, leagueBefore: tbLeagueOf(rating).league.id, leagueAfter: tbLeagueOf(after).league.id };
      rating = after;
    }
    this.db.prepare(
      `UPDATE tb_profile SET rating = ?, peak = ?, games = games + 1, wins = ?, losses = ?, draws = ?, streak = ?, best_streak = ?, sf_wins = sf_wins + ?,
         cols_won = cols_won + ?, cols_played = cols_played + ?, ranked_games = ranked_games + ?, ranked_wins = ranked_wins + ? WHERE user_id = ? AND variant = ?`,
    ).run(
      rating, Math.max(num('peak'), rating), wins, losses, draws, streak, Math.max(num('best_streak'), streak), f.straightFlushWin && f.outcome === 'win' ? 1 : 0,
      f.columnsWon, f.columnsPlayed, tbIsRated(f.mode) ? 1 : 0, tbIsRated(f.mode) && f.outcome === 'win' && !f.forfeit ? 1 : 0, userId, f.variant,
    );
    this.progress(userId, f);
    return change;
  }

  private progress(userId: string, f: TbGameFacts): void {
    const day = tbDayKey(this.now());
    for (const c of tbDailyChallenges(day)) {
      this.db.prepare('INSERT OR IGNORE INTO tb_daily (user_id, day, challenge_id) VALUES (?, ?, ?)').run(userId, day, c.id);
      const cur = this.db.prepare('SELECT progress, done FROM tb_daily WHERE user_id = ? AND day = ? AND challenge_id = ?').get(userId, day, c.id) as Row;
      if (cur.done) continue;
      const progress = Math.min(c.goal, (cur.progress as number) + Math.max(0, c.gain(f)));
      const done = progress >= c.goal;
      this.db.prepare('UPDATE tb_daily SET progress = ?, done = ? WHERE user_id = ? AND day = ? AND challenge_id = ?').run(progress, done ? 1 : 0, userId, day, c.id);
      if (done) this.awardXp?.(userId, TB_CHALLENGE_XP);
    }
  }

  /** Classement courant sans créer de profil (départ si le joueur n'a encore rien joué). */
  ratingOf(userId: string, variant: TableauVariant): number {
    if (!TableauStats.eligible(userId)) return TB_START_RATING;
    const r = this.db.prepare('SELECT rating FROM tb_profile WHERE user_id = ? AND variant = ?').get(userId, variant) as Row | undefined;
    return (r?.rating as number | undefined) ?? TB_START_RATING;
  }

  position(userId: string, variant: TableauVariant): number | null {
    const me = this.db.prepare('SELECT rating FROM tb_profile WHERE user_id = ? AND variant = ? AND ranked_games > 0').get(userId, variant) as Row | undefined;
    if (!me) return null;
    const better = this.db.prepare('SELECT COUNT(*) AS n FROM tb_profile WHERE variant = ? AND ranked_games > 0 AND rating > ?').get(variant, me.rating as number) as Row;
    return (better.n as number) + 1;
  }

  profile(userId: string, variant: TableauVariant): TbProfileDto {
    const r = this.row(userId, variant);
    const day = tbDayKey(this.now());
    const stored = this.db.prepare('SELECT challenge_id, progress, done FROM tb_daily WHERE user_id = ? AND day = ?').all(userId, day) as Row[];
    const n = (k: string) => r[k] as number;
    return {
      variant, rating: n('rating'), peak: n('peak'), standing: tbLeagueOf(n('rating')), position: this.position(userId, variant),
      games: n('games'), wins: n('wins'), losses: n('losses'), draws: n('draws'), streak: n('streak'), bestStreak: n('best_streak'),
      sfWins: n('sf_wins'), colsWon: n('cols_won'), colsPlayed: n('cols_played'), rankedGames: n('ranked_games'), rankedWins: n('ranked_wins'), provisional: n('ranked_games') < TB_PLACEMENT_GAMES,
      day,
      challenges: tbDailyChallenges(day).map((c) => {
        const s = stored.find((x) => x.challenge_id === c.id);
        return { id: c.id, label: c.label, goal: c.goal, progress: (s?.progress as number) ?? 0, done: !!s?.done };
      }),
    };
  }

  leaderboard(variant: TableauVariant, userId: string | null, limit = 20): TbLeaderboardRow[] {
    const rows = this.db.prepare(
      `SELECT p.user_id, p.rating, p.ranked_games, u.nickname, u.avatar FROM tb_profile p JOIN users u ON u.id = p.user_id
       WHERE p.variant = ? AND p.ranked_games > 0 ORDER BY p.rating DESC, p.ranked_games DESC, u.nickname LIMIT ?`,
    ).all(variant, limit) as Row[];
    return rows.map((r, i) => ({
      position: i + 1, nickname: r.nickname as string, avatar: (r.avatar as string | null) ?? null, rating: r.rating as number,
      leagueId: tbLeagueOf(r.rating as number).league.id, rankedGames: r.ranked_games as number, provisional: (r.ranked_games as number) < TB_PLACEMENT_GAMES, you: r.user_id === userId,
    }));
  }
}
