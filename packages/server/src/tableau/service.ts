import { randomBytes } from 'node:crypto';
import {
  adviseColumn, AI_LEVELS, chooseMove, TABLEAU_VARIANTS, compareColumns, CryptoRng, describePartial, evaluateColumn, TableauError, TableauGame, tableauCommitment, thinkDelayMs, TURN_MS,
  type AiLevel, type TableauVariant, type ColumnHand, type Placement, type Rng, type Seat, type TableauResult, type TableauView,
} from '@poker/engine';
import type { AccountDb } from '../accounts/db';
import { ServerError } from '../errors';
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
const STALE_MS = 24 * 3_600_000;

export type TbMode = 'training' | 'friendly' | 'ranked';
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
  /** Variation de classement d'une partie classée terminée. */
  rating?: TbRatingChange | null;
}

export interface TbPlayerDto {
  nickname: string;
  avatar: string | null;
  kind: 'human' | 'cpu';
  level: AiLevel | null;
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
      if (room.mode === 'ranked' && room.status === 'playing') {
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
        opponentLevel: opp?.kind === 'cpu' ? opp.level : null, forfeit: forfeited,
      } as const;
      const change = this.stats.record(p.userId, { ...facts, outcome: facts.outcome });
      if (change && room.mode === 'ranked') room.rating = change;
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

  create(who: Who, req: { mode: TbMode; level?: AiLevel; variant?: TableauVariant }): TbGameDto {
    this.sweep();
    const existing = this.activeOf(who.userId);
    if (existing) {
      const r = existing.room;
      if (r.mode === 'ranked' && r.status === 'playing') throw rule(`Une partie classée est déjà en cours (${r.code})`, 'TB_RANKED_ACTIVE');
      if (r.mode === 'friendly' && r.status === 'playing') throw rule(`Une partie amicale est déjà en cours (${r.code})`, 'TB_FRIENDLY_ACTIVE');
      this.drop(r.code); // entraînement ou salle d'attente non démarrée : remplacée
    }
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
      code: this.newCode(), mode: req.mode, variant, seed, commitment: tableauCommitment(seed),
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
      players: room.seats.map((p, i) => (p ? { nickname: p.nickname, avatar: p.avatar, kind: p.kind, level: p.level, you: i === you } : null)),
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
      rating: finished && room.mode === 'ranked' ? (room.rating ?? null) : null,
      reveal: finished ? { seed: room.seed, commitment: room.commitment, order: [...game.deal.initial[0], ...game.deal.initial[1], ...game.deal.deck[0], ...game.deal.deck[1]] } : null,
    };
  }
}

const CPU_NAMES: Record<AiLevel, string> = { beginner: 'Léon (Débutant)', intermediate: 'Margaux (Intermédiaire)', expert: 'Maestro (Expert)' };
