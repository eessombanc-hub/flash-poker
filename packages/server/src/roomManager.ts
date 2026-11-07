import { createHash, randomBytes } from 'node:crypto';
import {
  assignPositions,
  GameManager,
  RuleError,
  type GameCommand,
  type GameHooks,
  type Rng,
  type RoundEvent,
} from '@poker/engine';
import { ServerError } from './errors';
import {
  clientCommandSchema,
  createRoomSchema,
  joinRoomSchema,
  type ClientCommand,
  type Outgoing,
  type PlayerPublic,
  type PlayerState,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
} from './protocol';
import type { FinishedGame } from './accounts/service';
import type { Scheduler, Timer } from './scheduler';
import { InMemoryRoomStore, type RoomConfig, type RoomSnapshot, type RoomStore } from './store';

/** Alphabet sans caractères ambigus (0/O, 1/I). */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PREFIX = 'POKER-';

export interface TimerConfig {
  /** Durée de chaque minuteur : 60 s (choix de variante, sélections, retournement 6-1, réponse à une assurance). */
  durationMs: number;
  /** Avertissement neutre à 10 s de l'échéance. */
  warningMs: number;
}
export interface TtlConfig {
  /** Room jamais démarrée. */
  waitingMs: number;
  /** Room terminée ou annulée. */
  finishedMs: number;
  /** Partie en cours sans aucun joueur connecté (sécurité opérationnelle, pas une règle du jeu). */
  idleRunningMs: number;
}

export interface RoomManagerDeps {
  rng: Rng;
  scheduler: Scheduler;
  store?: RoomStore;
  timers?: Partial<TimerConfig>;
  ttl?: Partial<TtlConfig>;
  /** TESTS UNIQUEMENT : paquets truqués. */
  gameHooks?: GameHooks;
  tokenFactory?: () => string;
  idFactory?: () => string;
  onError?: (err: unknown) => void;
  /** Comptes joueurs (facultatif) : pseudos réservés aux inscrits, archivage des parties terminées. */
  accounts?: AccountHooks;
}

/** Compte connecté qui crée ou rejoint une salle : son pseudo et son avatar sont ceux du compte. */
export interface AccountRef {
  id: string;
  nickname: string;
  avatar: string | null;
}
export interface AccountHooks {
  /** Vrai si le pseudo appartient à un compte : un invité ne peut pas l'emprunter. */
  isReservedNickname(nickname: string): boolean;
  /** Partie terminée normalement (jamais pour une partie annulée). */
  onGameFinished(game: FinishedGame): void;
  /**
   * Jetons (facultatif ; absent, les mises restent symboliques comme avant les comptes). Une table avec mise
   * exige alors un compte : la mise est retirée du solde dès l'arrivée à la table, rendue si le joueur part
   * avant d'être assis ou si la partie est annulée, et la cagnotte est versée aux gagnants à la fin.
   */
  debit?(accountId: string, amount: number, reason: string): void;
  credit?(accountId: string, amount: number, reason: string): void;
}

interface PlayerRec {
  id: string;
  nickname: string;
  avatar: string | null;
  accountId: string | null;
  /** Jetons retenus pour cette table (la mise), en attente d'être rendus ou versés à la cagnotte. */
  held: number;
  tokenHash: string;
  connected: boolean;
  lastSeenAt: number;
  state: PlayerState;
  assistanceApproved: boolean | null;
}

