import { io, type Socket } from 'socket.io-client';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ApiError, createRoom, fetchStats, joinRoom, listOpenTables, listRooms, type OpenTable, type LiveStats, type CreateRoomInput, type JoinRoomInput, type RoomSummary } from './api';
import { describeEvent, type Tone } from './events';
import { currentI18n } from '../i18n';
import { errorText as localizedError } from './tbText';
import type { Session, SessionStore } from './session';
import type { ClientCommand, RoomView, RoundEvent, SocialMessage, ThrowItem, UpdateMessage } from './types';

export interface Toast {
  id: number;
  tone: Tone;
  text: string;
}
export interface FeedItem {
  id: number;
  version: number;
  event: RoundEvent;
}
export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

export interface ClientState {
  session: Session | null;
  connection: ConnectionState;
  view: RoomView | null;
  version: number;
  /** serverTime − horloge locale à la dernière mise à jour : sert à afficher des compteurs exacts. */
  serverOffsetMs: number;
  /** Événements récents (pour les annonces et animations). */
  feed: FeedItem[];
  toasts: Toast[];
  /** Chat et objets lancés de la table (éphémères : rien n'est rejoué après une reconnexion). */
  social: SocialMessage[];
  /** Pourquoi la partie a été quittée de force. */
  closed: null | 'KICKED' | 'INVALID_SESSION';
}

const FEED_LIMIT = 150;
const SOCIAL_LIMIT = 60;

export const initialState = (session: Session | null = null): ClientState => ({
  session,
  connection: 'idle',
  view: null,
  version: 0,
  serverOffsetMs: 0,
  feed: [],
  toasts: [],
  social: [],
  closed: null,
});

/**
 * Applique un message `update` à l'état. Fonction pure.
 * - message d'une autre room ou plus ancien que l'état courant : ignoré ;
 * - même version (resync) : la vue est remplacée sans rejouer les événements ;
 * - l'état complet accompagne chaque message : un trou de version ne casse jamais l'affichage.
 */
export function reduceUpdate(
  state: ClientState,
  msg: UpdateMessage,
  clientNow: number,
  nextId: () => number,
): Partial<ClientState> | null {
  if (!state.session || msg.roomCode !== state.session.code) return null;
  if (msg.version < state.version) return null;
  const fresh = msg.version > state.version;
  const feed = fresh ? [...state.feed, ...msg.events.map((event) => ({ id: nextId(), version: msg.version, event }))].slice(-FEED_LIMIT) : state.feed;
  return { view: msg.view, version: msg.version, serverOffsetMs: msg.view.serverTime - clientNow, feed };
}

export interface ClientOptions {
  baseUrl?: string;
  storage: SessionStore;
  clock?: () => number;
  fetchFn?: typeof fetch;
  socketFactory?: (url: string, opts: Record<string, unknown>) => Socket;
  /** Jeton du compte connecté (joueur inscrit), transmis à la création et à l'arrivée. */
  accountToken?: () => string | null;
  /** Appelé avant d'ouvrir ou de rejoindre une table : peut refuser (plafond de tables atteint). */
  beforeNewTable?: () => void;
}

type Ack = { ok: true } | { ok: false; error: { code: string; message: string; ruleCode?: string } };

export const errorText = (e: unknown): string => localizedError(currentI18n(), e);

/** Client d'une partie : HTTP (création / arrivée), WebSocket (jeu), état réactif (zustand). */
export class GameClient {
  readonly store: StoreApi<ClientState>;
  private socket: Socket | null = null;
  private seq = 0;
  private leaving = false;

  constructor(private readonly opts: ClientOptions) {
    this.store = createStore<ClientState>(() => initialState(opts.storage.load()));
  }

  private get baseUrl(): string {
    return this.opts.baseUrl ?? '';
  }
  private get clock(): () => number {
    return this.opts.clock ?? Date.now;
  }
  private set(partial: Partial<ClientState>): void {
    this.store.setState(partial);
  }
  get state(): ClientState {
    return this.store.getState();
  }

