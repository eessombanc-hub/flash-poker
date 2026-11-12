import { createHash, randomBytes } from 'node:crypto';
import {
  assignPositions,
  cpuPlan,
  GameManager,
  isVariantAvailable,
  RuleError,
  type GameCommand,
  type GameHooks,
  type Rng,
  type RoundEvent,
  type VariantId,
} from '@poker/engine';
import { ServerError } from './errors';
import {
  clientCommandSchema,
  createRoomSchema,
  joinRoomSchema,
  socialSchema,
  type ClientCommand,
  type Outgoing,
  type PlayerPublic,
  type PlayerState,
  type RoomStatus,
  type RoomSummary,
  type RoomView,
} from './protocol';
import { AVATAR_IMAGE_ID } from './accounts/avatarImage';
import { RateLimiter } from './rateLimiter';
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
  /** Nombre maximal de tables simultanées (1000 par défaut). */
  maxRooms?: number;
  ttl?: Partial<TtlConfig>;
  /** TESTS UNIQUEMENT : paquets truqués. */
  gameHooks?: GameHooks;
  tokenFactory?: () => string;
  idFactory?: () => string;
  onError?: (err: unknown) => void;
  /** Délai de réflexion des joueurs CPU (mode entraînement), tiré au hasard dans cet intervalle. */
  bots?: Partial<BotConfig>;
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
  /** Le compte a-t-il assez de jetons pour miser ? (portefeuille persistant, recharge différée). */
  canAfford?(accountId: string, stake: number): boolean;
}
export interface BotConfig {
  minDelayMs: number;
  maxDelayMs: number;
}

/** Prénoms des adversaires CPU, dans l'ordre ; ceux déjà pris par l'hôte sont sautés. */
const BOT_NAMES = ['Gaspard', 'Léa', 'Hugo', 'Inès', 'Lucien', 'Margaux', 'Octave', 'Salomé'];
const BOT_AVATARS = ['ardoise', 'ambre', 'saphir', 'perle', 'onyx', 'rubis', 'emeraude', 'or'];

interface PlayerRec {
  id: string;
  nickname: string;
  avatar: string | null;
  accountId: string | null;
  tokenHash: string;
  connected: boolean;
  lastSeenAt: number;
  state: PlayerState;
  assistanceApproved: boolean | null;
  /** Joueur CPU : jamais de socket, c'est le serveur qui joue pour lui (voir `scheduleBots`). */
  bot: boolean;
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
  /** Prochain tour de jeu des CPU (distinct des minuteurs de 60 s, qui ne concernent que les humains). */
  botTimer?: Timer;
  /** Code de la table de revanche ouverte par l'un des joueurs une fois la partie terminée. */
  rematchCode?: string;
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
  private readonly botCfg: BotConfig;
  // Chat et objets : plafonds par joueur (anti-spam). Les compteurs restent en mémoire, rien n'est conservé.
  private readonly chatLimit = new RateLimiter(5, 10_000, () => this.deps.scheduler.now());
  private readonly throwBurst = new RateLimiter(1, 2_000, () => this.deps.scheduler.now());
  private readonly throwMinute = new RateLimiter(15, 60_000, () => this.deps.scheduler.now());
  private socialSeq = 0;

  constructor(private readonly deps: RoomManagerDeps) {
    this.timers = { durationMs: 60_000, warningMs: 10_000, ...deps.timers };
    this.ttl = { waitingMs: 2 * 3_600_000, finishedMs: 3_600_000, idleRunningMs: 30 * 60_000, ...deps.ttl };
    this.store = deps.store ?? new InMemoryRoomStore();
    this.botCfg = { minDelayMs: 900, maxDelayMs: 2400, ...deps.bots };
  }

  // ---------- Abonnement aux messages sortants ----------