interface Room {
  code: string;
  config: RoomConfig;
  status: RoomStatus;
  hostId: string;
  players: PlayerRec[];
  game: GameManager | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  lastConnectedAt: number;
  timerKey: string | null;
  timerKind: 'VARIANT' | 'INSURANCE' | 'ROUND' | null;
  deadlineAt: number | null;
  handles: { deadline?: Timer; warning?: Timer };
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const pub = (type: string, data: Record<string, unknown>): RoundEvent => ({ type, visibility: 'PUBLIC', data });

/**
 * Cœur du serveur : rooms, lobby, jetons de session, partie, minuteurs de 60 s, connexions, arrivées en cours
 * de partie, exclusions, persistance. Aucun réseau ici : les messages sortants passent par `onOutgoing`.
 * Le serveur est l'unique source de vérité ; un client n'envoie que des intentions.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private listeners = new Set<(o: Outgoing) => void>();
  private readonly timers: TimerConfig;
  private readonly ttl: TtlConfig;
  private readonly store: RoomStore;

  constructor(private readonly deps: RoomManagerDeps) {
    this.timers = { durationMs: 60_000, warningMs: 10_000, ...deps.timers };
    this.ttl = { waitingMs: 2 * 3_600_000, finishedMs: 3_600_000, idleRunningMs: 30 * 60_000, ...deps.ttl };
    this.store = deps.store ?? new InMemoryRoomStore();
  }

  // ---------- Abonnement aux messages sortants ----------

  onOutgoing(listener: (o: Outgoing) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Création, arrivée ----------

  createRoom(input: unknown, account?: AccountRef | null): { code: string; playerId: string; token: string } {
    const cfg = this.parse(createRoomSchema, input);
    const now = this.deps.scheduler.now();
    const who = this.identity(cfg.nickname, cfg.avatar ?? null, account);
    const code = this.newCode();
    const held = this.holdStake(who.accountId, cfg.stakeChips, `Mise : ${cfg.name} (${code})`);
    const host = this.newPlayer(who, 'LOBBY', true); // propose l'assistance : l'approuve de fait
    host.rec.held = held;
    const room: Room = {
      code,
      config: { name: cfg.name, maxPlayers: cfg.maxPlayers, targetPoints: cfg.targetPoints, stakeChips: cfg.stakeChips, assistance: cfg.assistance ?? false, private: cfg.private ?? false },
      status: 'WAITING',
      hostId: host.rec.id,
      players: [host.rec],
      game: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      lastConnectedAt: now,
      timerKey: null,
      timerKind: null,
      deadlineAt: null,
      handles: {},
    };
    this.rooms.set(room.code, room);
    this.broadcast(room, [pub('ROOM_CREATED', { code: room.code })]);
    return { code: room.code, playerId: host.rec.id, token: host.token };
  }

  joinRoom(codeRaw: string, input: unknown, account?: AccountRef | null): { playerId: string; token: string } {
    const room = this.room(codeRaw);
    const parsed = this.parse(joinRoomSchema, input);
    if (room.status === 'FINISHED' || room.status === 'CANCELLED') throw new ServerError('WRONG_STATE', 'Cette partie est terminée');
    const who = this.identity(parsed.nickname, parsed.avatar ?? null, account);
    const nickname = who.nickname;
    if (who.accountId && room.players.some((p) => p.accountId === who.accountId)) {
      throw new ServerError('NICKNAME_TAKEN', 'Vous êtes déjà dans cette partie (sur un autre appareil ?)');
    }
    if (room.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new ServerError('NICKNAME_TAKEN', 'Ce pseudo est déjà pris dans cette partie');
    }
    // Les places sont limitées par le nombre de joueurs fixé à la création (sièges des exclus et file d'attente compris)
    if (room.players.length >= room.config.maxPlayers) throw new ServerError('ROOM_FULL', 'La partie est complète');
    const held = this.holdStake(who.accountId, room.config.stakeChips, `Mise : ${room.config.name} (${room.code})`);
    const { rec, token } = this.newPlayer(who, room.status === 'WAITING' ? 'LOBBY' : 'QUEUED', room.config.assistance ? null : true);
    rec.held = held;
    room.players.push(rec);
    const events = [pub('PLAYER_JOINED', { player: rec.id, nickname: rec.nickname, queued: rec.state === 'QUEUED' })];
    if (room.status === 'RUNNING') this.afterTransition(room, events);
    else this.broadcast(room, events);
    return { playerId: rec.id, token };
  }

  /** Jeton → joueur. Une room inconnue et un mauvais jeton sont indiscernables. */
  authenticate(codeRaw: string, token: string): string {
    const room = this.rooms.get(this.normalize(codeRaw));
    const rec = room?.players.find((p) => p.tokenHash === hashToken(token));
    if (!room || !rec) throw new ServerError('UNAUTHORIZED', 'Session invalide');
    return rec.id;
  }

