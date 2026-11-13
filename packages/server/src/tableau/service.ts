import { randomBytes } from 'node:crypto';
import {
  adviseColumn, AI_LEVELS, chooseMove, TABLEAU_VARIANTS, compareColumns, CryptoRng, describePartial, evaluateColumn, TableauError, TableauGame, tableauCommitment, tbCanPair, thinkDelayMs, tbIsRated, TURN_MS,
  type AiLevel, type TableauVariant, type ColumnHand, type Placement, type Rng, type Seat, type TableauResult, type TableauView,
} from '@poker/engine';
import type { AccountDb } from '../accounts/db';
import { ServerError } from '../errors';
import { tableCosmetics } from '../accounts/cosmetics';
import { TableauStats, type TbLeaderboardRow, type TbProfileDto, type TbRatingChange } from './stats';
import type { BlackjackService } from '../blackjack/service';

/**
 * LE TABLEAU — parties Entraînement (contre l'IA) et Amical (privé, entre deux joueurs, par code).
 * Tout est décidé par le serveur : mélange, tours, délais de 30 s, placements automatiques. L'état est conservé en base
 * (graine + journal des coups) : il se reconstruit exactement après un redémarrage ou une déconnexion.
 * Aucun minuteur : chaque requête fait d'abord avancer l'horloge de la partie (« à la demande »).
 */
export const GRACE_MS = 1_500; // tolérance réseau après les 30 s affichées
export const MAX_IDLE_TURNS = 3; // timeouts consécutifs avant abandon (amical) ou pause (entraînement)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WAITING_TTL_MS = 3_600_000;
/** Attente maximale dans la file du duel classé. */
export const QUEUE_TTL_MS = 180_000;
const STALE_MS = 24 * 3_600_000;

export type TbMode = 'training' | 'friendly' | 'ranked' | 'duel';
export type TbStatus = 'waiting' | 'playing' | 'finished';

interface Player {
  kind: 'human' | 'cpu';
  userId: string | null;
  nickname: string;
  avatar: string | null;
  level: AiLevel | null;
  idle: number; // timeouts consécutifs
}
interface Room {
  code: string;
  mode: TbMode;
  /** Variante : classique, ou « Tableau 5 cartes » (main de 5 cartes). Absent = classique (anciennes parties). */
  variant?: TableauVariant;
  /** Partie amicale ouverte : visible dans la liste « Parties ouvertes » tant qu'elle attend un adversaire. */
  public?: boolean;
  seed: string;
  commitment: string;
  seats: [Player, Player | null];
  status: TbStatus;
  log: { seat: Seat; col: number; auto: boolean; card?: string }[];
  turnSince: number;
  /** Délai de réflexion de l'IA pour le coup en cours. */
  cpuDelay: number;
  paused: boolean;
  forfeit: Seat | null;
  createdAt: number;
  finishedAt: number | null;
  version: number;
  updatedAt: number;
  xpDone: boolean;
  /** Statistiques déjà enregistrées (une seule fois par partie). */
  statsDone?: boolean;
  /** Variation de classement par siège d'une partie classée terminée (classé et duel). */
  ratings?: (TbRatingChange | null)[];
  /** Ancien format (une seule variation, siège 0). */
  rating?: TbRatingChange | null;
}

