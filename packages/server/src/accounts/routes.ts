import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { z } from 'zod';
import { ServerError } from '../errors';
import { RateLimiter } from '../rateLimiter';
import type { AccountPrivate, AccountService } from './service';

export interface AccountRouteOptions {
  now?: () => number;
  /** Inscription, connexion, mot de passe oublié : tentatives par adresse IP (20 par quart d'heure par défaut). */
  authRateLimit?: { max: number; windowMs: number };
}

/** Jeton de compte transmis par l'en-tête `Authorization: Bearer …`. */
export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

/** Compte connecté pour cette requête, ou null (invité). Un jeton invalide n'est pas une erreur : on joue en invité. */
export function optionalAccount(accounts: AccountService, req: FastifyRequest): AccountPrivate | null {
  return accounts.userBySession(bearer(req));
}

const roundParams = z.object({ gameId: z.string().min(1).max(80), roundNo: z.coerce.number().int().min(1).max(10_000) });

export function registerAccountRoutes(app: FastifyInstance, accounts: AccountService, opts: AccountRouteOptions = {}): void {
  const now = opts.now ?? Date.now;
  const auth = new RateLimiter(opts.authRateLimit?.max ?? 20, opts.authRateLimit?.windowMs ?? 15 * 60_000, now);
  const perUser = new RateLimiter(120, 60_000, now);

  const guard = (kind: string, ip: string): void => {
    if (!auth.hit(`${kind}:${ip}`)) throw new ServerError('RATE_LIMITED', 'Trop de tentatives, réessayez dans quelques minutes');
  };
  const me = (req: FastifyRequest): AccountPrivate => {
    const account = accounts.userBySession(bearer(req));
    if (!account) throw new ServerError('UNAUTHORIZED', 'Connectez-vous pour accéder à votre espace');
    if (!perUser.hit(account.id)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    return account;
  };

  // ---------- Connexion ----------
  app.get('/auth/config', async () => ({ passwordRecovery: accounts.mailEnabled }));
  app.post('/auth/register', async (req, reply) => {
    guard('register', req.ip);
    return reply.status(201).send(await accounts.register(req.body));
  });
  app.post('/auth/login', async (req) => {
    guard('login', req.ip);
    return accounts.login(req.body);
  });
  app.post('/auth/logout', async (req) => {
    const t = bearer(req);
    if (t) accounts.logout(t);
    return { ok: true };
  });
  app.post('/auth/forgot', async (req) => {
    guard('forgot', req.ip);
    await accounts.forgot(req.body);
    return { ok: true };
  });
  app.post('/auth/reset', async (req) => {
    guard('reset', req.ip);
    return accounts.reset(req.body);
  });

  // ---------- Mon espace ----------
  app.get('/me', async (req) => me(req));
  app.patch('/me', async (req) => accounts.updateProfile(me(req).id, req.body));
  app.post('/me/email', async (req) => {
    const account = me(req);
    guard('email', req.ip);
    return accounts.changeEmail(account.id, req.body);
  });
  app.post('/me/password', async (req) => {
    const account = me(req);
    guard('password', req.ip);
    await accounts.changePassword(account.id, req.body, bearer(req) ?? undefined);
    return { ok: true };
  });

  app.get('/me/games', async (req) => ({ games: accounts.games(me(req).id) }));
  app.get<{ Params: { id: string } }>('/me/games/:id', async (req) => accounts.game(me(req).id, req.params.id));
  app.get('/me/stats', async (req) => accounts.stats(me(req).id));
  app.get('/me/bankroll', async (req) => accounts.bankroll(me(req).id));

  app.get('/me/favorite-rounds', async (req) => ({ rounds: accounts.favoriteRounds(me(req).id) }));
  app.post('/me/favorite-rounds', async (req, reply) => {
    const account = me(req);
    const p = roundParams.safeParse(req.body);
    if (!p.success) throw new ServerError('BAD_REQUEST', 'Manche invalide');
    accounts.addFavoriteRound(account.id, p.data.gameId, p.data.roundNo);
    return reply.status(201).send({ ok: true });
  });
  app.delete<{ Params: { gameId: string; roundNo: string } }>('/me/favorite-rounds/:gameId/:roundNo', async (req) => {
    const account = me(req);
    const p = roundParams.safeParse(req.params);
    if (!p.success) throw new ServerError('BAD_REQUEST', 'Manche invalide');
    accounts.removeFavoriteRound(account.id, p.data.gameId, p.data.roundNo);
    return { ok: true };
  });

  app.get('/me/favorites', async (req) => ({ favorites: accounts.favorites(me(req).id) }));
  app.post('/me/favorites', async (req, reply) => reply.status(201).send(accounts.addFavorite(me(req).id, req.body)));
  app.delete<{ Params: { id: string } }>('/me/favorites/:id', async (req) => {
    accounts.removeFavorite(me(req).id, req.params.id);
    return { ok: true };
  });
  app.get<{ Querystring: { q?: string } }>('/users', async (req) => ({ users: accounts.search(me(req).id, String(req.query.q ?? '').slice(0, 20)) }));
}

/**
 * Présence des joueurs inscrits : un socket par appareil, sur l'espace de noms `/compte`, authentifié par le
 * jeton de compte. Il sert à savoir qui est en ligne et à prévenir chacun quand un de ses favoris se connecte.
 */
export function registerPresence(io: IOServer, accounts: AccountService): void {
  const nsp = io.of('/compte');
  accounts.onFavoriteOnline((followerId, who) => {
    nsp.to(`u:${followerId}`).emit('favori:en-ligne', { id: who.id, nickname: who.nickname, avatar: who.avatar });
  });
  nsp.on('connection', (socket) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const account = typeof token === 'string' ? accounts.userBySession(token) : null;
    if (!account) {
      socket.emit('fatal', { code: 'UNAUTHORIZED', message: 'Session expirée' });
      socket.disconnect(true);
      return;
    }
    void socket.join(`u:${account.id}`);
    const release = accounts.connect(account.id);
    socket.on('disconnect', release);
  });
}
