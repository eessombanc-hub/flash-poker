import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FREE_TABLE_ID } from '@poker/engine';
import { ServerError } from '../errors';
import { bearer } from '../accounts/routes';
import { RateLimiter } from '../rateLimiter';
import type { AccountPrivate, AccountService } from '../accounts/service';
import type { BlackjackService } from './service';

const rulesSchema = z.object({
  decks: z.number().int().min(1).max(8),
  dealerHitsSoft17: z.boolean(),
  blackjackPays: z.enum(['3:2', '6:5']),
  doubleOn: z.enum(['any', '9-11', '10-11']),
  doubleAfterSplit: z.boolean(),
  maxHands: z.number().int().min(2).max(4),
  resplitAces: z.boolean(),
  surrender: z.boolean(),
});
const startSchema = z.object({ table: z.string().min(1).max(40), rules: rulesSchema.optional(), bet: z.number().int().min(1).max(1_000_000) });
const actionSchema = z.object({ action: z.enum(['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER']) });

/** Routes du Blackjack : toutes réservées aux comptes connectés, sauf le classement et la liste des tables. */
export function registerBlackjackRoutes(app: FastifyInstance, bj: BlackjackService, accounts: AccountService, opts: { now?: () => number } = {}): void {
  const perUser = new RateLimiter(240, 60_000, opts.now ?? Date.now);
  const me = (req: FastifyRequest): AccountPrivate => {
    const account = accounts.userBySession(bearer(req));
    if (!account) throw new ServerError('UNAUTHORIZED', 'Connectez-vous pour jouer au Blackjack');
    if (!perUser.hit(account.id)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    return account;
  };

  app.get('/me/blackjack', async (req) => bj.overview(me(req).id));
  app.get('/me/blackjack/history', async (req) => ({ history: bj.history(me(req).id, 50) }));
  app.post('/me/blackjack/round', async (req, reply) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) throw new ServerError('BAD_REQUEST', 'Mise ou règles invalides');
    const { table, rules, bet } = parsed.data;
    if (table !== FREE_TABLE_ID && rules) throw new ServerError('BAD_REQUEST', 'Les règles ne se modifient que sur la table libre');
    return reply.status(201).send(bj.startRound(me(req).id, { table, rules, bet }));
  });
  app.post('/me/blackjack/action', async (req) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) throw new ServerError('BAD_REQUEST', 'Action inconnue');
    return bj.act(me(req).id, parsed.data.action);
  });
  app.get('/me/blackjack/help', async (req) => bj.help(me(req).id));
  app.get<{ Querystring: { by?: string } }>('/blackjack/leaderboard', async (req) => ({ entries: bj.leaderboard(req.query.by === 'chips' ? 'chips' : 'xp') }));
}