  /** Heure du serveur, corrigée du décalage mesuré (les compteurs restent exacts après une reconnexion). */
  serverNow(): number {
    return this.clock() + this.state.serverOffsetMs;
  }

  // ---------- Accès ----------

  async createRoom(input: CreateRoomInput): Promise<void> {
    this.opts.beforeNewTable?.();
    const res = await createRoom(this.baseUrl, input, this.opts.fetchFn, this.opts.accountToken?.());
    this.begin({ ...res, nickname: input.nickname });
  }

  async joinRoom(code: string, input: JoinRoomInput): Promise<void> {
    this.opts.beforeNewTable?.();
    const res = await joinRoom(this.baseUrl, code, input, this.opts.fetchFn, this.opts.accountToken?.());
    this.begin({ code: code.trim().toUpperCase(), token: res.token, playerId: res.playerId, nickname: input.nickname });
  }

  /** Liste publique des parties ouvertes (accueil) : aucun effet sur la session en cours. */
  listOpenTables(): Promise<OpenTable[]> {
    return listOpenTables(this.baseUrl, this.opts.fetchFn);
  }
  listRooms(): Promise<RoomSummary[]> {
    return listRooms(this.baseUrl, this.opts.fetchFn);
  }

  /** Fréquentation du site (joueurs en ligne, parties ouvertes) ; signale aussi cet onglet. */
  stats(visitor: string): Promise<LiveStats> {
    return fetchStats(this.baseUrl, visitor, this.opts.fetchFn);
  }

  private begin(session: Session): void {
    this.opts.storage.save(session);
    this.socket?.disconnect();
    this.store.setState({ ...initialState(session) });
    this.connect();
  }

  /** Reprise après rechargement de la page : le jeton conservé rouvre la session. */
  resume(): boolean {
    if (!this.state.session || this.socket) return false;
    this.connect();
    return true;
  }

