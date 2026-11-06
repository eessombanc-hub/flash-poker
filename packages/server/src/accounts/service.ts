import { randomBytes } from 'node:crypto';
import type { VariantId } from '@poker/engine';
import { z } from 'zod';
import { ServerError } from '../errors';
import type { AccountDb } from './db';
import { mail, type Mailer } from './mailer';
import { hashPassword, newToken, tokenHash, verifyPassword } from './password';
import type { AccountPrivate, AccountPublic, Bankroll, FavoritePlayer, FavoriteRound, FinishedGame, GameDetail, GameSummary, VariantStats } from './types';

// ---------- Validation des entrées ----------
const nickname = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(2, 'Pseudo de 2 à 20 caractères').max(20, 'Pseudo de 2 à 20 caractères').regex(/^[\p{L}\p{N} _.'-]+$/u, 'Pseudo : lettres, chiffres, espace, _ . \' -'));
const email = z.string().transform((s) => s.trim().toLowerCase()).pipe(z.string().email('Adresse e-mail invalide').max(254));
const password = z.string().min(8, 'Mot de passe de 8 caractères au moins').max(128);
const avatar = z.string().regex(/^[a-z0-9_-]{1,32}$/).nullable().optional();

export const registerSchema = z.object({ nickname, email, password, avatar });
export const loginSchema = z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) });
export const profileSchema = z.object({ nickname: nickname.optional(), avatar, notifyEmail: z.boolean().optional() });
export const emailChangeSchema = z.object({ email, password: z.string().min(1).max(128) });
export const passwordChangeSchema = z.object({ current: z.string().min(1).max(128), next: password });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20).max(100), password });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ServerError('BAD_REQUEST', r.error.issues[0]?.message ?? 'Requête invalide');
  return r.data;
}

export type { AccountPrivate, AccountPublic, Bankroll, FavoritePlayer, FavoriteRound, FinishedGame, GameDetail, GameSummary, VariantStats } from './types';

const SESSION_MS = 30 * 24 * 3_600_000;
const RESET_MS = 3_600_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

type Row = Record<string, unknown>;

/**
 * Comptes joueurs : inscription, connexion, profil, historique, statistiques, bankroll, favoris, présence.
 * Les règles du jeu ne sont jamais concernées : tout est calculé à partir des parties terminées.
 */
export class AccountService {
  private online = new Map<string, number>();
  private notifyListeners = new Set<(followerId: string, who: AccountPublic) => void>();

  constructor(
    private readonly store: AccountDb,
    private readonly mailer: Mailer,
    private readonly opts: { appUrl?: string; now?: () => number; log?: (s: string) => void } = {},
  ) {}