  onOutgoing(listener: (o: Outgoing) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Création, arrivée ----------

  createRoom(input: unknown, account?: AccountRef | null): { code: string; playerId: string; token: string } {
    const cfg = this.parse(createRoomSchema, input);
    // Plafond global de tables simultanées (mémoire du serveur) : au-delà, on invite à réessayer plus tard.
    if (this.rooms.size >= (this.deps.maxRooms ?? 1000)) throw new ServerError('UNAVAILABLE', 'Le serveur est très sollicité. Réessayez dans quelques minutes');
    const now = this.deps.scheduler.now();
    const who = this.identity(cfg.nickname, cfg.avatar ?? null, account);
    this.assertAffordable(who.accountId, cfg.stakeChips);
    const code = this.newCode();
    const host = this.newPlayer(who, 'LOBBY', true); // propose l'assistance : l'approuve de fait
    // Entraînement : la table est exactement l'hôte + ses adversaires CPU, donc privée (aucun siège libre)
    const maxPlayers = cfg.cpu ? cfg.cpu + 1 : cfg.maxPlayers;
    if (cfg.variant && !isVariantAvailable(cfg.variant, maxPlayers)) throw new ServerError('BAD_REQUEST', `Cette variante n’est pas jouable à ${maxPlayers} joueurs`);
    const room: Room = {
      code,
      config: { name: cfg.name, maxPlayers, targetPoints: cfg.targetPoints, stakeChips: cfg.stakeChips, assistance: cfg.assistance ?? false, private: cfg.cpu ? true : cfg.private ?? false, ...(cfg.variant ? { variant: cfg.variant, ...(cfg.variant === 'V6_3' ? { teats: cfg.teats ?? 0, sideBets: cfg.sideBets ?? false } : {}) } : {}) },
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
    if (cfg.cpu) {
      room.players.push(...this.newBots(cfg.cpu, host.rec));
      this.launch(room); // démarre aussitôt : l'hôte retrouve la partie en cours dès qu'il se connecte
      return { code: room.code, playerId: host.rec.id, token: host.token };
    }
    this.broadcast(room, [pub('ROOM_CREATED', { code: room.code })]);
    return { code: room.code, playerId: host.rec.id, token: host.token };
  }

  /** Adversaires CPU : prénoms et avatars distincts de l'hôte et entre eux, toujours « connectés ». */
  private newBots(count: number, host: PlayerRec): PlayerRec[] {
    const names = BOT_NAMES.filter((n) => n.toLowerCase() !== host.nickname.toLowerCase());
    const avatars = BOT_AVATARS.filter((a) => a !== host.avatar);
    return Array.from({ length: count }, (_, i) => {
      const { rec } = this.newPlayer({ nickname: names[i]!, avatar: avatars[i % avatars.length]!, accountId: null }, 'LOBBY', true);
      rec.bot = true;
      rec.connected = true;
      return rec;
    });
  }

  joinRoom(codeRaw: string, input: unknown, account?: AccountRef | null): { playerId: string; token: string } {
    const room = this.room(codeRaw);
    const parsed = this.parse(joinRoomSchema, input);
    if (room.status === 'FINISHED' || room.status === 'CANCELLED') throw new ServerError('WRONG_STATE', 'Cette partie est terminée');
    const who = this.identity(parsed.nickname, parsed.avatar ?? null, account);
    this.assertAffordable(who.accountId, room.config.stakeChips);
    const nickname = who.nickname;
    if (who.accountId && room.players.some((p) => p.accountId === who.accountId)) {
      throw new ServerError('NICKNAME_TAKEN', 'Vous êtes déjà dans cette partie (sur un autre appareil ?)');
    }
    if (room.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new ServerError('NICKNAME_TAKEN', 'Ce pseudo est déjà pris dans cette partie');
    }
    // Les places sont limitées par le nombre de joueurs fixé à la création (sièges des exclus et file d'attente compris)
    if (room.players.length >= room.config.maxPlayers) throw new ServerError('ROOM_FULL', 'La partie est complète');
    const { rec, token } = this.newPlayer(who, room.status === 'WAITING' ? 'LOBBY' : 'QUEUED', room.config.assistance ? null : true);
    room.players.push(rec);
    const events = [pub('PLAYER_JOINED', { player: rec.id, nickname: rec.nickname, queued: rec.state === 'QUEUED' })];
    if (room.status === 'RUNNING') this.afterTransition(room, events);
    else this.broadcast(room, events);
    return { playerId: rec.id, token };
  }

  /**
   * Revanche : le premier joueur qui la demande ouvre une nouvelle table aux mêmes réglages et en devient l'hôte ;
   * les autres la rejoignent d'un geste (le code figure dans leur vue). Réservée aux parties terminées entre humains.
   */
  rematch(codeRaw: string, actorId: string): { code: string; playerId: string; token: string } {
    const room = this.room(codeRaw);
    const me = room.players.find((p) => p.id === actorId);
    if (!me || me.bot) throw new ServerError('FORBIDDEN', 'Vous ne participez pas à cette partie');
    if (room.status !== 'FINISHED') throw new ServerError('WRONG_STATE', 'La revanche n’est possible qu’une fois la partie terminée');
    if (room.players.some((p) => p.bot)) throw new ServerError('WRONG_STATE', 'Pas de revanche en entraînement : relancez une partie depuis l’accueil');
    const account: AccountRef | null = me.accountId ? { id: me.accountId, nickname: me.nickname, avatar: me.avatar } : null;
    const open = room.rematchCode ? this.rooms.get(room.rematchCode) : undefined;
    if (open && open.status === 'WAITING') {
      const joined = this.joinRoom(open.code, { nickname: me.nickname, ...(me.avatar ? { avatar: me.avatar } : {}) }, account);
      return { code: open.code, ...joined };
    }
    const c = room.config;
    const made = this.createRoom(
      { name: c.name, maxPlayers: c.maxPlayers, targetPoints: c.targetPoints, stakeChips: c.stakeChips, assistance: c.assistance, private: c.private ?? false, nickname: me.nickname, ...(me.avatar ? { avatar: me.avatar } : {}), ...(c.variant ? { variant: c.variant, ...(c.variant === 'V6_3' ? { teats: c.teats ?? 0, sideBets: c.sideBets ?? false } : {}) } : {}) },
      account,
    );
    room.rematchCode = made.code;
    this.broadcast(room, []);
    return made;
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
    this.launch(room);
  }

  /** Tirage des positions, création de la partie, premier minuteur. Partagé par le lobby et le mode entraînement. */
  private launch(room: Room): void {
    const fixed = room.config.variant;
    // Assistance : seulement si TOUS les joueurs de la salle l'ont approuvée, sinon la partie démarre sans (silence = refus).
    const assistance = room.config.assistance && room.players.every((p) => p.assistanceApproved === true);
    // Positions tirées au sort, stables pendant toute la partie ; paramètres verrouillés
    const seating = assignPositions(room.players.map((p) => p.id), this.deps.rng);
    room.game = new GameManager(
      { players: seating.order, targetPoints: room.config.targetPoints, stakeChips: room.config.stakeChips, maxPlayers: room.config.maxPlayers, assistance, ...(fixed ? { fixedVariant: fixed, fixedOptions: { teats: room.config.teats ?? 0, sideBets: room.config.sideBets ?? false } } : {}) },
      this.deps.rng,
      this.deps.gameHooks ?? {},
    );
    room.status = 'RUNNING';
    for (const p of room.players) p.state = 'SEATED';
    const started = [pub('GAME_STARTED', { order: seating.order, positions: seating.positions, assistance })];
    if (fixed) started.push(...room.game.apply({ type: 'TIMEOUT' })); // variante imposée : la première manche démarre sans étape de choix
    this.afterTransition(room, started);
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

  /**
   * Chat et objets lancés : diffusés tels quels à tous les joueurs de la salle, sans aucun effet sur la partie, hors
   * numéro de version, non conservés. L'expéditeur vient du jeton authentifié ; le texte est nettoyé et borné.
   */
  social(codeRaw: string, playerId: string, raw: unknown): void {
    const room = this.room(codeRaw);
    const rec = this.player(room, playerId);
    if (room.status === 'CANCELLED') throw new ServerError('WRONG_STATE', 'La partie est annulée');
    const msg = this.parse(socialSchema, raw);
    const key = `${room.code}|${rec.id}`;
    let out: { text: string } | { item: (typeof msg & { kind: 'throw' })['item']; to: string };
    if (msg.kind === 'chat') {
      if (!this.chatLimit.hit(key)) throw new ServerError('RATE_LIMITED', 'Trop de messages, ralentissez');
      out = { text: msg.text };
    } else {
      if (msg.to === rec.id) throw new ServerError('BAD_REQUEST', 'Choisissez un autre joueur');
      this.player(room, msg.to);
      if (!this.throwBurst.hit(key) || !this.throwMinute.hit(key)) throw new ServerError('RATE_LIMITED', 'Trop d’objets envoyés, patientez un instant');
      out = { item: msg.item, to: msg.to };
    }
    const base = { type: 'social' as const, roomCode: room.code, id: `${room.code}-${++this.socialSeq}`, at: this.deps.scheduler.now(), from: rec.id, kind: msg.kind };
    for (const p of room.players) if (!p.bot) this.emit({ playerId: p.id, message: { ...base, ...out } });
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
        ...(r.config.variant ? { variant: r.config.variant } : {}),
      }));
  }

