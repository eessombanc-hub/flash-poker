import {
  ACHIEVEMENTS, analyze, applyAction, BJ_ACTIONS, BjError, challengeDelta, CHALLENGES, commitmentOf, dailyChallenges, extraStake, legalActions, levelFromXp, levelTitle, levelUpReward, newlyUnlocked, recommend,
  replayRound, resolveTable, roundFacts, roundView, startRound, TABLE_PRESETS, xpForRound, xpToReach,
  type Advice, type BjAction, type BjRound, type BjStats, type Odds, type TableRules,
} from '@poker/engine';
import { randomBytes } from 'node:crypto';
import type { AccountDb } from '../accounts/db';
import { ServerError } from '../errors';
import { logRank } from '../accounts/rankings';
import type { BjAchievement, BjActive, BjChallenge, BjHistoryItem, BjLeaderboardEntry, BjLeaderboardKind, BjOverview, BjProfile, BjResult } from './types';

type Row = Record<string, unknown>;

/** Jetons de Blackjack : virtuels, sans valeur monétaire, indépendants du portefeuille de poker. */
export const BJ_START_CHIPS = 1_000;
const REFILL_BELOW = 5;
const REFILL_TO = 500;
const REFILL_DELAY_MS = 30 * 60_000;
/** Une manche abandonnée plus de 12 h est conclue d'office (le joueur reste sur ses mains). */
const STALE_MS = 12 * 3_600_000;
const HISTORY_LIMIT = 20;

const parisDay = (t: number): string => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/**
 * Blackjack : le SERVEUR distribue. Il tire une graine, publie son empreinte (engagement) avant la manche, et la
 * révèle à la fin : le sabot en découle, le joueur peut donc vérifier que rien n'a changé en cours de manche.
 * L'état d'une manche en cours est reconstruit par rejeu (graine + actions) : reprise après interruption gratuite.
 */
export class BlackjackService {
  constructor(
    private readonly store: AccountDb,
    private readonly opts: { now?: () => number; seed?: () => string } = {},
  ) {}

  /** Renseigné par le service des tables partagées : vrai si le joueur est en pleine manche à une table. */
  busyCheck: (userId: string) => boolean = () => false;

  /** Solde et niveau du joueur (recharge gratuite comprise), pour s'asseoir à une table partagée. */
  playerInfo(userId: string): { chips: number; level: number } {
    const row = this.refill(userId, this.row(userId));
    return { chips: row.chips as number, level: levelFromXp(row.xp as number) };
  }
  hasActiveRound(userId: string): boolean {
    this.concludeStale(userId);
    return !!this.active(userId);
  }
  /** Fin d'une manche de table pour un joueur : mêmes jetons, XP, défis, objectifs et historique que la manche solo. */
  settleSeat(userId: string, rec: { startChips: number; table: string; bet: number; seed: string; commitment: string; rules: TableRules; actions: BjAction[] }, round: BjRound): BjResult {
    return this.finish(
      userId,
      { start_chips: rec.startChips, table_id: rec.table, bet: rec.bet, seed: rec.seed, commitment: rec.commitment, rules: JSON.stringify(rec.rules), actions: JSON.stringify(rec.actions) },
      round,
    );
  }