  private connect(): void {
    const session = this.state.session;
    if (!session) return;
    this.leaving = false;
    this.set({ connection: 'connecting' });
    const factory = this.opts.socketFactory ?? ((url, o) => io(url, o));
    const socket = factory(this.baseUrl, {
      auth: { code: session.code, token: session.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
    });
    this.socket = socket;
    socket.on('connect', () => this.set({ connection: 'online' }));
    socket.on('disconnect', () => {
      if (!this.leaving) this.set({ connection: 'offline' });
    });
    socket.on('connect_error', () => this.set({ connection: 'offline' }));
    socket.on('update', (msg: UpdateMessage) => this.receive(msg));
    socket.on('social', (msg: SocialMessage) => this.receiveSocial(msg));
    socket.on('kicked', () => this.terminate('KICKED'));
    socket.on('fatal', () => this.terminate('INVALID_SESSION'));
  }

  private receive(msg: UpdateMessage): void {
    const patch = reduceUpdate(this.state, msg, this.clock(), () => ++this.seq);
    if (!patch) return;
    this.set(patch);
    // Événements privés qui méritent un rappel à l'écran
    if (patch.view) {
      for (const e of msg.events) {
        if (e.visibility === 'PLAYER' && (e.type === 'WARNING' || e.type === 'INSURANCE_AVAILABLE')) {
          const a = describeEvent(e, patch.view);
          if (a) this.toast(a.tone, a.text);
        }
      }
    }
  }

  private receiveSocial(msg: SocialMessage): void {
    if (!this.state.session || msg.roomCode !== this.state.session.code) return;
    if (this.state.social.some((m) => m.id === msg.id)) return;
    this.set({ social: [...this.state.social, msg].slice(-SOCIAL_LIMIT) });
  }

  private terminate(reason: 'KICKED' | 'INVALID_SESSION'): void {
    this.leaving = true;
    this.opts.storage.clear();
    this.socket?.disconnect();
    this.socket = null;
    this.store.setState({ ...initialState(null), closed: reason });
  }

  /** Quitter la partie en cours (efface la session locale). */
  leave(): void {
    this.leaving = true;
    this.opts.storage.clear();
    this.socket?.disconnect();
    this.socket = null;
    this.store.setState({ ...initialState(null) });
  }

  /** Fermeture de l'onglet / démontage : coupe la connexion sans effacer la session. */
  dispose(): void {
    this.leaving = true;
    this.socket?.disconnect();
    this.socket = null;
  }

  // ---------- Messages ----------

  private emit<T = void>(event: string, payload?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const s = this.socket;
      if (!s || !s.connected) return reject(new ApiError('OFFLINE', 'Connexion perdue. Action non envoyée.'));
      s.timeout(8000).emit(event, payload, (err: Error | null, ack: Ack) => {
        if (err) return reject(new ApiError('TIMEOUT', 'Le serveur n\u2019a pas répondu.'));
        if (ack?.ok) resolve((ack as { data?: T }).data as T);
        else reject(new ApiError(ack?.error?.code ?? 'ERROR', ack?.error?.message ?? 'Action refusée.', ack?.error?.ruleCode));
      });
    });
  }

  /** Réglé depuis l'interface (SettingsProvider) : un son bref à chaque commande, silencieux si désactivé. */
  onSound: (kind: 'select' | 'confirm' | 'error') => void = () => undefined;

  private async act(fn: () => Promise<void>, kind: 'select' | 'confirm' = 'confirm'): Promise<boolean> {
    try {
      await fn();
      this.onSound(kind);
      return true;
    } catch (e) {
      this.onSound('error');
      this.toast('error', errorText(e));
      return false;
    }
  }

  command = (cmd: ClientCommand): Promise<boolean> => this.act(() => this.emit('command', cmd), cmd.type === 'SELECT' ? 'select' : 'confirm');
  startGame = (): Promise<boolean> => this.act(() => this.emit('lobby:start'));
  cancelRoom = (): Promise<boolean> => this.act(() => this.emit('lobby:cancel'));
  excludePlayer = (playerId: string): Promise<boolean> => this.act(() => this.emit('host:exclude', { playerId }));
  /** Approuve ou refuse l'assistance proposée par l'hôte (salle d'attente uniquement). */
  approveAssistance = (approve: boolean): Promise<boolean> => this.act(() => this.emit('lobby:approveAssistance', { approve }));
  /** Chat et objets : sans son de commande ; un refus (trop de messages…) s'affiche en notification. */
  async sendSocial(input: { kind: 'chat'; text: string } | { kind: 'throw'; item: ThrowItem; to: string }): Promise<boolean> {
    try {
      await this.emit('social', input);
      return true;
    } catch (e) {
      this.toast('error', errorText(e));
      return false;
    }
  }
  resync = (): Promise<boolean> => this.act(() => this.emit('state:resync'));
  /** Revanche : ouvre (ou rejoint) la table qui reprend les réglages de la partie terminée, et y bascule. */
  async rematch(): Promise<boolean> {
    const view = this.state.view;
    const me = view?.players.find((p) => p.id === view.you.playerId);
    try {
      const r = await this.emit<{ code: string; playerId: string; token: string }>('room:rematch');
      this.begin({ code: r.code, token: r.token, playerId: r.playerId, nickname: me?.nickname ?? '' });
      this.onSound('confirm');
      return true;
    } catch (e) {
      this.onSound('error');
      this.toast('error', errorText(e));
      return false;
    }
  }

  async leaveLobby(): Promise<boolean> {
    const ok = await this.act(() => this.emit('lobby:leave'));
    if (ok) this.leave();
    return ok;
  }

  // ---------- Notifications ----------

  toast(tone: Tone, text: string): void {
    const id = ++this.seq;
    this.set({ toasts: [...this.state.toasts, { id, tone, text }].slice(-4) });
  }
  dismissToast = (id: number): void => this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
}
