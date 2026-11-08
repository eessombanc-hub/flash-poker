import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FREE_TABLE_ID } from '@poker/engine';
import { ServerError } from '../errors';
import { bearer } from '../accounts/routes';
import { RateLimiter } from '../rateLimiter';
import type { AccountService } from '../accounts/service';
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

/** Routes du Blackjack : comptes connectés et invités (le classement ne liste que les comptes). */
export function registerBlackjackRoutes(app: FastifyInstance, bj: BlackjackService, accounts: AccountService, opts: { now?: () => number } = {}): void {
  const perUser = new RateLimiter(240, 60_000, opts.now ?? Date.now);
  const perIp = new RateLimiter(600, 60_000, opts.now ?? Date.now);
  /**
   * Joueur de la requête : compte connecté, sinon invité identifié par un code aléatoire généré par son navigateur
   * (en-tête `x-bj-guest`). Un invité a ses propres jetons, niveau et statistiques, conservés sur son appareil ;
   * il n'apparaît pas au classement et ne partage pas l'expérience du poker.
   */
  const me = (req: FastifyRequest): { id: string } => {
    if (!perIp.hit(req.ip)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    const account = accounts.userBySession(bearer(req));
    const guest = req.headers['x-bj-guest'];
    const who: { id: string } | null = account ? { id: account.id } : typeof guest === 'string' && /^[a-f0-9]{32}$/.test(guest) ? { id: `guest:${guest}` } : null;
    if (!who) throw new ServerError('BAD_REQUEST', 'Identifiant de joueur manquant');
    if (!perUser.hit(who.id)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    return who;
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
