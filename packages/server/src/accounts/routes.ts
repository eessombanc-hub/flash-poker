import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import { z } from 'zod';
import { ServerError } from '../errors';
import { RateLimiter } from '../rateLimiter';
import { AVATAR_IMAGE_MAX_BYTES } from './avatarImage';
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
  // Échecs de connexion par compte visé (en plus de la limite par adresse) : freine les essais répartis sur plusieurs IP.
  const failedLogins = new RateLimiter(10, 15 * 60_000, now);

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
  app.get('/auth/config', async () => ({ passwordRecovery: accounts.mailEnabled, recoveryCode: true }));
  app.post('/auth/register', async (req, reply) => {
    guard('register', req.ip);
    return reply.status(201).send(await accounts.register(req.body));
  });
  app.post('/auth/login', async (req) => {
    guard('login', req.ip);
    const who = String((req.body as { login?: unknown } | null)?.login ?? '').trim().toLowerCase().slice(0, 254);
    if (who && !failedLogins.allows(who)) throw new ServerError('RATE_LIMITED', 'Trop de tentatives sur ce compte, réessayez dans quelques minutes');
    try {
      const r = await accounts.login(req.body);
      failedLogins.clear(who);
      return r;
    } catch (e) {
      if (who && e instanceof ServerError && e.code === 'UNAUTHORIZED') failedLogins.hit(who);
      throw e;
    }
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
  // Récupération sans e-mail : limite par adresse, puis par compte visé (les échecs seuls comptent).
  const failedCodes = new RateLimiter(5, 60 * 60_000, now);
  app.post('/auth/recover', async (req) => {
    guard('recover', req.ip);
    const who = String((req.body as { login?: unknown } | null)?.login ?? '').trim().toLowerCase().slice(0, 254);
    if (who && !failedCodes.allows(who)) throw new ServerError('RATE_LIMITED', 'Trop d’essais sur ce compte, réessayez dans une heure');
    try {
      const r = await accounts.resetWithCode(req.body);
      failedCodes.clear(who);
      return r;
    } catch (e) {
      if (who && e instanceof ServerError && e.code === 'UNAUTHORIZED') failedCodes.hit(who);
      throw e;
    }
  });
  app.post('/auth/reset', async (req) => {
    guard('reset', req.ip);
    return accounts.reset(req.body);
  });

  // ---------- Mon espace ----------
  app.get('/me', async (req) => me(req));
  app.patch('/me', async (req) => accounts.updateProfile(me(req).id, req.body));
  // ---------- Photo de profil ----------
  // Le navigateur envoie un JPEG déjà recadré (128 × 128). Corps binaire borné, 5 envois par quart d'heure et par compte.
  const uploads = new RateLimiter(5, 15 * 60_000, now);
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: AVATAR_IMAGE_MAX_BYTES }, (_req, body, done) => done(null, body));
  app.post('/me/avatar-image', { bodyLimit: AVATAR_IMAGE_MAX_BYTES }, async (req) => {
    const account = me(req);
    if (!uploads.hit(account.id)) throw new ServerError('RATE_LIMITED', 'Trop d’envois de photo, réessayez dans quelques minutes');
    return accounts.setAvatarImage(account.id, req.body);
  });
  // Lecture publique : les autres joueurs voient la photo sans jeton. L'adresse contient un identifiant qui ne se devine pas
  // et le contenu ne change jamais pour une adresse donnée, d'où le cache long.
  app.get<{ Params: { file: string } }>('/avatars/:file', async (req, reply) => {
    const m = /^(i[0-9a-f]{16})\.jpg$/.exec(req.params.file);
    const data = m ? accounts.avatarImage(m[1]!) : null;
    if (!data) throw new ServerError('NOT_FOUND', 'Photo introuvable');
    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(Buffer.from(data));
  });

  app.post('/me/email', async (req) => {
    const account = me(req);
    guard('email', req.ip);
    return accounts.changeEmail(account.id, req.body);
  });
  app.get('/me/rankings', async (req) => accounts.rankings(me(req).id, req.query));
  app.get('/me/recovery-code', async (req) => ({ exists: accounts.hasRecoveryCode(me(req).id) }));
  app.post('/me/recovery-code', async (req) => {
    const account = me(req);
    guard('password', req.ip);
    return accounts.regenerateRecoveryCode(account.id, req.body);
  });
  app.post('/me/password', async (req) => {
    const account = me(req);
    guard('password', req.ip);
    await accounts.changePassword(account.id, req.body, bearer(req) ?? undefined);
    return { ok: true };
  });

  app.get('/me/export', async (req, reply) => {
    const data = accounts.exportData(me(req).id);
    return reply
      .header('content-disposition', 'attachment; filename="flash-poker-mes-donnees.json"')
      .header('cache-control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(data, null, 2));
  });
  app.delete('/me', async (req) => {
    const account = me(req);
    guard('delete', req.ip);
    await accounts.deleteAccount(account.id, req.body);
    return { ok: true };
  });

  app.get('/me/games', async (req) => ({ games: accounts.games(me(req).id) }));
  app.get<{ Params: { id: string } }>('/me/games/:id', async (req) => accounts.game(me(req).id, req.params.id));
  app.get('/me/stats', async (req) => accounts.stats(me(req).id));
  app.get('/me/engagement', async (req) => accounts.engagement(me(req).id));
  app.get('/me/progression', async (req) => accounts.progression(me(req).id));
  app.get('/me/xp-ranking', async (req) => accounts.xpRanking(me(req).id));
  app.get('/me/rewards', async (req) => accounts.rewards(me(req).id));
  app.post('/me/rewards/equip', async (req) => accounts.equip(me(req).id, req.body));
  app.get('/me/leaderboard', async (req) => ({ rows: accounts.leaderboard(me(req).id) }));
  app.get('/me/wallet', async (req) => accounts.wallet(me(req).id));
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
  app.get('/me/invites', async (req) => accounts.invites(me(req).id));
  app.post('/me/invites', async (req, reply) => {
    const account = me(req);
    guard('invite', req.ip);
    return reply.status(201).send(await accounts.inviteByEmail(account.id, req.body));
  });
  app.get<{ Params: { code: string } }>('/invites/:code', async (req) => {
    guard('invite-info', req.ip); // freine l'énumération des codes
    return accounts.inviteInfo(String(req.params.code).slice(0, 40));
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