  // ---------- Connexion ----------

  connect(codeRaw: string, playerId: string): void {
    const room = this.room(codeRaw);
    const rec = this.player(room, playerId);
    rec.connected = true;
    rec.lastSeenAt = room.lastConnectedAt = this.deps.scheduler.now();
    this.broadcast(room, [pub('PLAYER_CONNECTION', { player: playerId, connected: true })]);
  }

  /**
   * Déconnexion : rien d'autre ne change. Le siège, les cartes, le score et l'assurance sont conservés ; les minuteurs
   * de 60 s continuent, avec leurs défauts (fold, ligne perdue…), et la reconnexion restaure tout l'état.
   */
  disconnect(codeRaw: string, playerId: string): void {
    const room = this.rooms.get(this.normalize(codeRaw));
    const rec = room?.players.find((p) => p.id === playerId);
    if (!room || !rec || !rec.connected) return;
    rec.connected = false;
    rec.lastSeenAt = room.lastConnectedAt = this.deps.scheduler.now();
    this.broadcast(room, [pub('PLAYER_CONNECTION', { player: playerId, connected: false })]);
  }

  // ---------- Lobby ----------

  /** Un joueur (hôte compris) approuve ou refuse l'assistance proposée à la création. Sans objet si l'hôte
   * n'a rien proposé. Sans unanimité au moment du départ, la partie démarre sans assistance (silence = refus). */
  approveAssistance(codeRaw: string, actorId: string, approve: boolean): void {
    const room = this.room(codeRaw);
    if (room.status !== 'WAITING') throw new ServerError('WRONG_STATE', 'La partie a déjà démarré ou est terminée');
    if (!room.config.assistance) throw new ServerError('WRONG_STATE', 'Aucune assistance proposée pour cette partie');
    const player = room.players.find((p) => p.id === actorId);
    if (!player) throw new ServerError('FORBIDDEN', 'Joueur inconnu');
    player.assistanceApproved = approve;
    this.broadcast(room, [pub('ASSISTANCE_VOTE', { player: actorId, approve })]);
  }

  startGame(codeRaw: string, actorId: string): void {
    const room = this.room(codeRaw);
    this.assertHost(room, actorId);
    if (room.status !== 'WAITING') throw new ServerError('WRONG_STATE', 'La partie a déjà démarré ou est terminée');
    if (room.players.length < 2) throw new ServerError('WRONG_STATE', 'Il faut au moins 2 joueurs pour démarrer');
    // Assistance : seulement si TOUS les joueurs de la salle l'ont approuvée, sinon la partie démarre sans (silence = refus).
    const assistance = room.config.assistance && room.players.every((p) => p.assistanceApproved === true);
    // Positions tirées au sort, stables pendant toute la partie ; paramètres verrouillés
    const seating = assignPositions(room.players.map((p) => p.id), this.deps.rng);
    room.game = new GameManager(
      { players: seating.order, targetPoints: room.config.targetPoints, stakeChips: room.config.stakeChips, maxPlayers: room.config.maxPlayers, assistance },
      this.deps.rng,
      this.deps.gameHooks ?? {},
    );
    room.status = 'RUNNING';
    for (const p of room.players) p.state = 'SEATED';
    this.afterTransition(room, [pub('GAME_STARTED', { order: seating.order, positions: seating.positions, assistance })]);
  }

  /** L'hôte annule la partie avant son démarrage. */
  cancelRoom(codeRaw: string, actorId: string): void {
    const room = this.room(codeRaw);
    this.assertHost(room, actorId);
    if (room.status !== 'WAITING') throw new ServerError('WRONG_STATE', 'Seule une partie non démarrée peut être annulée');
    this.close(room, 'CANCELLED', [pub('ROOM_CANCELLED', {})]);
  }