  private get db() {
    return this.store.db;
  }
  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }
  get mailEnabled(): boolean {
    return this.mailer.enabled;
  }

  // ---------- Inscription, connexion, sessions ----------

  async register(input: unknown): Promise<{ token: string; account: AccountPrivate }> {
    const data = parse(registerSchema, input);
    if (this.findBy('nickname', data.nickname)) throw new ServerError('NICKNAME_TAKEN', 'Ce pseudo est déjà utilisé par un autre compte');
    if (this.findBy('email', data.email)) throw new ServerError('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail');
    const id = `u_${randomBytes(8).toString('hex')}`;
    this.db
      .prepare('INSERT INTO users (id, nickname, email, pass_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, data.nickname, data.email, await hashPassword(data.password), data.avatar ?? null, this.now());
    return { token: this.openSession(id), account: this.account(id)! };
  }

  async login(input: unknown): Promise<{ token: string; account: AccountPrivate }> {
    const data = parse(loginSchema, input);
    const row = this.findBy(data.login.includes('@') ? 'email' : 'nickname', data.login);
    // Même message et même travail de calcul que le compte existe ou non : rien n'indique lequel des deux est faux.
    const ok = await verifyPassword(data.password, (row?.pass_hash as string | undefined) ?? 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!row || !ok) throw new ServerError('UNAUTHORIZED', 'Pseudo, e-mail ou mot de passe incorrect');
    return { token: this.openSession(row.id as string), account: this.account(row.id as string)! };
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  /** Compte rattaché à une session valide, sinon null. */
  userBySession(token: string | undefined | null): AccountPrivate | null {
    if (!token) return null;
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash(token)) as Row | undefined;
    if (!row) return null;
    if ((row.expires_at as number) < this.now()) {
      this.logout(token);
      return null;
    }
    return this.account(row.user_id as string);
  }

  private openSession(userId: string): string {
    const token = newToken();
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(this.now());
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, this.now() + SESSION_MS);
    return token;
  }

  private findBy(column: 'nickname' | 'email', value: string): Row | undefined {
    return this.db.prepare(`SELECT * FROM users WHERE ${column} = ? COLLATE NOCASE`).get(value) as Row | undefined;
  }

  account(id: string): AccountPrivate | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return r ? { id: r.id as string, nickname: r.nickname as string, avatar: (r.avatar as string | null) ?? null, email: r.email as string, notifyEmail: r.notify_email === 1, createdAt: r.created_at as number } : null;
  }

  /** Un invité ne peut pas emprunter le pseudo d'un compte (usurpation). */
  isReservedNickname(nick: string): boolean {
    return !!this.findBy('nickname', nick.trim());
  }

  // ---------- Profil ----------

  updateProfile(userId: string, input: unknown): AccountPrivate {
    const data = parse(profileSchema, input);
    if (data.nickname !== undefined) {
      const other = this.findBy('nickname', data.nickname);
      if (other && other.id !== userId) throw new ServerError('NICKNAME_TAKEN', 'Ce pseudo est déjà utilisé par un autre compte');
      this.db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(data.nickname, userId);
    }
    if (data.avatar !== undefined) this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(data.avatar, userId);
    if (data.notifyEmail !== undefined) this.db.prepare('UPDATE users SET notify_email = ? WHERE id = ?').run(data.notifyEmail ? 1 : 0, userId);
    return this.account(userId)!;
  }

  async changeEmail(userId: string, input: unknown): Promise<AccountPrivate> {
    const data = parse(emailChangeSchema, input);
    await this.checkPassword(userId, data.password);
    const other = this.findBy('email', data.email);
    if (other && other.id !== userId) throw new ServerError('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail');
    this.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(data.email, userId);
    return this.account(userId)!;
  }

  async changePassword(userId: string, input: unknown, keepToken?: string): Promise<void> {
    const data = parse(passwordChangeSchema, input);
    await this.checkPassword(userId, data.current);
    this.db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(data.next), userId);
    // Les autres appareils sont déconnectés ; celui qui vient de changer le mot de passe reste connecté.
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keepToken ? tokenHash(keepToken) : '');
  }

  private async checkPassword(userId: string, pwd: string): Promise<void> {
    const r = this.db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(userId) as Row | undefined;
    if (!r || !(await verifyPassword(pwd, r.pass_hash as string))) throw new ServerError('UNAUTHORIZED', 'Mot de passe actuel incorrect');
  }

  // ---------- Mot de passe oublié ----------

  /** Toujours la même réponse, que l'adresse corresponde à un compte ou non (aucune adresse n'est révélée). */
  async forgot(input: unknown): Promise<void> {
    if (!this.mailer.enabled) throw new ServerError('UNAVAILABLE', 'La récupération par e-mail n’est pas encore configurée sur ce serveur');
    const { email: address } = parse(forgotSchema, input);
    const row = this.findBy('email', address);
    if (!row) return;
    const token = newToken();
    this.db.prepare('DELETE FROM resets WHERE user_id = ? OR expires_at < ?').run(row.id as string, this.now());
    this.db.prepare('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), row.id as string, this.now() + RESET_MS);
    const url = `${this.opts.appUrl ?? ''}/?reinitialiser=${encodeURIComponent(token)}`;
    await this.safeSend(
      mail(row.email as string, 'Flash Poker : nouveau mot de passe', [
        `Bonjour ${row.nickname as string},`,
        'Vous avez demandé à changer le mot de passe de votre compte Flash Poker. Ce lien est valable une heure et ne sert qu’une fois.',
        'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail : votre mot de passe reste inchangé.',
      ], { label: 'Choisir un nouveau mot de passe', url }),
    );
  }

  async reset(input: unknown): Promise<{ token: string; account: AccountPrivate }> {
    const data = parse(resetSchema, input);
    const row = this.db.prepare('SELECT user_id, expires_at FROM resets WHERE token_hash = ?').get(tokenHash(data.token)) as Row | undefined;
    if (!row || (row.expires_at as number) < this.now()) throw new ServerError('UNAUTHORIZED', 'Lien expiré ou déjà utilisé : refaites une demande');
    const userId = row.user_id as string;
    this.db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(data.password), userId);
    this.db.prepare('DELETE FROM resets WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return { token: this.openSession(userId), account: this.account(userId)! };
  }

  private async safeSend(message: Parameters<Mailer['send']>[0]): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (e) {
      (this.opts.log ?? console.error)(`[e-mail] échec d'envoi à ${message.to} : ${String(e)}`);
    }
  }

  // ---------- Parties terminées : archive, historique, statistiques, bankroll ----------

  recordGame(g: FinishedGame): void {
    const members = g.players.filter((p) => p.accountId && g.seated.includes(p.playerId));
    if (members.length === 0) return;
    const id = `${g.code}-${g.endedAt}`;
    this.db.prepare('INSERT OR IGNORE INTO games (id, ended_at, data) VALUES (?, ?, ?)').run(id, g.endedAt, JSON.stringify(g));
    for (const m of members) {
      if (!this.account(m.accountId!)) continue;
      const net = (g.outcome.settlement.payouts[m.playerId] ?? 0) - g.stakeCents;
      this.db
        .prepare('INSERT OR IGNORE INTO user_games (user_id, game_id, player_id, net_cents, won, ended_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(m.accountId!, id, m.playerId, net, g.outcome.winner === m.playerId ? 1 : 0, g.endedAt);
    }
  }

  private myGames(userId: string, limit = 500): { game: FinishedGame; id: string; playerId: string; net: number; won: boolean }[] {
    const rows = this.db
      .prepare('SELECT ug.game_id, ug.player_id, ug.net_cents, ug.won, g.data FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.user_id = ? ORDER BY ug.ended_at DESC LIMIT ?')
      .all(userId, limit) as Row[];
    return rows.map((r) => ({ id: r.game_id as string, playerId: r.player_id as string, net: r.net_cents as number, won: r.won === 1, game: JSON.parse(r.data as string) as FinishedGame }));
  }

  games(userId: string, limit = 50): GameSummary[] {
    return this.myGames(userId, limit).map(({ id, game, playerId, net, won }) => ({
      id,
      name: game.name,
      endedAt: game.endedAt,
      won,
      netCents: net,
      rounds: game.history.length,
      opponents: game.players.filter((p) => p.playerId !== playerId && game.seated.includes(p.playerId)).map((p) => p.nickname),
      winnerNickname: game.players.find((p) => p.playerId === game.outcome.winner)?.nickname ?? '—',
    }));
  }

  /** Détail d'une partie, réservé à ceux qui y ont joué. */
  game(userId: string, gameId: string): GameDetail {
    const row = this.db.prepare('SELECT ug.player_id, g.data FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.user_id = ? AND ug.game_id = ?').get(userId, gameId) as Row | undefined;
    if (!row) throw new ServerError('NOT_FOUND', 'Partie introuvable');
    const favs = (this.db.prepare('SELECT round_no FROM fav_rounds WHERE user_id = ? AND game_id = ?').all(userId, gameId) as Row[]).map((r) => r.round_no as number);
    return { ...(JSON.parse(row.data as string) as FinishedGame), you: row.player_id as string, favoriteRounds: favs };
  }

  /** Par variante : manches jouées, manches gagnées, points marqués. */
  stats(userId: string): { variants: VariantStats[]; games: number; gamesWon: number } {
    const by = new Map<VariantId, VariantStats>();
    const mine = this.myGames(userId);
    for (const { game, playerId } of mine) {
      for (const r of game.history) {
        if (!(playerId in r.points)) continue; // pas encore assis à cette manche
        const s = by.get(r.variant) ?? { variant: r.variant, played: 0, won: 0, points: 0 };
        s.played++;
        const winner = r.award.kind === 'POINTS' || r.award.kind === 'INSTANT_VICTORY' ? r.award.winner : null;
        if (winner === playerId) s.won++;
        s.points += r.points[playerId] ?? 0;
        by.set(r.variant, s);
      }
    }
    return { variants: [...by.values()].sort((a, b) => b.played - a.played), games: mine.length, gamesWon: mine.filter((g) => g.won).length };
  }

  /** Bilan des parties : gains moins mises, partie après partie (cagnotte virtuelle, assurances comprises). */
  bankroll(userId: string): Bankroll {
    const rows = this.db
      .prepare('SELECT ug.net_cents, ug.ended_at, g.data FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.user_id = ? ORDER BY ug.ended_at ASC')
      .all(userId) as Row[];
    let cumulative = 0;
    const series = rows.map((r) => {
      cumulative += r.net_cents as number;
      return { endedAt: r.ended_at as number, netCents: r.net_cents as number, cumulativeCents: cumulative, name: (JSON.parse(r.data as string) as FinishedGame).name };
    });
    return { totalCents: cumulative, games: rows.length, series };
  }

  // ---------- Manches favorites ----------

  addFavoriteRound(userId: string, gameId: string, roundNo: number): void {
    const g = this.game(userId, gameId); // vérifie la participation
    if (!g.history.some((r) => r.roundNo === roundNo)) throw new ServerError('NOT_FOUND', 'Manche introuvable');
    this.db.prepare('INSERT OR IGNORE INTO fav_rounds (user_id, game_id, round_no, created_at) VALUES (?, ?, ?, ?)').run(userId, gameId, roundNo, this.now());
  }
  removeFavoriteRound(userId: string, gameId: string, roundNo: number): void {
    this.db.prepare('DELETE FROM fav_rounds WHERE user_id = ? AND game_id = ? AND round_no = ?').run(userId, gameId, roundNo);
  }
  favoriteRounds(userId: string): FavoriteRound[] {
    const rows = this.db
      .prepare('SELECT f.game_id, f.round_no, ug.player_id, g.data FROM fav_rounds f JOIN games g ON g.id = f.game_id JOIN user_games ug ON ug.game_id = f.game_id AND ug.user_id = f.user_id WHERE f.user_id = ? ORDER BY f.created_at DESC')
      .all(userId) as Row[];
    return rows.flatMap((r) => {
      const game = JSON.parse(r.data as string) as FinishedGame;
      const round = game.history.find((h) => h.roundNo === r.round_no);
      return round ? [{ gameId: r.game_id as string, gameName: game.name, endedAt: game.endedAt, you: r.player_id as string, players: game.players, round }] : [];
    });
  }

  // ---------- Joueurs favoris et présence ----------

  search(userId: string, q: string): AccountPublic[] {
    const term = q.trim();
    if (term.length < 2) return [];
    const like = `${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return (this.db.prepare("SELECT id, nickname, avatar FROM users WHERE nickname LIKE ? ESCAPE '\\' AND id != ? ORDER BY nickname LIMIT 10").all(like, userId) as Row[]).map(pubRow);
  }

  addFavorite(userId: string, input: unknown): FavoritePlayer {
    const { nickname: nick } = parse(z.object({ nickname: z.string().trim().min(1).max(20) }), input);
    const row = this.findBy('nickname', nick);
    if (!row) throw new ServerError('NOT_FOUND', 'Aucun joueur inscrit sous ce pseudo');
    if (row.id === userId) throw new ServerError('BAD_REQUEST', 'Vous ne pouvez pas vous ajouter vous-même');
    this.db.prepare('INSERT OR IGNORE INTO fav_players (user_id, fav_id, created_at) VALUES (?, ?, ?)').run(userId, row.id as string, this.now());
    return { ...pubRow(row), online: this.isOnline(row.id as string) };
  }
  removeFavorite(userId: string, favId: string): void {
    this.db.prepare('DELETE FROM fav_players WHERE user_id = ? AND fav_id = ?').run(userId, favId);
  }
  favorites(userId: string): FavoritePlayer[] {
    return (this.db.prepare('SELECT u.id, u.nickname, u.avatar FROM fav_players f JOIN users u ON u.id = f.fav_id WHERE f.user_id = ? ORDER BY u.nickname').all(userId) as Row[]).map((r) => ({
      ...pubRow(r),
      online: this.isOnline(r.id as string),
    }));
  }

  isOnline(userId: string): boolean {
    return (this.online.get(userId) ?? 0) > 0;
  }

  /** Notification dans l'application : (joueur à prévenir, favori qui vient de se connecter). */
  onFavoriteOnline(listener: (followerId: string, who: AccountPublic) => void): () => void {
    this.notifyListeners.add(listener);
    return () => this.notifyListeners.delete(listener);
  }

  /**
   * Un appareil du joueur se connecte. À la première connexion (aucun autre appareil déjà connecté), ceux qui
   * l'ont en favori sont prévenus : dans l'application s'ils y sont, sinon par e-mail (s'ils l'acceptent),
   * au plus une fois par jour et par favori. Renvoie la fonction à appeler à la déconnexion.
   */
  connect(userId: string): () => void {
    const before = this.online.get(userId) ?? 0;
    this.online.set(userId, before + 1);
    if (before === 0) void this.announce(userId);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.online.get(userId) ?? 1) - 1;
      if (n <= 0) this.online.delete(userId);
      else this.online.set(userId, n);
    };
  }

  private async announce(userId: string): Promise<void> {
    const me = this.account(userId);
    if (!me) return;
    const who: AccountPublic = { id: me.id, nickname: me.nickname, avatar: me.avatar };
    const followers = this.db.prepare('SELECT u.id, u.nickname, u.email, u.notify_email FROM fav_players f JOIN users u ON u.id = f.user_id WHERE f.fav_id = ?').all(userId) as Row[];
    for (const f of followers) {
      const followerId = f.id as string;
      if (this.isOnline(followerId)) {
        for (const l of this.notifyListeners) l(followerId, who);
        continue;
      }
      if (f.notify_email !== 1 || !this.mailer.enabled) continue;
      const today = day(this.now());
      const sent = this.db.prepare('INSERT OR IGNORE INTO notify_log (user_id, fav_id, day) VALUES (?, ?, ?)').run(followerId, userId, today);
      if (Number(sent.changes) === 0) continue; // déjà prévenu aujourd'hui pour ce favori
      await this.safeSend(
        mail(f.email as string, `${me.nickname} est en ligne sur Flash Poker`, [
          `Bonjour ${f.nickname as string},`,
          `${me.nickname}, l’un de vos joueurs favoris, vient de se connecter à Flash Poker.`,
          'Vous recevez au plus un message par jour et par favori. Pour ne plus en recevoir : Mon espace, onglet Profil, « Alertes par e-mail ».',
        ], this.opts.appUrl ? { label: 'Ouvrir Flash Poker', url: this.opts.appUrl } : undefined),
      );
    }
  }
}

const pubRow = (r: Row): AccountPublic => ({ id: r.id as string, nickname: r.nickname as string, avatar: (r.avatar as string | null) ?? null });