  private get db() {
    return this.store.db;
  }
  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }
  private newSeed(): string {
    return this.opts.seed ? this.opts.seed() : randomBytes(32).toString('hex');
  }

  // ---------- Profil ----------

  private row(userId: string): Row {
    this.db.prepare('INSERT OR IGNORE INTO bj_profile (user_id, chips, max_chips) VALUES (?, ?, ?)').run(userId, BJ_START_CHIPS, BJ_START_CHIPS);
    return this.db.prepare('SELECT * FROM bj_profile WHERE user_id = ?').get(userId) as Row;
  }

  private active(userId: string): Row | undefined {
    return this.db.prepare('SELECT * FROM bj_active WHERE user_id = ?').get(userId) as Row | undefined;
  }

  /** Recharge gratuite des jetons quand le solde est épuisé (jamais pendant une manche). */
  private refill(userId: string, row: Row): Row {
    const chips = row.chips as number;
    if (chips >= REFILL_BELOW || this.active(userId)) return row;
    if (this.now() < (row.last_refill_at as number) + REFILL_DELAY_MS) return row;
    this.db.prepare('UPDATE bj_profile SET chips = ?, last_refill_at = ?, max_chips = MAX(max_chips, ?) WHERE user_id = ?').run(REFILL_TO, this.now(), REFILL_TO, userId);
    return this.row(userId);
  }

  private profileOf(row: Row): BjProfile {
    const xp = row.xp as number;
    const level = levelFromXp(xp);
    const hands = row.hands as number;
    const chips = row.chips as number;
    return {
      chips,
      xp,
      level,
      title: levelTitle(level),
      xpIntoLevel: xp - xpToReach(level),
      xpForNext: xpToReach(level + 1) - xpToReach(level),
      rounds: row.rounds as number,
      hands,
      handsWon: row.hands_won as number,
      handsLost: row.hands_lost as number,
      handsPushed: row.hands_pushed as number,
      blackjacks: row.blackjacks as number,
      doublesWon: row.doubles_won as number,
      splitsWon: row.splits_won as number,
      netChips: row.net_chips as number,
      streak: row.streak as number,
      bestStreak: row.best_streak as number,
      maxChips: row.max_chips as number,
      winRate: hands > 0 ? (row.hands_won as number) / hands : 0,
      refillAt: chips < REFILL_BELOW ? (row.last_refill_at as number) + REFILL_DELAY_MS : null,
    };
  }

  private statsOf(row: Row): BjStats {
    return {
      rounds: row.rounds as number,
      hands: row.hands as number,
      handsWon: row.hands_won as number,
      handsLost: row.hands_lost as number,
      handsPushed: row.hands_pushed as number,
      blackjacks: row.blackjacks as number,
      doublesWon: row.doubles_won as number,
      splitsWon: row.splits_won as number,
      netChips: row.net_chips as number,
      bestStreak: row.best_streak as number,
      streak: row.streak as number,
      maxChips: row.max_chips as number,
      level: levelFromXp(row.xp as number),
    };
  }

  // ---------- Défis et objectifs ----------

  private todaysChallenges(userId: string): BjChallenge[] {
    const day = parisDay(this.now());
    const defs = dailyChallenges(userId, day);
    for (const d of defs) this.db.prepare('INSERT OR IGNORE INTO bj_challenges (user_id, day, challenge_id) VALUES (?, ?, ?)').run(userId, day, d.id);
    const rows = this.db.prepare('SELECT challenge_id, progress, done FROM bj_challenges WHERE user_id = ? AND day = ?').all(userId, day) as Row[];
    return defs.map((d) => {
      const r = rows.find((x) => x.challenge_id === d.id)!;
      return { id: d.id, label: d.label, goal: d.goal, progress: Math.min(r.progress as number, d.goal), done: r.done === 1, rewardChips: d.rewardChips, rewardXp: d.rewardXp };
    });
  }

  private achievementsOf(userId: string): BjAchievement[] {
    const rows = this.db.prepare('SELECT achievement_id, at FROM bj_achievements WHERE user_id = ?').all(userId) as Row[];
    return ACHIEVEMENTS.map((a) => ({ id: a.id, label: a.label, description: a.description, rewardChips: a.rewardChips, unlockedAt: (rows.find((r) => r.achievement_id === a.id)?.at as number | undefined) ?? null }));
  }

  // ---------- Lecture ----------

  overview(userId: string): BjOverview {
    this.concludeStale(userId);
    const row = this.refill(userId, this.row(userId));
    return {
      profile: this.profileOf(row),
      tables: [...TABLE_PRESETS],
      challenges: this.todaysChallenges(userId),
      achievements: this.achievementsOf(userId),
      active: this.activeDto(userId),
      history: this.history(userId),
    };
  }

  history(userId: string, limit = HISTORY_LIMIT): BjHistoryItem[] {
    const rows = this.db.prepare('SELECT * FROM bj_history WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as Row[];
    return rows.map((r) => {
      const s = JSON.parse(r.summary as string) as { dealer: string[]; hands: BjHistoryItem['hands'] };
      return {
        id: r.id as number,
        endedAt: r.ended_at as number,
        table: r.table_id as string,
        decks: (JSON.parse(r.rules as string) as TableRules).decks,
        bet: r.bet as number,
        net: r.net as number,
        wagered: r.wagered as number,
        dealer: s.dealer,
        hands: s.hands,
        seed: r.seed as string,
        commitment: r.commitment as string,
      };
    });
  }

  private load(a: Row): { rules: TableRules; round: BjRound; actions: BjAction[] } {
    const rules = JSON.parse(a.rules as string) as TableRules;
    const actions = JSON.parse(a.actions as string) as BjAction[];
    return { rules, actions, round: replayRound(rules, a.bet as number, a.seed as string, actions, a.start_chips as number) };
  }

  private activeDto(userId: string): BjActive | null {
    const a = this.active(userId);
    if (!a) return null;
    const { rules, round } = this.load(a);
    const free = (a.start_chips as number) - round.wagered;
    return { table: a.table_id as string, rules, bet: a.bet as number, round: roundView(round), legal: legalActions(round, free), commitment: a.commitment as string, startedAt: a.started_at as number, freeChips: free };
  }

  // ---------- Jouer ----------

  startRound(userId: string, input: { table: string; rules?: TableRules; bet: number }): { active: BjActive; result: BjResult | null } {
    this.concludeStale(userId);
    if (this.active(userId)) throw new ServerError('WRONG_STATE', 'Une manche est déjà en cours. Reprenez-la');
    if (this.busyCheck(userId)) throw new ServerError('WRONG_STATE', 'Vous êtes en pleine manche à une table partagée');
    const table = resolveTable(input.table, input.rules);
    if (!table) throw new ServerError('BAD_REQUEST', 'Table ou règles invalides');
    const row = this.refill(userId, this.row(userId));
    const level = levelFromXp(row.xp as number);
    if (level < table.minLevel) throw new ServerError('RULE', `Cette table demande le niveau ${table.minLevel}`);
    const bet = input.bet;
    if (!Number.isInteger(bet) || bet < table.limits.minBet || bet > table.limits.maxBet) throw new ServerError('RULE', `Mise de ${table.limits.minBet} à ${table.limits.maxBet} jetons`);
    const chips = row.chips as number;
    if (bet > chips) throw new ServerError('RULE', 'Jetons insuffisants pour cette mise');
    const seed = this.newSeed();
    const commitment = commitmentOf(seed);
    this.db
      .prepare('INSERT INTO bj_active (user_id, table_id, rules, bet, seed, commitment, start_chips, actions, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, input.table, JSON.stringify(table.rules), bet, seed, commitment, chips, '[]', this.now());
    // Blackjack naturel (ou du croupier) : la manche est résolue dès la distribution.
    const round = startRound(table.rules, bet, seed);
    if (round.phase === 'DONE') {
      const result = this.finish(userId, this.active(userId)!, round);
      return { active: this.finishedDto(input.table, table.rules, bet, round, commitment, chips), result };
    }
    return { active: this.activeDto(userId)!, result: null };
  }

  act(userId: string, action: BjAction): { active: BjActive; result: BjResult | null } {
    this.concludeStale(userId);
    if (!BJ_ACTIONS.includes(action)) throw new ServerError('BAD_REQUEST', 'Action inconnue');
    const a = this.active(userId);
    if (!a) throw new ServerError('WRONG_STATE', 'Aucune manche en cours');
    const { rules, round, actions } = this.load(a);
    let next: BjRound;
    try {
      next = applyAction(round, action, (a.start_chips as number) - round.wagered);
    } catch (e) {
      if (e instanceof BjError) throw new ServerError('RULE', e.message);
      throw e;
    }
    const all = [...actions, action];
    this.db.prepare('UPDATE bj_active SET actions = ? WHERE user_id = ?').run(JSON.stringify(all), userId);
    if (next.phase === 'DONE') {
      const result = this.finish(userId, { ...a, actions: JSON.stringify(all) }, next);
      return { active: this.finishedDto(a.table_id as string, rules, a.bet as number, next, a.commitment as string, a.start_chips as number), result };
    }
    return { active: this.activeDto(userId)!, result: null };
  }

  /** Conseil de stratégie et probabilités : uniquement à la demande du joueur (niveaux pédagogiques). */
  help(userId: string): { advice: Advice | null; odds: Odds } {
    const a = this.active(userId);
    if (!a) throw new ServerError('WRONG_STATE', 'Aucune manche en cours');
    const { round } = this.load(a);
    if (round.phase !== 'PLAYER') throw new ServerError('WRONG_STATE', 'La manche est terminée');
    return { advice: recommend(round, (a.start_chips as number) - round.wagered), odds: analyze(round) };
  }

  private finishedDto(table: string, rules: TableRules, bet: number, round: BjRound, commitment: string, startChips: number): BjActive {
    return { table, rules, bet, round: roundView(round), legal: [], commitment, startedAt: this.now(), freeChips: startChips - round.wagered + round.net + round.wagered };
  }

  /** Une manche oubliée depuis trop longtemps est conclue : le joueur reste sur toutes ses mains. */
  private concludeStale(userId: string): void {
    const a = this.active(userId);
    if (!a || this.now() - (a.started_at as number) < STALE_MS) return;
    let { round } = this.load(a);
    const actions = JSON.parse(a.actions as string) as BjAction[];
    let guard = 0;
    while (round.phase === 'PLAYER' && guard++ < 20) {
      round = applyAction(round, 'STAND');
      actions.push('STAND');
    }
    this.finish(userId, { ...a, actions: JSON.stringify(actions) }, round);
  }

  // ---------- Fin de manche : jetons, XP, niveaux, défis, objectifs, historique ----------

  private finish(userId: string, a: Row, round: BjRound): BjResult {
    const facts = roundFacts(round);
    const row = this.row(userId);
    const levelBefore = levelFromXp(row.xp as number);
    let xp = (row.xp as number) + xpForRound(facts);
    let chips = (a.start_chips as number) + round.net;
    const stats = {
      rounds: (row.rounds as number) + 1,
      hands: (row.hands as number) + facts.hands,
      hands_won: (row.hands_won as number) + facts.handsWon,
      hands_lost: (row.hands_lost as number) + facts.handsLost,
      hands_pushed: (row.hands_pushed as number) + facts.handsPushed,
      blackjacks: (row.blackjacks as number) + facts.blackjacks,
      doubles_won: (row.doubles_won as number) + facts.doublesWon,
      splits_won: (row.splits_won as number) + facts.splitsWon,
      net_chips: (row.net_chips as number) + round.net,
      streak: facts.won ? (row.streak as number) + 1 : facts.lost ? 0 : (row.streak as number),
    };
    let bestStreak = Math.max(row.best_streak as number, stats.streak);

    // Défis du jour
    const doneNow: BjChallenge[] = [];
    const day = parisDay(this.now());
    for (const c of this.todaysChallenges(userId)) {
      if (c.done) continue;
      const def = CHALLENGES.find((d) => d.id === c.id)!;
      const progress = Math.max(0, c.progress + challengeDelta(def.metric, facts));
      const done = progress >= def.goal;
      this.db.prepare('UPDATE bj_challenges SET progress = ?, done = ? WHERE user_id = ? AND day = ? AND challenge_id = ?').run(progress, done ? 1 : 0, userId, day, c.id);
      if (done) {
        chips += def.rewardChips;
        xp += def.rewardXp;
        doneNow.push({ ...c, progress: def.goal, done: true });
      }
    }

    // Niveaux : récompense de jetons à chaque niveau franchi
    const levelAfter = levelFromXp(xp);
    let reward = 0;
    for (let l = levelBefore + 1; l <= levelAfter; l++) reward += levelUpReward(l);
    chips += reward;

    // Objectifs (une passe peut en débloquer d'autres via les jetons gagnés : on boucle brièvement)
    const unlocked: BjAchievement[] = [];
    const have = new Set((this.db.prepare('SELECT achievement_id FROM bj_achievements WHERE user_id = ?').all(userId) as Row[]).map((r) => r.achievement_id as string));
    let maxChips = Math.max(row.max_chips as number, chips);
    for (let pass = 0; pass < 3; pass++) {
      const fresh = newlyUnlocked(
        { rounds: stats.rounds, hands: stats.hands, handsWon: stats.hands_won, handsLost: stats.hands_lost, handsPushed: stats.hands_pushed, blackjacks: stats.blackjacks, doublesWon: stats.doubles_won, splitsWon: stats.splits_won, netChips: stats.net_chips, bestStreak, streak: stats.streak, maxChips, level: levelAfter },
        have,
      );
      if (fresh.length === 0) break;
      for (const f of fresh) {
        have.add(f.id);
        chips += f.rewardChips;
        maxChips = Math.max(maxChips, chips);
        this.db.prepare('INSERT OR IGNORE INTO bj_achievements (user_id, achievement_id, at) VALUES (?, ?, ?)').run(userId, f.id, this.now());
        unlocked.push({ id: f.id, label: f.label, description: f.description, rewardChips: f.rewardChips, unlockedAt: this.now() });
      }
    }
    bestStreak = Math.max(bestStreak, stats.streak);

    this.db
      .prepare(
        'UPDATE bj_profile SET chips = ?, xp = ?, rounds = ?, hands = ?, hands_won = ?, hands_lost = ?, hands_pushed = ?, blackjacks = ?, doubles_won = ?, splits_won = ?, net_chips = ?, streak = ?, best_streak = ?, max_chips = ? WHERE user_id = ?',
      )
      .run(chips, xp, stats.rounds, stats.hands, stats.hands_won, stats.hands_lost, stats.hands_pushed, stats.blackjacks, stats.doubles_won, stats.splits_won, stats.net_chips, stats.streak, bestStreak, maxChips, userId);

    const logged = this.db
      .prepare('INSERT INTO bj_history (user_id, ended_at, table_id, bet, net, wagered, seed, commitment, rules, actions, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        userId, this.now(), a.table_id as string, a.bet as number, round.net, round.wagered, a.seed as string, a.commitment as string, a.rules as string, a.actions as string,
        JSON.stringify({ dealer: round.dealer, hands: round.hands.map((h) => ({ cards: h.cards, bet: h.bet, result: h.result, net: h.net })) }),
      );
    logRank(this.db, { userId, game: 'blackjack', ref: `bj:${logged.lastInsertRowid}`, endedAt: this.now(), played: 1, won: round.net > 0 ? 1 : 0, score: round.net });
    this.db.prepare('DELETE FROM bj_active WHERE user_id = ?').run(userId);

    return {
      net: round.net,
      xpGained: xp - (row.xp as number),
      level: levelAfter > levelBefore ? { from: levelBefore, to: levelAfter, reward } : null,
      challengesDone: doneNow,
      achievements: unlocked,
      seed: a.seed as string,
      commitment: a.commitment as string,
    };
  }

  // ---------- Progression commune avec le poker ----------

  /** Le poker alimente la même XP : 40 par partie jouée, 60 de plus pour le vainqueur. */
  awardXp(userId: string, amount: number): void {
    if (amount <= 0) return;
    this.row(userId);
    const before = levelFromXp((this.db.prepare('SELECT xp FROM bj_profile WHERE user_id = ?').get(userId) as Row).xp as number);
    this.db.prepare('UPDATE bj_profile SET xp = xp + ? WHERE user_id = ?').run(amount, userId);
    const after = levelFromXp((this.db.prepare('SELECT xp FROM bj_profile WHERE user_id = ?').get(userId) as Row).xp as number);
    let reward = 0;
    for (let l = before + 1; l <= after; l++) reward += levelUpReward(l);
    if (reward > 0) this.db.prepare('UPDATE bj_profile SET chips = chips + ?, max_chips = MAX(max_chips, chips + ?) WHERE user_id = ?').run(reward, reward, userId);
  }

  // ---------- Classement ----------

  leaderboard(kind: BjLeaderboardKind, limit = 20): BjLeaderboardEntry[] {
    const order = kind === 'chips' ? 'p.max_chips DESC, p.xp DESC' : 'p.xp DESC, p.max_chips DESC';
    const rows = this.db
      .prepare(`SELECT u.nickname, u.avatar, p.xp, p.chips, p.rounds, p.hands, p.hands_won FROM bj_profile p JOIN users u ON u.id = p.user_id WHERE p.rounds > 0 OR p.xp > 0 ORDER BY ${order} LIMIT ?`)
      .all(limit) as Row[];
    return rows.map((r, i) => {
      const level = levelFromXp(r.xp as number);
      return { rank: i + 1, nickname: r.nickname as string, avatar: (r.avatar as string | null) ?? null, level, title: levelTitle(level), xp: r.xp as number, chips: r.chips as number, rounds: r.rounds as number, winRate: (r.hands as number) > 0 ? (r.hands_won as number) / (r.hands as number) : 0 };
    });
  }

  /** Mise supplémentaire que demanderait la main active (information pour l'interface). */
  extra(round: BjRound): number {
    return extraStake(round);
  }
}