  leaveLobby(codeRaw: string, playerId: string): void {
    const room = this.room(codeRaw);
    this.player(room, playerId);
    if (room.status !== 'WAITING') throw new ServerError('WRONG_STATE', 'On ne quitte le lobby qu\'avant le démarrage');
    if (playerId === room.hostId) throw new ServerError('FORBIDDEN', 'L\'hôte annule la partie au lieu de la quitter');
    this.release(room, this.player(room, playerId), 'Mise rendue : table quittée');
    room.players = room.players.filter((p) => p.id !== playerId);
    this.broadcast(room, [pub('PLAYER_LEFT', { player: playerId })]);
  }

  /**
   * Exclusion par l'hôte. Lobby ou file d'attente : le joueur est retiré. En partie : il garde son siège en absent
   * permanent (minuteurs résolus instantanément, mise et points conservés).
   */
  excludePlayer(codeRaw: string, actorId: string, targetId: string): void {
    const room = this.room(codeRaw);
    this.assertHost(room, actorId);
    if (targetId === actorId) throw new ServerError('BAD_REQUEST', 'L\'hôte ne peut pas s\'exclure lui-même');
    const target = this.player(room, targetId);
    if (room.status === 'FINISHED' || room.status === 'CANCELLED') throw new ServerError('WRONG_STATE', 'La partie est terminée');
    if (room.status === 'WAITING' || target.state === 'QUEUED') {
      this.emit({ playerId: targetId, message: { type: 'kicked', roomCode: room.code } });
      this.release(room, target, 'Mise rendue : retiré de la table');
      room.players = room.players.filter((p) => p.id !== targetId);
      this.broadcast(room, [pub('PLAYER_REMOVED', { player: targetId })]);
      return;
    }
    this.applyGame(room, { type: 'EXCLUDE_PLAYER', player: targetId });
  }

  // ---------- Partie ----------

  /** Commande d'un client : l'identité vient du jeton authentifié, jamais du message. */
  command(codeRaw: string, playerId: string, raw: unknown): void {
    const room = this.room(codeRaw);
    const rec = this.player(room, playerId);
    if (room.status !== 'RUNNING' || !room.game) throw new ServerError('WRONG_STATE', 'Aucune partie en cours');
    if (rec.state !== 'SEATED') throw new ServerError('FORBIDDEN', 'Vous n\'êtes pas encore assis à la table');
    const cmd = this.parse(clientCommandSchema, raw);
    rec.lastSeenAt = this.deps.scheduler.now();
    this.applyGame(room, this.toGameCommand(playerId, cmd));
  }

  view(codeRaw: string, playerId: string): RoomView {
    const room = this.room(codeRaw);
    this.player(room, playerId);
    return this.viewFor(room, playerId);
  }