export interface TbPlayerDto {
  nickname: string;
  avatar: string | null;
  /** Titre, cadre et emblème équipés, absents quand le joueur ne porte rien. */
  cosmetics: import('../accounts/cosmetics').Equipped | null;
  kind: 'human' | 'cpu';
  level: AiLevel | null;
  /** Classement du joueur dans la variante, pour les modes classés (comme l'affichage d'une partie d'échecs). */
  rating: number | null;
  you: boolean;
}
export interface TbGameDto {
  code: string;
  mode: TbMode;
  variant: TableauVariant;
  status: TbStatus;
  version: number;
  serverNow: number;
  you: Seat;
  players: (TbPlayerDto | null)[];
  commitment: string;
  view: TableauView | null;
  /** Libellé de chaque colonne (« Paire de rois », « 3 cartes proches : quinte possible »…), par siège. */
  labels: [string[], string[]] | null;
  /** Combinaison de chaque colonne COMPLÈTE (cartes qui la forment), par siège ; null tant que la colonne n'est pas pleine. */
  made: [(ColumnHand | null)[], (ColumnHand | null)[]] | null;
  /** Verdict des colonnes dont les deux côtés sont complets : siège gagnant, 'tie' pour une égalité, null si non tranchée. */
  verdicts: (Seat | 'tie' | null)[] | null;
  turnMs: number;
  /** Échéance affichée du tour en cours (epoch ms), null si aucune. */
  deadline: number | null;
  paused: boolean;
  lastMove: Placement | null;
  result: TableauResult | null;
  forfeit: Seat | null;
  winner: Seat | null;
  /** Partie classée terminée : classement avant, après et variation (pour le siège de l'appelant). */
  rating: TbRatingChange | null;
  reveal: { seed: string; commitment: string; order: string[] } | null;
}
export interface TbQueueDto {
  status: 'idle' | 'waiting' | 'matched' | 'expired';
  /** Code de la partie une fois l'adversaire trouvé. */
  code: string | null;
  variant: TableauVariant;
  waitedMs: number;
}
export interface TbHistoryEntry {
  code: string;
  mode: TbMode;
  variant: TableauVariant;
  at: number;
  opponent: string;
  opponentLevel: AiLevel | null;
  score: [number, number];
  /** 'win' | 'loss' | 'draw' du point de vue du joueur. */
  outcome: 'win' | 'loss' | 'draw';
  forfeit: boolean;
  /** Partie arrêtée par une quinte flush (victoire immédiate). */
  straightFlush: boolean;
}

type Who = { userId: string; nickname: string; avatar: string | null };
const rule = (m: string, ruleCode?: string): ServerError => new ServerError('RULE', m, ruleCode);

export class TableauService {
  private readonly cache = new Map<string, { room: Room; game: TableauGame }>();
  private readonly rng: Rng;
  private readonly stats: TableauStats;

  constructor(
    private readonly store: AccountDb,
    private readonly bj: BlackjackService | null,
    private readonly opts: { now?: () => number; seed?: () => string; rng?: Rng; aiSims?: number; aiBudgetMs?: number; /** Délai de réflexion imposé à l'IA (tests) ; sinon propre à chaque niveau. */ cpuDelayMs?: number } = {},
  ) {
    this.rng = opts.rng ?? new CryptoRng();
    this.stats = new TableauStats(store, () => this.now(), bj ? (u, n) => bj.awardXp(u, n) : null);
  }

  private get db() {
    return this.store.db;
  }
  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  // ---------- Persistance ----------