  private toGameCommand(player: string, c: ClientCommand): GameCommand {
    switch (c.type) {
      case 'CHOOSE_VARIANT':
        return { type: 'CHOOSE_VARIANT', player, variant: c.variant, options: { teats: c.teats ?? 0, sideBets: c.sideBets ?? false } };
      case 'BET':
        return { type: 'ROUND', command: { type: 'BET', player, bets: c.bets } };
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
    this.scheduleBots(room);
  }

  // ---------- Joueurs CPU (mode entraînement) ----------

  private clearBotTimer(room: Room): void {
    room.botTimer?.cancel();
    room.botTimer = undefined;
  }

  /**
   * Après chaque transition : si un CPU est attendu, il joue dans un instant (délai de réflexion aléatoire).
   * Un seul CPU à la fois ; sa décision relance cette méthode, donc les CPU suivants jouent à leur tour.
   */
  private scheduleBots(room: Room): void {
    this.clearBotTimer(room);
    if (room.status !== 'RUNNING' || !room.game) return;
    const awaiting = new Set(room.game.awaiting());
    if (!room.players.some((p) => p.bot && awaiting.has(p.id))) return;
    const { minDelayMs, maxDelayMs } = this.botCfg;
    const delay = minDelayMs + (maxDelayMs > minDelayMs ? this.deps.rng.int(maxDelayMs - minDelayMs + 1) : 0);
    room.botTimer = this.deps.scheduler.setTimeout(() => this.guard(() => this.playBot(room.code)), delay);
  }

  /** Le CPU attendu joue SES commandes, décidées d'après SA vue uniquement (jamais les cartes des autres). */
  private playBot(code: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'RUNNING' || !room.game) return;
    room.botTimer = undefined;
    const awaiting = new Set(room.game.awaiting());
    const bot = room.players.find((p) => p.bot && awaiting.has(p.id));
    if (!bot) return;
    for (const cmd of cpuPlan(room.game.view(bot.id), bot.id, this.deps.rng)) {
      try {
        this.applyGame(room, cmd);
      } catch (e) {
        // Un coup refusé trahit un défaut du CPU : on le signale sans interrompre la partie (le minuteur prend le relais)
        (this.deps.onError ?? ((err) => console.error('[RoomManager] CPU', err)))(e);
        return;
      }
      if (room.status !== 'RUNNING') return;
    }
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
    this.clearBotTimer(room);
    room.timerKey = room.timerKind = room.deadlineAt = null;
    room.status = status;
    room.finishedAt = this.deps.scheduler.now();
    this.broadcast(room, events);
    if (status === 'FINISHED') this.archive(room);
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
      const idle = !room.players.some((p) => p.connected && !p.bot); // les CPU sont toujours connectés : seuls les humains comptent
      if (room.status === 'WAITING' && now - room.createdAt > this.ttl.waitingMs) removed.push(room.code);
      else if ((room.status === 'FINISHED' || room.status === 'CANCELLED') && now - (room.finishedAt ?? room.updatedAt) > this.ttl.finishedMs) {
        removed.push(room.code);
      } else if (room.status === 'RUNNING' && idle && now - room.lastConnectedAt > this.ttl.idleRunningMs) {
        this.close(room, 'CANCELLED', [pub('ROOM_ABANDONED', {})]); // plus personne : la partie est abandonnée
      }
    }
    for (const code of removed) {
      const r = this.rooms.get(code)!;
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
      players: r.players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, accountId: p.accountId, tokenHash: p.tokenHash, state: p.state, lastSeenAt: p.lastSeenAt, assistanceApproved: p.assistanceApproved, bot: p.bot })),
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
      players: s.players.map((p) => ({ ...p, accountId: p.accountId ?? null, connected: p.bot === true, bot: p.bot === true })),
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
      this.scheduleBots(room);
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
      bot: p.bot,
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
        ...(room.config.variant ? { variant: room.config.variant, ...(room.config.variant === 'V6_3' ? { teats: room.config.teats ?? 0, sideBets: room.config.sideBets ?? false } : {}) } : {}),
      },
      seatsLeft: room.config.maxPlayers - room.players.length,
      hostId: room.hostId,
      you: { playerId: viewerId, role: viewerId === room.hostId ? 'HOST' : me.state === 'QUEUED' ? 'QUEUED' : 'PLAYER' },
      players,
      version: room.version,
      serverTime: this.deps.scheduler.now(),
      rematch: room.rematchCode ?? null,
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
      throw new ServerError('BAD_REQUEST', i ? `${i.path.join('.') || 'requête'}. ${i.message}` : 'Requête invalide');
    }
    return res.data;
  }
  /** Pseudo et avatar du joueur : ceux du compte s'il est connecté ; un invité ne peut pas prendre le pseudo d'un compte. */
  /** Portefeuille persistant : un compte ne s'assoit pas à une table dont la mise dépasse son solde. */
  private assertAffordable(accountId: string | null, stake: number): void {
    if (!accountId || stake <= 0) return;
    const ok = this.deps.accounts?.canAfford?.(accountId, stake) ?? true;
    if (!ok) throw new ServerError('RULE', 'Solde insuffisant pour cette mise. Consultez votre portefeuille dans votre espace (recharge programmée)');
  }

  private identity(nickname: string, avatar: string | null, account?: AccountRef | null): { nickname: string; avatar: string | null; accountId: string | null } {
    if (account) return { nickname: account.nickname, avatar: account.avatar ?? avatar, accountId: account.id };
    if (this.deps.accounts?.isReservedNickname(nickname)) {
      throw new ServerError('NICKNAME_RESERVED', 'Ce pseudo appartient à un joueur inscrit. Connectez-vous ou choisissez-en un autre');
    }
    // Un invité ne peut pas afficher la photo d'un compte : seuls les préréglages lui sont ouverts.
    return { nickname, avatar: avatar !== null && AVATAR_IMAGE_ID.test(avatar) ? null : avatar, accountId: null };
  }
  private newPlayer(who: { nickname: string; avatar: string | null; accountId: string | null }, state: PlayerState, assistanceApproved: boolean | null): { rec: PlayerRec; token: string } {
    const token = this.deps.tokenFactory ? this.deps.tokenFactory() : randomBytes(24).toString('hex');
    const id = this.deps.idFactory ? this.deps.idFactory() : `p_${randomBytes(5).toString('hex')}`;
    return {
      token,
      rec: { id, nickname: who.nickname, avatar: who.avatar, accountId: who.accountId, tokenHash: hashToken(token), connected: false, lastSeenAt: this.deps.scheduler.now(), state, assistanceApproved, bot: false },
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
