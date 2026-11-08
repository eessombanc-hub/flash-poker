import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ServerError } from '../errors';
import { bearer } from '../accounts/routes';
import { RateLimiter } from '../rateLimiter';
import type { AccountService } from '../accounts/service';
import type { TableauService } from './service';

const nick = z.string().transform((v) => v.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20));
const createSchema = z.object({
  mode: z.enum(['training', 'friendly']),
  level: z.enum(['beginner', 'intermediate', 'expert']).optional(),
  variant: z.enum(['classic', 'hand5']).optional(),
  nickname: nick.optional(),
});

/**
 * Routes du Tableau. Joueur = compte connecté, sinon invité identifié par l'en-tête `x-bj-guest` (même identifiant
 * aléatoire que le Blackjack). Les parties amicales se partagent par code (TB-XXXX).
 */
export function registerTableauRoutes(app: FastifyInstance, tb: TableauService, accounts: AccountService, opts: { now?: () => number } = {}): void {
  const perUser = new RateLimiter(300, 60_000, opts.now ?? Date.now);
  const perIp = new RateLimiter(900, 60_000, opts.now ?? Date.now);
  const identity = (req: FastifyRequest): { userId: string; account: boolean; nickname: string | null; avatar: string | null } => {
    if (!perIp.hit(req.ip)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    const account = accounts.userBySession(bearer(req));
    const guest = req.headers['x-bj-guest'];
    if (account) return { userId: account.id, account: true, nickname: account.nickname, avatar: account.avatar ?? null };
    if (typeof guest === 'string' && /^[a-f0-9]{32}$/.test(guest)) return { userId: `guest:${guest}`, account: false, nickname: null, avatar: null };
    throw new ServerError('BAD_REQUEST', 'Identifiant de joueur manquant');
  };
  const me = (req: FastifyRequest, nickname?: string) => {
    const m = identity(req);
    if (!perUser.hit(m.userId)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    return { userId: m.userId, nickname: m.nickname ?? (nickname && nickname.length > 0 ? nickname : 'Invité'), avatar: m.avatar };
  };
  const code = (req: FastifyRequest): string => String((req.params as { code: string }).code).slice(0, 12);

  app.post('/tableau/games', async (req, reply) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) throw new ServerError('BAD_REQUEST', 'Partie invalide');
    return reply.status(201).send(tb.create(me(req, p.data.nickname), { mode: p.data.mode, level: p.data.level, variant: p.data.variant }));
  });
  app.get('/me/tableau/active', async (req) => ({ active: tb.activeCode(me(req).userId) }));
  app.get('/me/tableau/history', async (req) => ({ history: tb.history(me(req).userId) }));
  app.get<{ Params: { code: string } }>('/tableau/games/:code', async (req) => tb.get(code(req), me(req).userId));
  app.post<{ Params: { code: string } }>('/tableau/games/:code/join', async (req) => {
    const body = z.object({ nickname: nick.optional() }).safeParse(req.body ?? {});
    return tb.join(code(req), me(req, body.success ? body.data.nickname : undefined));
  });
  app.post<{ Params: { code: string } }>('/tableau/games/:code/place', async (req) => {
    const p = z.object({ col: z.number().int().min(0).max(4), card: z.string().regex(/^[2-9TJQKA][cdhs]$/).optional() }).safeParse(req.body);
    if (!p.success) throw new ServerError('BAD_REQUEST', 'Colonne invalide');
    return tb.place(code(req), me(req).userId, p.data.col, p.data.card);
  });
  app.get<{ Params: { code: string } }>('/tableau/games/:code/advice', async (req) => tb.advice(code(req), me(req).userId));
  app.post<{ Params: { code: string } }>('/tableau/games/:code/leave', async (req) => tb.leave(code(req), me(req).userId));
}