  /**
   * Liste publique des parties encore accessibles (`GET /rooms`) : en attente ou en cours, avec au moins un
   * siège libre — jamais de pseudo ni de jeton (voir `RoomSummary`). Les plus récentes d'abord.
   */
  listOpen(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.config.private && (r.status === 'WAITING' || r.status === 'RUNNING') && r.players.length < r.config.maxPlayers)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        code: r.code,
        name: r.config.name,
        status: r.status as 'WAITING' | 'RUNNING',
        maxPlayers: r.config.maxPlayers,
        seatsLeft: r.config.maxPlayers - r.players.length,
        targetPoints: r.config.targetPoints,
        stakeChips: r.config.stakeChips,
        assistance: r.config.assistance,
      }));
  }

  private toGameCommand(player: string, c: ClientCommand): GameCommand {
    switch (c.type) {
      case 'CHOOSE_VARIANT':
        return { type: 'CHOOSE_VARIANT', player, variant: c.variant };
      case 'SELECT':
        return { type: 'ROUND', command: { type: 'SELECT', player, cards: c.cards, line: c.line } };
      case 'VALIDATE':
        return { type: 'ROUND', command: { type: 'VALIDATE', player } };
      case 'REVEAL':
        return { type: 'ROUND', command: { type: 'REVEAL', player } };
      case 'PROPOSE_INSURANCE':
        return { type: 'PROPOSE_INSURANCE', player, partner: c.partner, insuranceType: c.insuranceType };
      case 'RESPOND_INSURANCE':
        return { type: 'RESPOND_INSURANCE', player, accept: c.accept };
    }
  }

  private applyGame(room: Room, cmd: GameCommand): void {
    let events: RoundEvent[];
    try {
      events = room.game!.apply(cmd);
    } catch (e) {
      if (e instanceof RuleError) throw new ServerError('RULE', e.message, e.code);
      throw e;
    }
    this.afterTransition(room, events);
  }

  /** Après toute transition : sièges des arrivants, fin de partie ou minuteur, diffusion. */
  private afterTransition(room: Room, events: RoundEvent[]): void {
    this.seatQueued(room, events);
    if (room.game!.phase() === 'GAME_OVER') {
      this.close(room, 'FINISHED', events);
      return;
    }
    this.rearm(room);
    this.broadcast(room, events);
  }

  /** Les joueurs arrivés en cours de partie sont assis entre deux manches, à la dernière position libre. */
  private seatQueued(room: Room, events: RoundEvent[]): void {
    const game = room.game;
    if (!game) return;
    for (const rec of room.players) {
      if (rec.state !== 'QUEUED') continue;
      if (game.phase() !== 'VARIANT_SELECTION' || game.players().length >= room.config.maxPlayers) break;
      events.push(...game.apply({ type: 'ADD_PLAYER', player: rec.id }));
      rec.state = 'SEATED';
    }
  }

  private close(room: Room, status: 'FINISHED' | 'CANCELLED', events: RoundEvent[]): void {
    this.clearTimers(room);
    room.timerKey = room.timerKind = room.deadlineAt = null;
    room.status = status;
    room.finishedAt = this.deps.scheduler.now();
    this.settleChips(room, status);
    this.broadcast(room, events);
    if (status === 'FINISHED') this.archive(room);
  }

  // ---------- Jetons ----------

  /** Retient la mise d'un joueur à son arrivée (table avec mise et comptes activés). */
  private holdStake(accountId: string | null, stake: number, reason: string): number {
    const hooks = this.deps.accounts;
    if (!hooks?.debit || stake <= 0) return 0;
    if (!accountId) throw new ServerError('ACCOUNT_REQUIRED', 'Cette table se joue avec des jetons : créez un compte gratuit (100 jetons offerts) ou connectez-vous');
    hooks.debit(accountId, stake, reason);
    return stake;
  }

  /** Rend la mise retenue d'un joueur qui n'a pas joué. */
  private release(room: Room, rec: PlayerRec, reason: string): void {
    if (rec.held > 0 && rec.accountId) this.guard(() => this.deps.accounts?.credit?.(rec.accountId!, rec.held, `${reason} (${room.config.name})`));
    rec.held = 0;
  }

  /**
   * Fin de table. Partie terminée : la cagnotte est versée selon le règlement du moteur (assurances comprises) ;
   * les joueurs restés en file d'attente, jamais assis, récupèrent leur mise. Partie annulée ou abandonnée :
   * chacun récupère sa mise.
   */
  private settleChips(room: Room, status: 'FINISHED' | 'CANCELLED'): void {
    const outcome = status === 'FINISHED' ? room.game?.outcome() : null;
    for (const rec of room.players) {
      if (outcome && rec.id in outcome.settlement.payouts) {
        const won = outcome.settlement.payouts[rec.id] ?? 0;
        if (rec.accountId && won > 0) this.guard(() => this.deps.accounts?.credit?.(rec.accountId!, won, `Gain : ${room.config.name}`));
        rec.held = 0;
      } else {
        this.release(room, rec, status === 'FINISHED' ? 'Mise rendue : jamais assis' : 'Mise rendue : partie annulée');
      }
    }
  }

  /** Archive la partie terminée pour l'historique des joueurs inscrits (sans effet sur la partie). */
  private archive(room: Room): void {
    const hooks = this.deps.accounts;
    const outcome = room.game?.outcome();
    if (!hooks || !room.game || !outcome || !room.players.some((p) => p.accountId)) return;
    try {
      hooks.onGameFinished({
        code: room.code,
        name: room.config.name,
        endedAt: room.finishedAt ?? this.deps.scheduler.now(),
        stakeChips: room.config.stakeChips,
        targetPoints: room.config.targetPoints,
        players: room.players.map((p) => ({ playerId: p.id, accountId: p.accountId, nickname: p.nickname, avatar: p.avatar })),
        seated: Object.keys(outcome.settlement.payouts),
        outcome,
        history: room.game.history(),
      });
    } catch (e) {
      (this.deps.onError ?? ((err) => console.error('[archive]', err)))(e);
    }
  }

  // ---------- Minuteurs de 60 s ----------

  /** Relance 60 s dès qu'une NOUVELLE phase à minuteur commence (clé différente) ; sinon le minuteur continue. */
  private rearm(room: Room): void {
    const t = room.status === 'RUNNING' && room.game ? room.game.timer() : null;
    if (!t) {
      this.clearTimers(room);
      room.timerKey = room.timerKind = room.deadlineAt = null;
      return;
    }
    if (t.key === room.timerKey) return;
    this.clearTimers(room);
    room.timerKey = t.key;
    room.timerKind = t.kind;
    room.deadlineAt = this.deps.scheduler.now() + this.timers.durationMs;
    this.schedule(room);
  }

  private schedule(room: Room): void {
    const key = room.timerKey!;
    const remaining = Math.max(0, room.deadlineAt! - this.deps.scheduler.now());
    room.handles.deadline = this.deps.scheduler.setTimeout(() => this.guard(() => this.onDeadline(room.code, key)), remaining);
    const warnIn = remaining - this.timers.warningMs;
    if (warnIn > 0) {
      room.handles.warning = this.deps.scheduler.setTimeout(() => this.guard(() => this.onWarning(room.code, key)), warnIn);
    }
  }

  private clearTimers(room: Room): void {
    room.handles.deadline?.cancel();
    room.handles.warning?.cancel();
    room.handles = {};
  }

  private onDeadline(code: string, key: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'RUNNING' || room.timerKey !== key) return; // minuteur périmé
    this.applyGame(room, { type: 'TIMEOUT' });
  }

  /** Avertissement neutre, aux seuls joueurs dont la sélection est incomplète. */
  private onWarning(code: string, key: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'RUNNING' || room.timerKey !== key || !room.game) return;
    const events: RoundEvent[] = room.game.warnings().map((player) => ({
      type: 'WARNING',
      visibility: 'PLAYER' as const,
      audience: player,
      data: { secondsLeft: Math.round(this.timers.warningMs / 1000), kind: room.timerKind },
    }));
    if (events.length > 0) this.broadcast(room, events);
  }

  /** Une exception dans un callback de minuteur ne doit jamais faire tomber le serveur. */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      (this.deps.onError ?? ((err) => console.error('[RoomManager]', err)))(e);
    }
  }

  // ---------- Hygiène : expiration des rooms ----------

  /** À appeler périodiquement. Renvoie les codes supprimés. */
  sweep(): string[] {
    const now = this.deps.scheduler.now();
    const removed: string[] = [];
    for (const room of [...this.rooms.values()]) {
      const idle = !room.players.some((p) => p.connected);
      if (room.status === 'WAITING' && now - room.createdAt > this.ttl.waitingMs) removed.push(room.code);
      else if ((room.status === 'FINISHED' || room.status === 'CANCELLED') && now - (room.finishedAt ?? room.updatedAt) > this.ttl.finishedMs) {
        removed.push(room.code);
      } else if (room.status === 'RUNNING' && idle && now - room.lastConnectedAt > this.ttl.idleRunningMs) {
        this.close(room, 'CANCELLED', [pub('ROOM_ABANDONED', {})]); // plus personne : la partie est abandonnée
      }
    }
    for (const code of removed) {
      const r = this.rooms.get(code)!;
      if (r.status === 'WAITING') for (const rec of r.players) this.release(r, rec, 'Mise rendue : table expirée');
      this.clearTimers(r);
      this.rooms.delete(code);
      this.guard(() => void Promise.resolve(this.store.delete(code)).catch((e) => this.deps.onError?.(e)));
    }
    return removed;
  }

  // ---------- Persistance ----------

  snapshotRoom(codeRaw: string): RoomSnapshot {
    const r = this.room(codeRaw);
    return {
      code: r.code,
      config: { ...r.config },
      status: r.status,
      hostId: r.hostId,
      players: r.players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, accountId: p.accountId, held: p.held, tokenHash: p.tokenHash, state: p.state, lastSeenAt: p.lastSeenAt, assistanceApproved: p.assistanceApproved })),
      game: r.game ? r.game.snapshot() : null,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      finishedAt: r.finishedAt,
      lastConnectedAt: r.lastConnectedAt,
      timerKey: r.timerKey,
      timerKind: r.timerKind,
      deadlineAt: r.deadlineAt,
    };
  }

  /** Recharge les rooms depuis le store (redémarrage) : tous les joueurs sont hors ligne jusqu'à leur reconnexion. */
  async restoreFromStore(): Promise<number> {
    const snaps = await this.store.loadAll();
    for (const s of snaps) this.restoreRoom(s);
    return snaps.length;
  }

  restoreRoom(s: RoomSnapshot): void {
    const room: Room = {
      code: s.code,
      config: { ...s.config },
      status: s.status,
      hostId: s.hostId,
      players: s.players.map((p) => ({ ...p, accountId: p.accountId ?? null, held: p.held ?? 0, connected: false })),
      game: s.game ? GameManager.restore(s.game, this.deps.rng, this.deps.gameHooks ?? {}) : null,
      version: s.version,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      finishedAt: s.finishedAt,
      lastConnectedAt: this.deps.scheduler.now(),
      timerKey: s.timerKey,
      timerKind: s.timerKind,
      deadlineAt: s.deadlineAt,
      handles: {},
    };
    this.rooms.set(room.code, room);
    if (room.status === 'RUNNING' && room.game) {
      const t = room.game.timer();
      if (t && t.key === room.timerKey && room.deadlineAt !== null) this.schedule(room); // reprend au temps restant
      else this.rearm(room);
    }
  }

  private persist(room: Room): void {
    this.guard(() => {
      const res = this.store.save(this.snapshotRoom(room.code));
      if (res) res.catch((e) => this.deps.onError?.(e));
    });
  }

  // ---------- Vues et diffusion ----------

  private viewFor(room: Room, viewerId: string): RoomView {
    const gv = room.game ? room.game.view(viewerId) : null;
    const seat = new Map(gv?.players.map((p) => [p.player, p]));
    const me = this.player(room, viewerId);
    const players: PlayerPublic[] = room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      registered: p.accountId !== null,
      connected: p.connected,
      state: p.state,
      isHost: p.id === room.hostId,
      position: seat.get(p.id)?.position ?? null,
      score: seat.get(p.id)?.score ?? null,
      excluded: seat.get(p.id)?.excluded ?? false,
      assistanceApproved: p.assistanceApproved,
    }));
    return {
      code: room.code,
      name: room.config.name,
      status: room.status,
      config: {
        maxPlayers: room.config.maxPlayers,
        targetPoints: room.config.targetPoints,
        stakeChips: room.config.stakeChips,
        potChips: gv ? gv.potChips : room.config.stakeChips * room.players.length,
        assistance: room.config.assistance,
        private: room.config.private ?? false,
      },
      seatsLeft: room.config.maxPlayers - room.players.length,
      hostId: room.hostId,
      you: { playerId: viewerId, role: viewerId === room.hostId ? 'HOST' : me.state === 'QUEUED' ? 'QUEUED' : 'PLAYER' },
      players,
      version: room.version,
      serverTime: this.deps.scheduler.now(),
      deadline: room.deadlineAt !== null && room.timerKind && room.timerKey ? { at: room.deadlineAt, kind: room.timerKind, key: room.timerKey } : null,
      game: gv,
    };
  }

  /** Une transition = une version ; chaque joueur reçoit SA vue et SES événements en même temps. */
  private broadcast(room: Room, events: RoundEvent[]): void {
    room.version++;
    room.updatedAt = this.deps.scheduler.now();
    for (const p of room.players) {
      this.emit({
        playerId: p.id,
        message: {
          type: 'update',
          roomCode: room.code,
          version: room.version,
          view: this.viewFor(room, p.id),
          events: events.filter((e) => e.visibility === 'PUBLIC' || e.audience === p.id),
        },
      });
    }
    this.persist(room);
  }

  private emit(o: Outgoing): void {
    for (const l of this.listeners) l(o);
  }

  // ---------- Utilitaires ----------

  private normalize(code: string): string {
    return code.trim().toUpperCase();
  }
  private room(codeRaw: string): Room {
    const room = this.rooms.get(this.normalize(codeRaw));
    if (!room) throw new ServerError('ROOM_NOT_FOUND', 'Code de partie inconnu');
    return room;
  }
  private player(room: Room, id: string): PlayerRec {
    const rec = room.players.find((p) => p.id === id);
    if (!rec) throw new ServerError('FORBIDDEN', 'Joueur inconnu dans cette partie');
    return rec;
  }
  private assertHost(room: Room, actorId: string): void {
    this.player(room, actorId);
    if (actorId !== room.hostId) throw new ServerError('FORBIDDEN', 'Réservé à l\'hôte');
  }
  private parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string; path: PropertyKey[] }[] } } }, input: unknown): T {
    const res = schema.safeParse(input);
    if (!res.success) {
      const i = res.error.issues[0];
      throw new ServerError('BAD_REQUEST', i ? `${i.path.join('.') || 'requête'} : ${i.message}` : 'Requête invalide');
    }
    return res.data;
  }
  /** Pseudo et avatar du joueur : ceux du compte s'il est connecté ; un invité ne peut pas prendre le pseudo d'un compte. */
  private identity(nickname: string, avatar: string | null, account?: AccountRef | null): { nickname: string; avatar: string | null; accountId: string | null } {
    if (account) return { nickname: account.nickname, avatar: account.avatar ?? avatar, accountId: account.id };
    if (this.deps.accounts?.isReservedNickname(nickname)) {
      throw new ServerError('NICKNAME_RESERVED', 'Ce pseudo appartient à un joueur inscrit : connectez-vous ou choisissez-en un autre');
    }
    return { nickname, avatar, accountId: null };
  }
  private newPlayer(who: { nickname: string; avatar: string | null; accountId: string | null }, state: PlayerState, assistanceApproved: boolean | null): { rec: PlayerRec; token: string } {
    const token = this.deps.tokenFactory ? this.deps.tokenFactory() : randomBytes(24).toString('hex');
    const id = this.deps.idFactory ? this.deps.idFactory() : `p_${randomBytes(5).toString('hex')}`;
    return {
      token,
      rec: { id, nickname: who.nickname, avatar: who.avatar, accountId: who.accountId, held: 0, tokenHash: hashToken(token), connected: false, lastSeenAt: this.deps.scheduler.now(), state, assistanceApproved },
    };
  }
  private newCode(): string {
    for (let i = 0; i < 200; i++) {
      let code = CODE_PREFIX;
      for (let j = 0; j < 4; j++) code += CODE_ALPHABET[this.deps.rng.int(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new ServerError('BAD_REQUEST', 'Aucun code de partie disponible');
  }

  /** TESTS UNIQUEMENT : accès à l'état interne (cartes cachées comprises). */
  _debug(codeRaw: string): { game: GameManager | null; players: PlayerRec[]; deadlineAt: number | null; timerKey: string | null } {
    const r = this.room(codeRaw);
    return { game: r.game, players: r.players, deadlineAt: r.deadlineAt, timerKey: r.timerKey };
  }
  roomCount(): number {
    return this.rooms.size;
  }
}
