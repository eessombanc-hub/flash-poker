import {
  BjError, commitmentOf, levelFromXp, recommend, replayTable, resolveTable, analyze, seatRound, startTable, tableApply, tableLegal, tableView,
  type Advice, type BjAction, type Odds, type TableRound, type TableRules,
} from '@poker/engine';
import { randomBytes } from 'node:crypto';
import type { AccountDb } from '../accounts/db';
import { ServerError } from '../errors';
import type { BlackjackService } from './service';
import type { BjResult, BjSeatDto, BjTableDto, BjTableReply, SeatKind, TableStatus } from './types';

/** Rythmes de jeu (millisecondes). Tout avance « à la demande » : chaque requête fait d'abord avancer l'horloge de la table. */
export const CPU_STEP_MS = 1_100;
export const HUMAN_TURN_MS = 30_000;
export const BET_MS = 40_000;
export const NEXT_AUTO_MS = 25_000;
const DEAL_PAUSE_MS = 700;
const IDLE_TABLE_MS = 6 * 3_600_000;
const CPU_START_CHIPS = 1_000;
const CPU_NAMES = ['Marcel', 'Odile', 'Hector', 'Colette', 'Basile', 'Régine'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Seat {
  kind: SeatKind;
  userId: string | null;
  nickname: string;
  avatar: string | null;
  /** Solde d'un CPU (virtuel, propre à la table) ; pour un humain, le solde est celui de son profil. */
  cpuChips: number;
  ready: boolean;
  bet: number;
  left: boolean;
  out: boolean;
}

interface RoundRec {
  seed: string;
  commitment: string;
  /** Places (idx) des participants, dans l'ordre de la table de manche. */
  seatIdx: number[];
  bets: number[];
  startChips: number[];
  log: { seat: number; action: BjAction }[];
  turnSince: number;
}

interface Room {
  code: string;
  hostUserId: string;
  tableId: string;
  tableName: string;
  rules: TableRules;
  limits: { minBet: number; maxBet: number };
  minLevel: number;
  seats: Seat[];
  status: TableStatus;
  roundNo: number;
  round: RoundRec | null;
  /** Bilans des joueurs humains de la manche terminée, par place. */
  results: Record<number, BjResult>;
  version: number;
  phaseStartedAt: number;
  updatedAt: number;
}

type Who = { userId: string; nickname: string; avatar: string | null };
const rule = (m: string): ServerError => new ServerError('RULE', m);

/**
 * Tables de Blackjack à plusieurs : de 1 à 6 places, chacune tenue par un humain ou par un CPU, face à un seul croupier.
 * L'état est conservé en base (reprise après redémarrage) et la manche se reconstruit par rejeu (graine + journal).
 */
export class BlackjackTables {
  private readonly cache = new Map<string, { room: Room; tr: TableRound | null }>();

  constructor(
    private readonly store: AccountDb,
    private readonly bj: BlackjackService,
    private readonly opts: { now?: () => number; seed?: () => string } = {},
  ) {
    bj.busyCheck = (userId) => this.isPlaying(userId);
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

  // ---------- Persistance ----------

  private save(room: Room): void {
    room.version++;
    room.updatedAt = this.now();
    this.db.prepare('INSERT INTO bj_table (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(room.code, JSON.stringify(room), room.updatedAt);
  }

  private load(codeRaw: string): { room: Room; tr: TableRound | null } {
    const code = codeRaw.trim().toUpperCase();
    let entry = this.cache.get(code);
    if (!entry) {
      const row = this.db.prepare('SELECT data FROM bj_table WHERE code = ?').get(code) as { data: string } | undefined;
      if (!row) throw new ServerError('NOT_FOUND', 'Table introuvable');
      const room = JSON.parse(row.data) as Room;
      entry = { room, tr: this.rebuild(room) };
      this.cache.set(code, entry);
    }
    return entry;
  }

  private rebuild(room: Room): TableRound | null {
    return room.round ? replayTable(room.rules, room.round.bets, room.round.seed, room.round.log) : null;
  }

  private allRooms(): Room[] {
    return (this.db.prepare('SELECT data FROM bj_table').all() as { data: string }[]).map((r) => JSON.parse(r.data) as Room);
  }

  private purgeIdle(): void {
    const cutoff = this.now() - IDLE_TABLE_MS;
    const old = this.db.prepare('SELECT code FROM bj_table WHERE updated_at < ?').all(cutoff) as { code: string }[];
    for (const o of old) {
      this.cache.delete(o.code);
      this.db.prepare('DELETE FROM bj_table WHERE code = ?').run(o.code);
    }
  }

  /** Table à laquelle le joueur est assis (hors tables fermées), le cas échéant. */
  private seatedAt(userId: string): Room | null {
    for (const r of this.allRooms()) if (r.seats.some((s) => s.userId === userId && !s.left)) return r;
    return null;
  }

  /** Vrai si le joueur est en pleine manche à une table : ses jetons sont alors engagés. */
  isPlaying(userId: string): boolean {
    const r = this.seatedAt(userId);
    if (!r || r.status !== 'PLAYING' || !r.round) return false;
    return r.round.seatIdx.some((i) => r.seats[i]!.userId === userId);
  }

  // ---------- Création, arrivée, départ ----------

  create(who: Who, input: { table: string; rules?: TableRules; seats: SeatKind[]; bet?: number }): BjTableDto {
    this.purgeIdle();
    if (this.seatedAt(who.userId)) throw new ServerError('WRONG_STATE', 'Vous êtes déjà assis à une table : quittez-la d’abord');
    if (this.bj.hasActiveRound(who.userId)) throw new ServerError('WRONG_STATE', 'Terminez d’abord votre manche solo en cours');
    const t = resolveTable(input.table, input.rules);
    if (!t) throw new ServerError('BAD_REQUEST', 'Table ou règles invalides');
    if (input.seats.length < 1 || input.seats.length > 6 || input.seats[0] !== 'human') throw new ServerError('BAD_REQUEST', 'De 1 à 6 places, la première étant la vôtre');
    const info = this.bj.playerInfo(who.userId);
    if (info.level < t.minLevel) throw rule(`Cette table demande le niveau ${t.minLevel}`);
    const now = this.now();
    let n = 0;
    const cpuName = () => CPU_NAMES[n++ % CPU_NAMES.length]!;
    const seats: Seat[] = input.seats.map((kind, i) =>
      i === 0
        ? { kind: 'human', userId: who.userId, nickname: who.nickname, avatar: who.avatar, cpuChips: 0, ready: false, bet: clamp(input.bet ?? t.limits.minBet, t.limits.minBet, t.limits.maxBet), left: false, out: false }
        : kind === 'cpu'
          ? { kind, userId: null, nickname: cpuName(), avatar: null, cpuChips: CPU_START_CHIPS, ready: true, bet: t.limits.minBet, left: false, out: false }
          : { kind, userId: null, nickname: '', avatar: null, cpuChips: 0, ready: false, bet: t.limits.minBet, left: false, out: false },
    );
    const room: Room = {
      code: this.newCode(),
      hostUserId: who.userId,
      tableId: input.table,
      tableName: TABLE_NAMES[input.table] ?? 'Table libre',
      rules: t.rules,
      limits: t.limits,
      minLevel: t.minLevel,
      seats,
      status: 'LOBBY',
      roundNo: 0,
      round: null,
      results: {},
      version: 0,
      phaseStartedAt: now,
      updatedAt: now,
    };
    this.save(room);
    this.cache.set(room.code, { room, tr: null });
    return this.view(room, null, who.userId);
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(5);
      const code = 'BJ-' + [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('').slice(0, 4);
      if (!this.db.prepare('SELECT 1 FROM bj_table WHERE code = ?').get(code)) return code;
    }
  }

  join(code: string, who: Who): BjTableDto {
    const { room } = this.load(code);
    this.advance(room);
    if (room.seats.some((s) => s.userId === who.userId && !s.left)) return this.dto(code, who.userId);
    if (this.seatedAt(who.userId)) throw new ServerError('WRONG_STATE', 'Vous êtes déjà assis à une autre table');
    if (this.bj.hasActiveRound(who.userId)) throw new ServerError('WRONG_STATE', 'Terminez d’abord votre manche solo en cours');
    const info = this.bj.playerInfo(who.userId);
    if (info.level < room.minLevel) throw rule(`Cette table demande le niveau ${room.minLevel}`);
    const seat = room.seats.find((s) => s.kind === 'human' && !s.userId) ;
    if (!seat) throw new ServerError('WRONG_STATE', 'Aucune place humaine libre à cette table');
    if (room.status !== 'LOBBY' && room.status !== 'BETTING' && room.status !== 'DONE') throw new ServerError('WRONG_STATE', 'Une manche est en cours : rejoignez à la prochaine');
    Object.assign(seat, { userId: who.userId, nickname: who.nickname, avatar: who.avatar, ready: false, left: false, out: false, bet: clamp(room.limits.minBet, room.limits.minBet, room.limits.maxBet) });
    this.save(room);
    return this.dto(code, who.userId);
  }

  leave(code: string, userId: string): { left: true } {
    const { room } = this.load(code);
    this.advance(room);
    const seat = this.mySeat(room, userId);
    if (seat === null) return { left: true };
    const s = room.seats[seat]!;
    const inRound = room.status === 'PLAYING' && room.round?.seatIdx.includes(seat);
    if (inRound) {
      s.left = true; // sa main sera jouée en « Rester » jusqu'à la fin de la manche
    } else {
      this.vacate(room, seat);
    }
    if (!this.afterLeave(room)) this.save(room);
    return { left: true };
  }

  private vacate(room: Room, seat: number): void {
    const s = room.seats[seat]!;
    Object.assign(s, { userId: null, nickname: '', avatar: null, ready: false, left: false, out: false });
  }

  /** Ferme la table quand plus aucun humain n'y est ; passe la main d'hôte au premier humain restant. */
  private afterLeave(room: Room): boolean {
    const humans = room.seats.filter((s) => s.userId && !s.left);
    if (humans.length === 0 && room.status !== 'PLAYING') {
      this.cache.delete(room.code);
      this.db.prepare('DELETE FROM bj_table WHERE code = ?').run(room.code);
      return true;
    }
    if (!room.seats.some((s) => s.userId === room.hostUserId && !s.left) && humans[0]) room.hostUserId = humans[0].userId!;
    return false;
  }

  // ---------- Commandes ----------

  start(code: string, userId: string): BjTableDto {
    const { room } = this.load(code);
    this.advance(room);
    if (room.hostUserId !== userId) throw new ServerError('FORBIDDEN', 'Seul l’hôte lance la partie');
    if (room.status !== 'LOBBY') throw new ServerError('WRONG_STATE', 'La partie est déjà lancée');
    // Les places humaines restées libres disparaissent : la table se resserre autour des joueurs présents.
    room.seats = room.seats.filter((s) => s.kind === 'cpu' || s.userId);
    this.toBetting(room);
    this.save(room);
    return this.dto(code, userId);
  }

  bet(code: string, userId: string, bet: number): BjTableDto {
    const { room } = this.load(code);
    this.advance(room);
    const seat = this.mustSeat(room, userId);
    if (room.status !== 'BETTING') throw new ServerError('WRONG_STATE', 'Les mises ne sont pas ouvertes');
    if (!Number.isInteger(bet) || bet < room.limits.minBet || bet > room.limits.maxBet) throw rule(`Mise : de ${room.limits.minBet} à ${room.limits.maxBet} jetons`);
    const chips = this.bj.playerInfo(userId).chips;
    if (bet > chips) throw rule('Jetons insuffisants pour cette mise');
    const s = room.seats[seat]!;
    s.bet = bet;
    s.ready = true;
    s.out = false;
    this.maybeDeal(room, false);
    this.save(room);
    return this.dto(code, userId);
  }

  act(code: string, userId: string, action: BjAction): BjTableDto {
    const { room } = this.load(code);
    this.advance(room);
    const seat = this.mustSeat(room, userId);
    const entry = this.cache.get(room.code)!;
    if (room.status !== 'PLAYING' || !room.round || !entry.tr) throw new ServerError('WRONG_STATE', 'Aucune manche en cours');
    const p = room.round.seatIdx.indexOf(seat);
    if (p < 0) throw new ServerError('WRONG_STATE', 'Vous ne participez pas à cette manche');
    this.applyOne(room, entry, p, action);
    room.round.turnSince = this.now();
    this.advance(room, true);
    this.save(room);
    return this.dto(code, userId);
  }

  next(code: string, userId: string): BjTableDto {
    const { room } = this.load(code);
    this.advance(room);
    this.mustSeat(room, userId);
    if (room.status !== 'DONE') throw new ServerError('WRONG_STATE', 'La manche n’est pas terminée');
    this.toBetting(room);
    this.save(room);
    return this.dto(code, userId);
  }

  /** Conseil et probabilités pour ma main (probabilités sans compter les cartes des autres places). */
  help(code: string, userId: string): { advice: Advice | null; odds: Odds } {
    const { room } = this.load(code);
    this.advance(room);
    const seat = this.mustSeat(room, userId);
    const entry = this.cache.get(room.code)!;
    const p = room.round?.seatIdx.indexOf(seat) ?? -1;
    if (room.status !== 'PLAYING' || !entry.tr || p < 0 || entry.tr.turn !== p) throw new ServerError('WRONG_STATE', 'Ce n’est pas votre tour');
    const r = seatRound(entry.tr, p);
    return { advice: recommend(r, room.round!.startChips[p]! - r.wagered), odds: analyze(r) };
  }

  // ---------- Moteur de la table (avance à la demande) ----------

  private mySeat(room: Room, userId: string): number | null {
    const i = room.seats.findIndex((s) => s.userId === userId && !s.left);
    return i < 0 ? null : i;
  }
  private mustSeat(room: Room, userId: string): number {
    const i = this.mySeat(room, userId);
    if (i === null) throw new ServerError('FORBIDDEN', 'Vous n’êtes pas assis à cette table');
    return i;
  }

  private toBetting(room: Room): void {
    // Les départs en cours de manche sont enregistrés maintenant ; les CPU sans fonds repartent de zéro.
    room.seats.forEach((s, i) => {
      if (s.left) this.vacate(room, i);
      if (s.kind === 'cpu') {
        s.ready = true;
        s.out = false;
        if (s.cpuChips < room.limits.minBet) s.cpuChips = CPU_START_CHIPS;
        s.bet = clamp(s.bet, room.limits.minBet, Math.min(room.limits.maxBet, s.cpuChips));
      } else if (s.userId) {
        s.ready = false;
        s.out = false;
      }
    });
    room.status = 'BETTING';
    room.round = null;
    room.results = {};
    this.cache.get(room.code)!.tr = null;
    room.phaseStartedAt = this.now();
    this.afterLeave(room);
  }

  /** Distribue dès que tous les humains présents ont misé (ou, avec `force`, quand le délai de mise est écoulé). */
  private maybeDeal(room: Room, force: boolean): void {
    if (room.status !== 'BETTING') return;
    const humans = room.seats.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'human' && s.userId);
    if (!force && !humans.every(({ s }) => s.ready)) return;
    const idx: number[] = [];
    const bets: number[] = [];
    const startChips: number[] = [];
    room.seats.forEach((s, i) => {
      if (s.kind === 'cpu') {
        if (s.cpuChips >= room.limits.minBet) {
          idx.push(i);
          bets.push(Math.min(s.bet, s.cpuChips));
          startChips.push(s.cpuChips);
        }
        return;
      }
      if (!s.userId) return;
      const chips = this.bj.playerInfo(s.userId).chips;
      // Mise absente à l'échéance : on reprend la précédente si le solde le permet, sinon la mise minimale, sinon on passe la manche.
      const bet = s.ready ? s.bet : s.bet <= chips ? s.bet : room.limits.minBet;
      if (bet > chips || bet < room.limits.minBet) {
        s.out = true;
        return;
      }
      s.bet = bet;
      s.out = false;
      idx.push(i);
      bets.push(bet);
      startChips.push(chips);
    });
    if (!idx.some((i) => room.seats[i]!.kind === 'human')) {
      room.phaseStartedAt = this.now(); // personne ne peut miser : on attend (recharge gratuite, départ…)
      return;
    }
    const seed = this.newSeed();
    const tr = startTable(room.rules, bets, seed);
    room.roundNo++;
    room.round = { seed, commitment: commitmentOf(seed), seatIdx: idx, bets, startChips, log: [], turnSince: this.now() + DEAL_PAUSE_MS };
    room.status = 'PLAYING';
    room.phaseStartedAt = this.now();
    this.cache.get(room.code)!.tr = tr;
    if (tr.phase === 'DONE') this.finishRound(room, tr);
  }

  private applyOne(room: Room, entry: { room: Room; tr: TableRound | null }, p: number, action: BjAction): void {
    const rec = room.round!;
    const tr = entry.tr!;
    let next: TableRound;
    try {
      next = tableApply(tr, p, action, rec.startChips[p]!);
    } catch (e) {
      if (e instanceof BjError) throw new ServerError('RULE', e.message);
      throw e;
    }
    rec.log.push({ seat: p, action });
    entry.tr = next;
    if (next.phase === 'DONE') this.finishRound(room, next);
  }

  /** Fait avancer la table selon l'horloge : mises expirées, CPU qui jouent, tours humains expirés, enchaînement. */
  private advance(room: Room, justActed = false): void {
    const entry = this.cache.get(room.code);
    if (!entry) return;
    const now = this.now();
    let changed = justActed;
    if (room.status === 'BETTING' && now - room.phaseStartedAt >= BET_MS) {
      this.maybeDeal(room, true);
      changed = true;
    }
    for (let guard = 0; guard < 400 && room.status === 'PLAYING' && room.round && entry.tr; guard++) {
      const tr = entry.tr;
      const p = tr.turn;
      if (p < 0) break;
      const seat = room.seats[room.round.seatIdx[p]!]!;
      if (seat.kind === 'cpu') {
        if (now < room.round.turnSince + CPU_STEP_MS) break;
        const legal = tableLegal(tr, p, room.round.startChips[p]!);
        const rec = recommend(seatRound(tr, p), room.round.startChips[p]! - tr.seats[p]!.wagered);
        this.applyOne(room, entry, p, rec && legal.includes(rec.action) ? rec.action : legal.includes('STAND') ? 'STAND' : legal[0]!);
        room.round.turnSince += CPU_STEP_MS;
        changed = true;
        continue;
      }
      if (seat.left) {
        this.applyOne(room, entry, p, 'STAND'); // joueur parti : ses mains restent sur « Rester »
        changed = true;
        continue;
      }
      if (now >= room.round.turnSince + HUMAN_TURN_MS) {
        this.applyOne(room, entry, p, 'STAND'); // temps écoulé
        room.round.turnSince = Math.max(room.round.turnSince + HUMAN_TURN_MS, now - 1);
        changed = true;
        continue;
      }
      break;
    }
    if (room.status === 'DONE' && now - room.phaseStartedAt >= NEXT_AUTO_MS && room.seats.some((s) => s.userId && !s.left)) {
      this.toBetting(room);
      changed = true;
    }
    if (changed && this.db.prepare('SELECT 1 FROM bj_table WHERE code = ?').get(room.code)) this.save(room);
  }

  private finishRound(room: Room, tr: TableRound): void {
    const rec = room.round!;
    room.status = 'DONE';
    room.phaseStartedAt = this.now();
    room.results = {};
    rec.seatIdx.forEach((si, p) => {
      const seat = room.seats[si]!;
      const round = seatRound(tr, p);
      if (seat.kind === 'cpu') {
        seat.cpuChips = Math.max(0, seat.cpuChips + round.net);
        return;
      }
      if (!seat.userId) return;
      room.results[si] = this.bj.settleSeat(seat.userId, { startChips: rec.startChips[p]!, table: room.tableId, bet: rec.bets[p]!, seed: rec.seed, commitment: rec.commitment, rules: room.rules, actions: tr.log.filter((e) => e.seat === p).map((e) => e.action) }, round);
    });
  }

  // ---------- Lecture ----------

  /** Vue complète (jamais « inchangée »). */
  private dto(code: string, userId: string | null): BjTableDto {
    return this.get(code, userId) as BjTableDto;
  }

  get(code: string, userId: string | null, since?: number): BjTableReply {
    const { room } = this.load(code);
    this.advance(room);
    if (since !== undefined && since === room.version) return { unchanged: true, version: room.version };
    return this.view(room, this.cache.get(room.code)?.tr ?? null, userId);
  }

  private view(room: Room, tr: TableRound | null, userId: string | null): BjTableDto {
    const me = userId ? this.mySeat(room, userId) : null;
    const rec = room.round;
    const seats: BjSeatDto[] = room.seats.map((s, i) => ({
      idx: i,
      kind: s.kind,
      open: s.kind === 'human' && !s.userId,
      nickname: s.nickname,
      avatar: s.avatar,
      chips: s.kind === 'cpu' ? s.cpuChips : s.userId ? this.bj.playerInfo(s.userId).chips : 0,
      ready: s.ready,
      bet: s.bet,
      sittingOut: s.out || (room.status === 'PLAYING' && !!rec && !rec.seatIdx.includes(i) && !!(s.userId || s.kind === 'cpu')),
      you: i === me,
    }));
    const p = me !== null && rec ? rec.seatIdx.indexOf(me) : -1;
    const turnSeat = tr && rec && tr.turn >= 0 ? rec.seatIdx[tr.turn]! : -1;
    const deadline = (): number | null => {
      if (!rec || !tr || room.status !== 'PLAYING' || tr.turn < 0) return null;
      return room.seats[turnSeat]!.kind === 'human' ? rec.turnSince + HUMAN_TURN_MS : null;
    };
    return {
      code: room.code,
      version: room.version,
      status: room.status,
      tableId: room.tableId,
      tableName: room.tableName,
      rules: room.rules,
      limits: room.limits,
      seats,
      hostSeat: room.seats.findIndex((s) => s.userId === room.hostUserId),
      me,
      roundNo: room.roundNo,
      round:
        rec && tr
          ? {
              view: tableView(tr),
              participants: rec.seatIdx,
              turnSeat,
              deadlineAt: deadline(),
              legal: p >= 0 && room.status === 'PLAYING' ? tableLegal(tr, p, rec.startChips[p]!) : [],
              commitment: rec.commitment,
              seed: room.status === 'DONE' ? rec.seed : null,
            }
          : null,
      result: me !== null ? room.results[me] ?? null : null,
      phaseDeadlineAt: room.status === 'BETTING' ? room.phaseStartedAt + BET_MS : room.status === 'DONE' ? room.phaseStartedAt + NEXT_AUTO_MS : null,
      now: this.now(),
    };
  }
}

const TABLE_NAMES: Record<string, string> = { decouverte: 'Découverte', classique: 'Classique', 'carte-unique': 'Jeu unique', atlantic: 'Atlantic', 'haut-niveau': 'Haut niveau', libre: 'Table libre' };
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
