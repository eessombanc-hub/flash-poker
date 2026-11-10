import { io, type Socket } from 'socket.io-client';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ApiError } from './api';
import type { BjTableDto, BjTableReply, SeatKind, BjAction, BjActive, BjHistoryItem, BjLeaderboardEntry, BjLeaderboardKind, BjOverview, BjResult, Advice, Odds, TableRules } from './types';
import type { AiLevel, ColumnHand, TableauVariant, TbGameDto, TbHistoryEntry, TbLeaderboardRow, TbMode, TbProfileDto, TbStatus } from './types';
import type { AccountPrivate, AccountPublic, Bankroll, FavoritePlayer, Wallet, FavoriteRound, GameDetail, GameSummary, InviteOverview, VariantStats } from './types';

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

  private async request<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
    const headers: Record<string, string> = { ...extra };
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
      const e = (data as { error?: { code?: string; message?: string; ruleCode?: string } } | null)?.error;
      if (res.status === 401 && path === '/me' && method === 'GET') this.forget();
      throw new ApiError(e?.code ?? 'HTTP', e?.message ?? `Erreur serveur (${res.status})`, (e as { ruleCode?: string } | undefined)?.ruleCode);
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

  register(input: { nickname: string; email: string; password: string; avatar?: string; invite?: string }): Promise<AccountPrivate> {
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

  /** Copie de toutes les données du compte (droit d'accès et de portabilité). */
  exportData(): Promise<unknown> {
    return this.request('GET', '/me/export');
  }
  /** Suppression définitive du compte, après confirmation par le mot de passe. */
  async deleteAccount(password: string): Promise<void> {
    await this.request('DELETE', '/me', { password });
    this.forget();
  }

  games = () => this.request<{ games: GameSummary[] }>('GET', '/me/games').then((r) => r.games);
  game = (id: string) => this.request<GameDetail>('GET', `/me/games/${encodeURIComponent(id)}`);
  stats = () => this.request<{ variants: VariantStats[]; games: number; gamesWon: number }>('GET', '/me/stats');
  wallet = () => this.request<Wallet>('GET', '/me/wallet');
  bankroll = () => this.request<Bankroll>('GET', '/me/bankroll');
  // ----- Blackjack -----
  /** Code d'invité : aléatoire, créé une fois et conservé dans ce navigateur (le Blackjack se joue sans compte). */
  guestId(): string {
    const KEY_G = 'poker.bj.guest.v1';
    try {
      const cur = this.storage?.getItem(KEY_G);
      if (cur && /^[a-f0-9]{32}$/.test(cur)) return cur;
    } catch {
      /* stockage indisponible */
    }
    const bytes = new Uint8Array(16);
    (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
    const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    try {
      this.storage?.setItem(KEY_G, id);
    } catch {
      /* ignoré : l'invité recommencera avec un nouveau profil */
    }
    return id;
  }
  private bj<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request<T>(method, path, body, { 'x-bj-guest': this.guestId() });
  }
  // ----- Le Tableau -----
  tbCreate = (input: { mode: 'training' | 'friendly' | 'ranked'; level?: AiLevel; variant?: TableauVariant; nickname?: string }) => this.bj<TbGameDto>('POST', '/tableau/games', input);
  tbGet = (code: string) => this.bj<TbGameDto>('GET', `/tableau/games/${encodeURIComponent(code)}`);
  tbJoin = (code: string, nickname?: string) => this.bj<TbGameDto>('POST', `/tableau/games/${encodeURIComponent(code)}/join`, { nickname });
  tbPlace = (code: string, col: number, card?: string) => this.bj<TbGameDto>('POST', `/tableau/games/${encodeURIComponent(code)}/place`, { col, card });
  tbAdvice = (code: string) => this.bj<{ col: number; card: string; kind: 'improve' | 'empty' | 'dump'; after: ColumnHand | null; text: string }>('GET', `/tableau/games/${encodeURIComponent(code)}/advice`);
  tbLeave = (code: string) => this.bj<{ left: true; forfeit: boolean }>('POST', `/tableau/games/${encodeURIComponent(code)}/leave`, {});
  tbActive = () => this.bj<{ active: { code: string; mode: TbMode; status: TbStatus } | null }>('GET', '/me/tableau/active').then((r) => r.active);
  tbProfile = (variant: TableauVariant) => this.bj<{ profile: TbProfileDto }>('GET', `/me/tableau/profile?variant=${variant}`).then((r) => r.profile);
  tbLeaderboard = (variant: TableauVariant) => this.bj<{ leaderboard: TbLeaderboardRow[] }>('GET', `/tableau/leaderboard?variant=${variant}`).then((r) => r.leaderboard);
  tbHistory = () => this.bj<{ history: TbHistoryEntry[] }>('GET', '/me/tableau/history').then((r) => r.history);
  blackjack = () => this.bj<BjOverview>('GET', '/me/blackjack');
  // ----- Tables à plusieurs -----
  bjTableCreate = (input: { table: string; seats: SeatKind[]; bet?: number; rules?: TableRules; nickname?: string }) => this.bj<BjTableDto>('POST', '/blackjack/tables', input);
  bjTableGet = (code: string, version?: number) => this.bj<BjTableReply>('GET', `/blackjack/tables/${encodeURIComponent(code)}${version === undefined ? '' : `?v=${version}`}`);
  bjTableJoin = (code: string, nickname?: string) => this.bj<BjTableDto>('POST', `/blackjack/tables/${encodeURIComponent(code)}/join`, { nickname });
  bjTableLeave = (code: string) => this.bj<{ left: true }>('POST', `/blackjack/tables/${encodeURIComponent(code)}/leave`, {});
  bjTableStart = (code: string) => this.bj<BjTableDto>('POST', `/blackjack/tables/${encodeURIComponent(code)}/start`, {});
  bjTableBet = (code: string, bet: number) => this.bj<BjTableDto>('POST', `/blackjack/tables/${encodeURIComponent(code)}/bet`, { bet });
  bjTableAct = (code: string, action: BjAction) => this.bj<BjTableDto>('POST', `/blackjack/tables/${encodeURIComponent(code)}/action`, { action });
  bjTableNext = (code: string) => this.bj<BjTableDto>('POST', `/blackjack/tables/${encodeURIComponent(code)}/next`, {});
  bjTableHelp = (code: string) => this.bj<{ advice: Advice | null; odds: Odds }>('GET', `/blackjack/tables/${encodeURIComponent(code)}/help`);
  blackjackHistory = () => this.bj<{ history: BjHistoryItem[] }>('GET', '/me/blackjack/history').then((r) => r.history);
  blackjackStart = (input: { table: string; bet: number; rules?: TableRules }) => this.bj<{ active: BjActive; result: BjResult | null }>('POST', '/me/blackjack/round', input);
  blackjackAct = (action: BjAction) => this.bj<{ active: BjActive; result: BjResult | null }>('POST', '/me/blackjack/action', { action });
  blackjackHelp = () => this.bj<{ advice: Advice | null; odds: Odds }>('GET', '/me/blackjack/help');
  blackjackLeaderboard = (by: BjLeaderboardKind) => this.request<{ entries: BjLeaderboardEntry[] }>('GET', `/blackjack/leaderboard?by=${by}`).then((r) => r.entries);
  favoriteRounds = () => this.request<{ rounds: FavoriteRound[] }>('GET', '/me/favorite-rounds').then((r) => r.rounds);
  addFavoriteRound = (gameId: string, roundNo: number) => this.request('POST', '/me/favorite-rounds', { gameId, roundNo });
  removeFavoriteRound = (gameId: string, roundNo: number) => this.request('DELETE', `/me/favorite-rounds/${encodeURIComponent(gameId)}/${roundNo}`);
  favorites = () => this.request<{ favorites: FavoritePlayer[] }>('GET', '/me/favorites').then((r) => r.favorites);
  addFavorite = (nickname: string) => this.request<FavoritePlayer>('POST', '/me/favorites', { nickname });
  removeFavorite = (id: string) => this.request('DELETE', `/me/favorites/${encodeURIComponent(id)}`);
  invites = () => this.request<InviteOverview>('GET', '/me/invites');
  inviteByEmail = (email: string) => this.request<InviteOverview>('POST', '/me/invites', { email });
  /** Qui invite (lien reçu) : accessible sans compte. */
  inviteInfo = (code: string) => this.request<{ inviter: AccountPublic }>('GET', `/invites/${encodeURIComponent(code)}`).then((r) => r.inviter);
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