  private save(room: Room): void {
    room.version++;
    room.updatedAt = this.now();
    this.db.prepare('INSERT INTO tb_game (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(room.code, JSON.stringify(room), room.updatedAt);
  }
  private index(userId: string, code: string): void {
    this.db.prepare('INSERT OR IGNORE INTO tb_seat (user_id, code) VALUES (?, ?)').run(userId, code);
  }
  private drop(code: string): void {
    this.cache.delete(code);
    this.db.prepare('DELETE FROM tb_game WHERE code = ?').run(code);
    this.db.prepare('DELETE FROM tb_seat WHERE code = ?').run(code);
  }
  private load(codeRaw: string): { room: Room; game: TableauGame } {
    const code = codeRaw.trim().toUpperCase();
    let e = this.cache.get(code);
    if (!e) {
      const row = this.db.prepare('SELECT data FROM tb_game WHERE code = ?').get(code) as { data: string } | undefined;
      if (!row) throw new ServerError('NOT_FOUND', 'Partie introuvable');
      const room = JSON.parse(row.data) as Room;
      e = { room, game: TableauGame.replay(room.seed, room.log, room.variant ?? 'classic') };
      this.cache.set(code, e);
    }
    return e;
  }

  private newCode(): string {
    for (;;) {
      let c = 'TB-';
      const b = randomBytes(4);
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[b[i]! % CODE_ALPHABET.length];
      if (!this.db.prepare('SELECT 1 FROM tb_game WHERE code = ?').get(c)) return c;
    }
  }

  private sweep(): void {
    const t = this.now();
    const rows = this.db.prepare('SELECT code, data, updated_at FROM tb_game WHERE updated_at < ?').all(t - WAITING_TTL_MS) as { code: string; data: string; updated_at: number }[];
    for (const r of rows) {
      const room = JSON.parse(r.data) as Room;
      if (tbIsRated(room.mode) && room.status === 'playing') {
        // Une partie classée abandonnée ne disparaît pas sans trace : l'horloge la conclut par un forfait enregistré.
        try {
          const e = this.load(r.code);
          this.advance(e.room, e.game);
          this.save(e.room);
          if (e.room.status === 'finished' && t - r.updated_at <= STALE_MS) continue;
        } catch {
          /* partie illisible : supprimée */
        }
      }
      if (room.status === 'waiting' || t - r.updated_at > STALE_MS) this.drop(r.code);
    }
  }

  // ---------- Avancement paresseux de l'horloge ----------

  private seatOf(room: Room, userId: string): Seat | null {
    if (room.seats[0].userId === userId) return 0;
    if (room.seats[1]?.userId === userId) return 1;
    return null;
  }

  private begin(room: Room, game: TableauGame, at: number): void {
    room.turnSince = at;
    const s = game.turn;
    room.cpuDelay = s !== null && room.seats[s]?.kind === 'cpu' ? (this.opts.cpuDelayMs ?? thinkDelayMs(room.seats[s]!.level ?? 'beginner', this.rng)) : 0;
  }

  private apply(room: Room, game: TableauGame, seat: Seat, col: number, auto: boolean, at: number, card?: string): void {
    const p = game.place(seat, col, auto, card);
    room.log.push({ seat, col, auto, card: p.card });
    if (game.finished) this.finish(room, game, at);
    else this.begin(room, game, at);
  }

  private finish(room: Room, game: TableauGame, at: number): void {
    room.status = 'finished';
    room.finishedAt = at;
    this.award(room, game);
    this.record(room, game);
    for (const p of room.seats) if (p?.userId) this.index(p.userId, room.code);
  }

  private winnerOf(room: Room, game: TableauGame): Seat | null {
    if (room.forfeit !== null) return (1 - room.forfeit) as Seat;
    return game.result()?.winner ?? null;
  }

  /** Expérience commune (profil Blackjack/poker) : récompense modeste, sans incidence sur un classement. */
  private award(room: Room, game: TableauGame): void {
    if (room.xpDone || !this.bj) return;
    room.xpDone = true;
    const winner = this.winnerOf(room, game);
    room.seats.forEach((p, i) => {
      if (!p || p.kind !== 'human' || !p.userId || p.userId.startsWith('guest:')) return;
      const base = room.mode === 'training' ? 15 : 30; // amical et classé : 30
      this.bj!.awardXp(p.userId, base + (winner === i ? 20 : 0));
    });
  }

  /** Statistiques, classement et défis des joueurs inscrits (une seule fois). Le classement ne bouge qu'en mode Classé. */
  private record(room: Room, game: TableauGame): void {
    if (room.statsDone) return;
    room.statsDone = true;
    const result = game.result();
    const winner = this.winnerOf(room, game);
    const variant = room.variant ?? 'classic';
    // Classements d'avant la partie, relevés avant toute mise à jour : les deux joueurs d'un duel sont notés sur les mêmes valeurs.
    const pre = room.seats.map((p) => (p?.kind === 'human' && p.userId ? this.stats.ratingOf(p.userId, variant) : null));
    room.ratings = [null, null];
    room.seats.forEach((p, i) => {
      if (!p || p.kind !== 'human' || !p.userId || !TableauStats.eligible(p.userId)) return;
      const seat = i as Seat;
      const opp = room.seats[(1 - seat) as Seat];
      const forfeited = room.forfeit === seat;
      const columns = game.columnsOf(seat);
      const facts = {
        mode: room.mode, variant: room.variant ?? 'classic', outcome: winner === null ? 'draw' : winner === seat ? 'win' : 'loss',
        columnsWon: result && room.forfeit === null ? result.score[seat] : 0,
        columnsPlayed: result && room.forfeit === null ? result.columns.length : 0,
        straightFlushWin: room.forfeit === null && result?.straightFlush?.seat === seat,
        straightFlushMade: columns.some((c) => c.length === 5 && evaluateColumn(c).category >= 8),
        opponentLevel: opp?.kind === 'cpu' ? opp.level : null, opponentRating: room.mode === 'duel' ? (pre[1 - seat] ?? null) : null, forfeit: forfeited,
      } as const;
      const change = this.stats.record(p.userId, { ...facts, outcome: facts.outcome });
      if (change && tbIsRated(room.mode)) room.ratings![seat] = change;
    });
  }

  /** Fait avancer la partie jusqu'à `now` : coups de l'IA arrivés à échéance, délais de 30 s dépassés, abandons. */
  private advance(room: Room, game: TableauGame): void {
    const now = this.now();
    let guard = 0;
    while (room.status === 'playing' && !room.paused && guard++ < 100) {
      const s = game.turn;
      if (s === null) break;
      const p = room.seats[s]!;
      if (p.kind === 'cpu') {
        const due = room.turnSince + room.cpuDelay;
        if (now < due) break;
        const mv = chooseMove(game.view(s), p.level ?? 'beginner', { rng: this.rng, maxSims: this.opts.aiSims, budgetMs: this.opts.aiBudgetMs ?? 350 });
        this.apply(room, game, s, mv.col, false, due, mv.card);
      } else {
        const limit = room.turnSince + TURN_MS + GRACE_MS;
        if (now < limit) break;
        p.idle++;
        if (p.idle >= MAX_IDLE_TURNS) {
          if (room.mode !== 'training') {
            room.forfeit = s;
            this.finish(room, game, limit);
          } else {
            room.paused = true; // entraînement : on met en pause, personne n'est pénalisé
          }
          break;
        }
        this.apply(room, game, s, game.autoColumn(s), true, room.turnSince + TURN_MS, game.autoCard(s));
      }
    }
  }

  // ---------- Création / arrivée ----------

  private activeOf(userId: string): { room: Room } | null {
    const rows = this.db.prepare('SELECT code FROM tb_seat WHERE user_id = ?').all(userId) as { code: string }[];
    for (const r of rows) {
      try {
        const e = this.load(r.code);
        this.advance(e.room, e.game);
        if (e.room.status !== 'finished') return { room: e.room };
      } catch {
        /* partie supprimée */
      }
    }
    return null;
  }

  /** Code de la partie en cours d'un joueur (reprise après coupure). */
  activeCode(userId: string): { code: string; mode: TbMode; status: TbStatus } | null {
    const a = this.activeOf(userId);
    return a ? { code: a.room.code, mode: a.room.mode, status: a.room.status } : null;
  }

  /** Parties amicales ouvertes, en attente d'un adversaire (les plus récentes d'abord). */
  listOpen(): { code: string; variant: TableauVariant; nickname: string; avatar: string | null; createdAt: number }[] {
    const rows = this.db.prepare('SELECT data FROM tb_game').all() as { data: string }[];
    const out: { code: string; variant: TableauVariant; nickname: string; avatar: string | null; createdAt: number }[] = [];
    for (const r of rows) {
      const room = JSON.parse(r.data) as Room;
      if (room.public !== true || room.mode !== 'friendly' || room.status !== 'waiting' || room.seats[1] || !room.seats[0]) continue;
      out.push({ code: room.code, variant: room.variant ?? 'classic', nickname: room.seats[0].nickname, avatar: room.seats[0].avatar, createdAt: room.createdAt });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  }

  create(who: Who, req: { mode: TbMode; level?: AiLevel; variant?: TableauVariant; public?: boolean }): TbGameDto {
    this.sweep();
    const existing = this.activeOf(who.userId);
    if (existing) {
      const r = existing.room;
      if (tbIsRated(r.mode) && r.status === 'playing') throw rule(`Une partie classée est déjà en cours (${r.code})`, 'TB_RANKED_ACTIVE');
      if (r.mode === 'friendly' && r.status === 'playing') throw rule(`Une partie amicale est déjà en cours (${r.code})`, 'TB_FRIENDLY_ACTIVE');
      this.drop(r.code); // entraînement ou salle d'attente non démarrée : remplacée
    }
    this.queueDrop(who.userId);
    if (req.mode === 'duel') throw new ServerError('BAD_REQUEST', 'Le duel passe par la file d’attente');
    if (req.mode === 'ranked' && !TableauStats.eligible(who.userId)) throw rule('Le mode Classé est réservé aux comptes connectés', 'TB_RANKED_ACCOUNT');
    const level = req.level ?? 'intermediate';
    const variant = req.variant ?? 'classic';
    if (!TABLEAU_VARIANTS.includes(variant)) throw new ServerError('BAD_REQUEST', 'Variante inconnue');
    if (req.mode !== 'friendly' && !AI_LEVELS.includes(level)) throw new ServerError('BAD_REQUEST', 'Niveau inconnu');
    const seed = this.opts.seed ? this.opts.seed() : randomBytes(32).toString('hex');
    const now = this.now();
    const human: Player = { kind: 'human', userId: who.userId, nickname: who.nickname, avatar: who.avatar, level: null, idle: 0 };
    const cpu: Player = { kind: 'cpu', userId: null, nickname: CPU_NAMES[level], avatar: null, level, idle: 0 };
    const room: Room = {
      code: this.newCode(), mode: req.mode, variant, ...(req.mode === 'friendly' && req.public === true ? { public: true } : {}), seed, commitment: tableauCommitment(seed),
      seats: [human, req.mode !== 'friendly' ? cpu : null],
      status: req.mode !== 'friendly' ? 'playing' : 'waiting', log: [], turnSince: now, cpuDelay: 0, paused: false, forfeit: null,
      createdAt: now, finishedAt: null, version: 0, updatedAt: now, xpDone: false,
    };
    const game = new TableauGame(seed, variant);
    if (room.status === 'playing') this.begin(room, game, now);
    this.cache.set(room.code, { room, game });
    this.save(room);
    this.index(who.userId, room.code);
    return this.dto(room, game, 0);
  }

  join(codeRaw: string, who: Who): TbGameDto {
    const { room, game } = this.load(codeRaw);
    const seat = this.seatOf(room, who.userId);
    if (seat !== null) return this.dto(room, game, seat);
    if (room.mode !== 'friendly' || room.status !== 'waiting' || room.seats[1]) throw rule('Cette partie n’accepte plus de joueur', 'TB_NOT_JOINABLE');
    const mine = this.activeOf(who.userId);
    if (mine) throw rule(`Vous avez déjà une partie en cours (${mine.room.code})`, 'TB_ALREADY_PLAYING');
    room.seats[1] = { kind: 'human', userId: who.userId, nickname: who.nickname, avatar: who.avatar, level: null, idle: 0 };
    room.status = 'playing';
    this.begin(room, game, this.now());
    this.index(who.userId, room.code);
    this.save(room);
    return this.dto(room, game, 1);
  }

  // ---------- Lecture / actions ----------

  get(codeRaw: string, userId: string | null): TbGameDto {
    const { room, game } = this.load(codeRaw);
    const seat = userId ? this.seatOf(room, userId) : null;
    if (seat === null) throw new ServerError('FORBIDDEN', 'Vous ne participez pas à cette partie');
    const lenBefore = room.log.length;
    const wasPaused = room.paused;
    if (room.paused && room.mode === 'training') {
      // Le joueur est revenu : l'entraînement reprend avec un nouveau délai complet.
      room.paused = false;
      room.seats[seat]!.idle = 0;
      this.begin(room, game, this.now());
    }
    this.advance(room, game);
    if (room.log.length !== lenBefore || room.status === 'finished' || wasPaused || room.paused) this.save(room);
    return this.dto(room, game, seat);
  }

  place(codeRaw: string, userId: string, col: number, card?: string): TbGameDto {
    const { room, game } = this.load(codeRaw);
    const seat = this.seatOf(room, userId);
    if (seat === null) throw new ServerError('FORBIDDEN', 'Vous ne participez pas à cette partie');
    if (room.paused) {
      room.paused = false;
      room.seats[seat]!.idle = 0;
      this.begin(room, game, this.now());
    }
    this.advance(room, game);
    if (room.status !== 'playing') {
      this.save(room);
      throw new ServerError('WRONG_STATE', room.status === 'waiting' ? 'En attente d’un adversaire' : 'La partie est terminée', room.status === 'waiting' ? 'TB_WAITING' : 'TB_FINISHED');
    }
    try {
      this.apply(room, game, seat, col, false, this.now(), card);
    } catch (e) {
      if (e instanceof TableauError) throw new ServerError('RULE', e.message, e.code);
      throw e;
    }
    room.seats[seat]!.idle = 0;
    this.advance(room, game); // l'IA peut déjà être due si son délai est nul
    this.save(room);
    return this.dto(room, game, seat);
  }

  advice(codeRaw: string, userId: string): { col: number; card: string; kind: 'improve' | 'empty' | 'dump'; after: ColumnHand | null; text: string } {
    const { room, game } = this.load(codeRaw);
    const seat = this.seatOf(room, userId);
    if (seat === null) throw new ServerError('FORBIDDEN', 'Vous ne participez pas à cette partie');
    if (room.mode !== 'training') throw rule('Les conseils sont réservés au mode Entraînement', 'TB_ADVICE_TRAINING');
    this.advance(room, game);
    if (game.turn !== seat) throw new ServerError('WRONG_STATE', 'Ce n’est pas votre tour', 'NOT_YOUR_TURN');
    const adv = adviseColumn(game.view(seat));
    const next = [...game.columnsOf(seat)[adv.col]!, adv.card];
    return { ...adv, after: next.length === 5 ? evaluateColumn(next) : null };
  }

  /** Quitte la partie : l'entraînement et l'attente sont supprimés ; une partie amicale commencée est perdue par forfait. */
  leave(codeRaw: string, userId: string): { left: true; forfeit: boolean } {
    const { room, game } = this.load(codeRaw);
    const seat = this.seatOf(room, userId);
    if (seat === null) throw new ServerError('FORBIDDEN', 'Vous ne participez pas à cette partie');
    this.advance(room, game);
    if (room.status === 'finished') return { left: true, forfeit: false };
    if (room.mode === 'training' || room.status === 'waiting') {
      this.drop(room.code);
      return { left: true, forfeit: false };
    }
    room.forfeit = seat;
    this.finish(room, game, this.now());
    this.save(room);
    return { left: true, forfeit: true };
  }

  history(userId: string, limit = 30): TbHistoryEntry[] {
    const rows = this.db.prepare('SELECT g.data FROM tb_seat s JOIN tb_game g ON g.code = s.code WHERE s.user_id = ? ORDER BY g.updated_at DESC LIMIT 200').all(userId) as { data: string }[];
    const out: TbHistoryEntry[] = [];
    for (const r of rows) {
      const room = JSON.parse(r.data) as Room;
      if (room.status !== 'finished') continue;
      const seat = this.seatOf(room, userId);
      if (seat === null) continue;
      const game = TableauGame.replay(room.seed, room.log, room.variant ?? 'classic');
      const result = game.result();
      const opp = room.seats[(1 - seat) as Seat]!;
      const winner = room.forfeit !== null ? ((1 - room.forfeit) as Seat) : (result?.winner ?? null);
      const score = result ? (seat === 0 ? result.score : ([result.score[1], result.score[0]] as [number, number])) : ([0, 0] as [number, number]);
      out.push({
        code: room.code, mode: room.mode, variant: room.variant ?? 'classic', at: room.finishedAt ?? room.updatedAt, opponent: opp.nickname, opponentLevel: opp.level,
        score: room.forfeit !== null ? [seat === room.forfeit ? 0 : 3, seat === room.forfeit ? 3 : 0] : score,
        outcome: winner === null ? 'draw' : winner === seat ? 'win' : 'loss', forfeit: room.forfeit !== null,
        straightFlush: room.forfeit === null && !!result?.straightFlush,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  // ---------- Duel classé : file d'attente ----------

  private queueDrop(userId: string): void {
    this.db.prepare('DELETE FROM tb_queue WHERE user_id = ?').run(userId);
  }
  private whoOf(userId: string): Who {
    const u = this.db.prepare('SELECT nickname, avatar FROM users WHERE id = ?').get(userId) as { nickname: string; avatar: string | null } | undefined;
    return { userId, nickname: u?.nickname ?? 'Joueur', avatar: u?.avatar ?? null };
  }
  /** Partie de duel en cours d'un joueur, s'il en a une (l'appariement a pu se faire pendant qu'il attendait). */
  private duelOf(userId: string): string | null {
    const a = this.activeOf(userId);
    return a && a.room.mode === 'duel' ? a.room.code : null;
  }

  /**
   * Cherche un adversaire de force proche (écart de 100 points, élargi de 50 toutes les 10 s, sans limite après 60 s).
   * Le premier arrivé fixe la table ; les deux joueurs voient la même partie. Réservé aux comptes connectés.
   */
  private tryMatch(me: { userId: string; rating: number; since: number }, variant: TableauVariant): string | null {
    const now = this.now();
    const rows = this.db.prepare('SELECT user_id, rating, since FROM tb_queue WHERE variant = ? AND user_id != ? ORDER BY since ASC').all(variant, me.userId) as { user_id: string; rating: number; since: number }[];
    for (const r of rows) {
      if (now - r.since > QUEUE_TTL_MS || this.activeOf(r.user_id)) {
        this.queueDrop(r.user_id); // attente expirée, ou joueur déjà reparti dans une autre partie
        continue;
      }
      if (!tbCanPair({ rating: me.rating, waitedMs: now - me.since }, { rating: r.rating, waitedMs: now - r.since })) continue;
      this.queueDrop(r.user_id);
      this.queueDrop(me.userId);
      return this.newDuel(this.whoOf(r.user_id), this.whoOf(me.userId), variant).code;
    }
    return null;
  }

  private newDuel(a: Who, b: Who, variant: TableauVariant): Room {
    const seed = this.opts.seed ? this.opts.seed() : randomBytes(32).toString('hex');
    const now = this.now();
    const pl = (w: Who): Player => ({ kind: 'human', userId: w.userId, nickname: w.nickname, avatar: w.avatar, level: null, idle: 0 });
    const room: Room = {
      code: this.newCode(), mode: 'duel', variant, seed, commitment: tableauCommitment(seed), seats: [pl(a), pl(b)], status: 'playing',
      log: [], turnSince: now, cpuDelay: 0, paused: false, forfeit: null, createdAt: now, finishedAt: null, version: 0, updatedAt: now, xpDone: false,
    };
    const game = new TableauGame(seed, variant);
    this.begin(room, game, now);
    this.cache.set(room.code, { room, game });
    this.save(room);
    this.index(a.userId, room.code);
    this.index(b.userId, room.code);
    return room;
  }

  queueJoin(who: Who, variant: TableauVariant = 'classic'): TbQueueDto {
    this.sweep();
    if (!TableauStats.eligible(who.userId)) throw rule('Le duel classé est réservé aux comptes connectés', 'TB_RANKED_ACCOUNT');
    if (!TABLEAU_VARIANTS.includes(variant)) throw new ServerError('BAD_REQUEST', 'Variante inconnue');
    const existing = this.activeOf(who.userId);
    if (existing) {
      const r = existing.room;
      if (r.mode === 'duel' && r.status === 'playing') return { status: 'matched', code: r.code, variant, waitedMs: 0 };
      if (r.status === 'playing' && r.mode !== 'training') throw rule(`Une partie est déjà en cours (${r.code})`, 'TB_ALREADY_PLAYING');
      this.drop(r.code);
    }
    const me = { userId: who.userId, rating: this.stats.ratingOf(who.userId, variant), since: this.now() };
    const code = this.tryMatch(me, variant);
    if (code) return { status: 'matched', code, variant, waitedMs: 0 };
    this.db.prepare('INSERT INTO tb_queue (user_id, variant, rating, since) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET variant = excluded.variant, rating = excluded.rating, since = excluded.since').run(me.userId, variant, me.rating, me.since);
    return { status: 'waiting', code: null, variant, waitedMs: 0 };
  }

  /** Où en est l'attente : apparié (code de la partie), en attente (la fenêtre s'élargit à chaque appel), ou rien. */
  queueStatus(userId: string): TbQueueDto {
    const code = this.duelOf(userId);
    if (code) return { status: 'matched', code, variant: this.load(code).room.variant ?? 'classic', waitedMs: 0 };
    const row = this.db.prepare('SELECT variant, rating, since FROM tb_queue WHERE user_id = ?').get(userId) as { variant: TableauVariant; rating: number; since: number } | undefined;
    if (!row) return { status: 'idle', code: null, variant: 'classic', waitedMs: 0 };
    const waited = this.now() - row.since;
    if (waited > QUEUE_TTL_MS) {
      this.queueDrop(userId);
      return { status: 'expired', code: null, variant: row.variant, waitedMs: waited };
    }
    const found = this.tryMatch({ userId, rating: row.rating, since: row.since }, row.variant);
    if (found) return { status: 'matched', code: found, variant: row.variant, waitedMs: waited };
    return { status: 'waiting', code: null, variant: row.variant, waitedMs: waited };
  }

  queueLeave(userId: string): { left: true } {
    this.queueDrop(userId);
    return { left: true };
  }

  // ---------- Profil, classement, défis ----------

  profile(userId: string, variant: TableauVariant = 'classic'): TbProfileDto {
    if (!TableauStats.eligible(userId)) throw rule('Les statistiques sont réservées aux comptes connectés', 'TB_ACCOUNT_ONLY');
    if (!TABLEAU_VARIANTS.includes(variant)) throw new ServerError('BAD_REQUEST', 'Variante inconnue');
    return this.stats.profile(userId, variant);
  }
  leaderboard(userId: string | null, variant: TableauVariant = 'classic'): TbLeaderboardRow[] {
    if (!TABLEAU_VARIANTS.includes(variant)) throw new ServerError('BAD_REQUEST', 'Variante inconnue');
    return this.stats.leaderboard(variant, userId);
  }

  // ---------- Vue publique ----------

  private dto(room: Room, game: TableauGame, you: Seat): TbGameDto {
    const finished = room.status === 'finished';
    const playing = room.status === 'playing';
    // En cas de forfait avant la fin, le plateau n'est pas complet : on renvoie quand même l'état courant sans résultat détaillé.
    const complete = finished && game.finished;
    const last = game.log.at(-1) ?? null;
    return {
      code: room.code, mode: room.mode, variant: room.variant ?? 'classic', status: room.status, version: room.version, serverNow: this.now(), you,
      players: room.seats.map((p, i) => (p ? { nickname: p.nickname, avatar: p.avatar, cosmetics: p.kind === 'human' ? tableCosmetics(this.store.db, p.userId) : null, kind: p.kind, level: p.level, rating: tbIsRated(room.mode) && p.kind === 'human' && p.userId ? this.stats.ratingOf(p.userId, room.variant ?? 'classic') : null, you: i === you } : null)),
      commitment: room.commitment,
      view: room.status === 'waiting' ? null : game.view(you),
      labels: room.status === 'waiting' ? null : ([0, 1] as const).map((sd) => game.columnsOf(sd).map((c) => (c.length === 5 ? evaluateColumn(c).label : describePartial(c)))) as [string[], string[]],
      made: room.status === 'waiting' ? null : ([0, 1] as const).map((sd) => game.columnsOf(sd).map((c) => (c.length === 5 ? evaluateColumn(c) : null))) as [(ColumnHand | null)[], (ColumnHand | null)[]],
      verdicts: room.status === 'waiting' ? null : [0, 1, 2, 3, 4].map((c) => {
        const a = game.columnsOf(0)[c]!;
        const b = game.columnsOf(1)[c]!;
        if (a.length < 5 || b.length < 5) return null;
        const cmp = compareColumns(a, b);
        return cmp > 0 ? (0 as Seat) : cmp < 0 ? (1 as Seat) : ('tie' as const);
      }),
      turnMs: TURN_MS,
      deadline: playing && !room.paused && game.turn !== null && room.seats[game.turn]?.kind === 'human' ? room.turnSince + TURN_MS : null,
      paused: room.paused,
      lastMove: last,
      result: complete ? game.result() : null,
      forfeit: room.forfeit,
      winner: finished ? this.winnerOf(room, game) : null,
      rating: finished && tbIsRated(room.mode) ? (room.ratings?.[you] ?? (you === 0 ? (room.rating ?? null) : null)) : null,
      reveal: finished ? { seed: room.seed, commitment: room.commitment, order: [...game.deal.initial[0], ...game.deal.initial[1], ...game.deal.deck[0], ...game.deal.deck[1]] } : null,
    };
  }
}

const CPU_NAMES: Record<AiLevel, string> = { beginner: 'Léon (Débutant)', intermediate: 'Margaux (Intermédiaire)', expert: 'Maestro (Expert)' };
