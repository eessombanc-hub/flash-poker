import { io, type Socket } from 'socket.io-client';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ApiError } from './api';
import type { AccountPrivate, AccountPublic, Bankroll, FavoritePlayer, FavoriteRound, GameDetail, GameSummary, VariantStats } from './types';

/** Jeton de compte conservé dans le navigateur (session de 30 jours côté serveur). */
const KEY = 'poker.account.v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
const defaultStorage = (): Storage => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export interface AccountState {
  token: string | null;
  account: AccountPrivate | null;
  /** Vrai une fois la session vérifiée auprès du serveur (ou en l'absence de jeton). */
  ready: boolean;
  passwordRecovery: boolean;
}

export interface AccountOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  storage?: Storage;
  socketFactory?: (url: string, opts: Record<string, unknown>) => Socket;
  /** Un joueur favori vient de se connecter (notification dans l'application). */
  onFavoriteOnline?: (who: AccountPublic) => void;
}

/** Compte du joueur : connexion, profil, espace personnel, présence (favoris). */
export class AccountClient {
  readonly store: StoreApi<AccountState>;
  private presence: Socket | null = null;
  private readonly storage: Storage;

  constructor(private readonly opts: AccountOptions = {}) {
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    let token: string | null = null;
    try {
      token = this.storage?.getItem(KEY) ?? null;
    } catch {
      token = null;
    }
    this.store = createStore<AccountState>(() => ({ token, account: null, ready: !token, passwordRecovery: false }));
  }

  get state(): AccountState {
    return this.store.getState();
  }
  get token(): string | null {
    return this.state.token;
  }
  set onFavoriteOnline(fn: ((who: AccountPublic) => void) | undefined) {
    this.opts.onFavoriteOnline = fn;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await (this.opts.fetchFn ?? fetch)(`${this.opts.baseUrl ?? ''}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError('NETWORK', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* corps vide */
    }
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
      if (res.status === 401 && path === '/me') this.forget();
      throw new ApiError(e?.code ?? 'HTTP', e?.message ?? `Erreur serveur (${res.status})`);
    }
    return data as T;
  }

  /** Au chargement : vérifie la session enregistrée et ouvre la présence. */
  async init(): Promise<void> {
    this.request<{ passwordRecovery: boolean }>('GET', '/auth/config')
      .then((c) => this.store.setState({ passwordRecovery: c.passwordRecovery }))
      .catch(() => undefined);
    if (!this.token) {
      this.store.setState({ ready: true });
      return;
    }
    try {
      const account = await this.request<AccountPrivate>('GET', '/me');
      this.store.setState({ account, ready: true });
      this.openPresence();
    } catch (e) {
      // Réseau indisponible : on garde le jeton pour réessayer plus tard ; session refusée : déjà oubliée.
      this.store.setState({ ready: true });
      if (!(e instanceof ApiError) || e.code !== 'NETWORK') this.forget();
    }
  }

  private signedIn(res: { token: string; account: AccountPrivate }): AccountPrivate {
    try {
      this.storage?.setItem(KEY, res.token);
    } catch {
      /* navigation privée : la session reste en mémoire */
    }
    this.store.setState({ token: res.token, account: res.account, ready: true });
    this.openPresence();
    return res.account;
  }

  private forget(): void {
    try {
      this.storage?.removeItem(KEY);
    } catch {
      /* rien */
    }
    this.presence?.close();
    this.presence = null;
    this.store.setState({ token: null, account: null });
  }

  register(input: { nickname: string; email: string; password: string; avatar?: string }): Promise<AccountPrivate> {
    return this.request<{ token: string; account: AccountPrivate }>('POST', '/auth/register', input).then((r) => this.signedIn(r));
  }
  login(login: string, password: string): Promise<AccountPrivate> {
    return this.request<{ token: string; account: AccountPrivate }>('POST', '/auth/login', { login, password }).then((r) => this.signedIn(r));
  }
  async logout(): Promise<void> {
    await this.request('POST', '/auth/logout').catch(() => undefined);
    this.forget();
  }
  forgot(email: string): Promise<unknown> {
    return this.request('POST', '/auth/forgot', { email });
  }
  reset(token: string, password: string): Promise<AccountPrivate> {
    return this.request<{ token: string; account: AccountPrivate }>('POST', '/auth/reset', { token, password }).then((r) => this.signedIn(r));
  }

  async updateProfile(patch: { nickname?: string; avatar?: string | null; notifyEmail?: boolean }): Promise<AccountPrivate> {
    const account = await this.request<AccountPrivate>('PATCH', '/me', patch);
    this.store.setState({ account });
    return account;
  }
  async changeEmail(email: string, password: string): Promise<AccountPrivate> {
    const account = await this.request<AccountPrivate>('POST', '/me/email', { email, password });
    this.store.setState({ account });
    return account;
  }
  changePassword(current: string, next: string): Promise<unknown> {
    return this.request('POST', '/me/password', { current, next });
  }

  games = () => this.request<{ games: GameSummary[] }>('GET', '/me/games').then((r) => r.games);
  game = (id: string) => this.request<GameDetail>('GET', `/me/games/${encodeURIComponent(id)}`);
  stats = () => this.request<{ variants: VariantStats[]; games: number; gamesWon: number }>('GET', '/me/stats');
  bankroll = () => this.request<Bankroll>('GET', '/me/bankroll');
  favoriteRounds = () => this.request<{ rounds: FavoriteRound[] }>('GET', '/me/favorite-rounds').then((r) => r.rounds);
  addFavoriteRound = (gameId: string, roundNo: number) => this.request('POST', '/me/favorite-rounds', { gameId, roundNo });
  removeFavoriteRound = (gameId: string, roundNo: number) => this.request('DELETE', `/me/favorite-rounds/${encodeURIComponent(gameId)}/${roundNo}`);
  favorites = () => this.request<{ favorites: FavoritePlayer[] }>('GET', '/me/favorites').then((r) => r.favorites);
  addFavorite = (nickname: string) => this.request<FavoritePlayer>('POST', '/me/favorites', { nickname });
  removeFavorite = (id: string) => this.request('DELETE', `/me/favorites/${encodeURIComponent(id)}`);
  search = (q: string) => this.request<{ users: AccountPublic[] }>('GET', `/users?q=${encodeURIComponent(q)}`).then((r) => r.users);

  /** Présence : signale au serveur que ce joueur est en ligne, et reçoit les connexions de ses favoris. */
  private openPresence(): void {
    if (this.presence || !this.token) return;
    const factory = this.opts.socketFactory ?? ((url, o) => io(url, o));
    const s = factory(`${this.opts.baseUrl ?? ''}/compte`, { auth: { token: this.token }, transports: ['websocket', 'polling'] });
    s.on('favori:en-ligne', (who: AccountPublic) => this.opts.onFavoriteOnline?.(who));
    s.on('fatal', () => this.forget());
    this.presence = s;
  }

  dispose(): void {
    this.presence?.close();
    this.presence = null;
  }
}
