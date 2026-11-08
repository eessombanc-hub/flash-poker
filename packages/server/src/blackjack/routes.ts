import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FREE_TABLE_ID } from '@poker/engine';
import { ServerError } from '../errors';
import { bearer } from '../accounts/routes';
import { RateLimiter } from '../rateLimiter';
import type { AccountService } from '../accounts/service';
import type { BlackjackService } from './service';
import type { BlackjackTables } from './tables';

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
export function registerBlackjackRoutes(app: FastifyInstance, bj: BlackjackService, accounts: AccountService, opts: { now?: () => number; tables?: BlackjackTables } = {}): void {
  const perUser = new RateLimiter(240, 60_000, opts.now ?? Date.now);
  const perIp = new RateLimiter(600, 60_000, opts.now ?? Date.now);
  /**
   * Joueur de la requête : compte connecté, sinon invité identifié par un code aléatoire généré par son navigateur
   * (en-tête `x-bj-guest`). Un invité a ses propres jetons, niveau et statistiques, conservés sur son appareil ;
   * il n'apparaît pas au classement et ne partage pas l'expérience du poker.
   */
  const me = (req: FastifyRequest): { id: string; nickname: string | null; avatar: string | null } => {
    if (!perIp.hit(req.ip)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
    const account = accounts.userBySession(bearer(req));
    const guest = req.headers['x-bj-guest'];
    const who = account ? { id: account.id, nickname: account.nickname, avatar: account.avatar ?? null } : typeof guest === 'string' && /^[a-f0-9]{32}$/.test(guest) ? { id: `guest:${guest}`, nickname: null, avatar: null } : null;
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

  // ----- Tables à plusieurs (1 à 6 places, humains et CPU) -----
  const tables = opts.tables;
  if (tables) {
    const nick = z.string().transform((v) => v.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20));
    const who = (req: FastifyRequest, nickname?: string) => {
      const m = me(req);
      return { userId: m.id, nickname: m.nickname ?? (nickname && nickname.length > 0 ? nickname : 'Invité'), avatar: m.avatar };
    };
    const createSchema = z.object({
      table: z.string().min(1).max(40),
      rules: rulesSchema.optional(),
      seats: z.array(z.enum(['human', 'cpu'])).min(1).max(6),
      bet: z.number().int().min(1).max(1_000_000).optional(),
      nickname: nick.optional(),
    });
    const code = (req: FastifyRequest): string => String((req.params as { code: string }).code).slice(0, 12);
    app.post('/blackjack/tables', async (req, reply) => {
      const p = createSchema.safeParse(req.body);
      if (!p.success) throw new ServerError('BAD_REQUEST', 'Table invalide : de 1 à 6 places, humaines ou CPU');
      if (p.data.table !== FREE_TABLE_ID && p.data.rules) throw new ServerError('BAD_REQUEST', 'Les règles ne se modifient que sur la table libre');
      return reply.status(201).send(tables.create(who(req, p.data.nickname), { table: p.data.table, rules: p.data.rules, seats: p.data.seats, bet: p.data.bet }));
    });
    app.get<{ Params: { code: string }; Querystring: { v?: string } }>('/blackjack/tables/:code', async (req) => {
      const guest = req.headers['x-bj-guest'];
      const account = accounts.userBySession(bearer(req));
      const id = account ? account.id : typeof guest === 'string' && /^[a-f0-9]{32}$/.test(guest) ? `guest:${guest}` : null;
      if (!perIp.hit(req.ip)) throw new ServerError('RATE_LIMITED', 'Trop de requêtes, ralentissez');
      const v = req.query.v === undefined ? undefined : Number(req.query.v);
      return tables.get(code(req), id, v !== undefined && Number.isInteger(v) ? v : undefined);
    });
    app.post('/blackjack/tables/:code/join', async (req) => tables.join(code(req), who(req, nick.optional().parse((req.body as { nickname?: string } | undefined)?.nickname))));
    app.post('/blackjack/tables/:code/leave', async (req) => tables.leave(code(req), me(req).id));
    app.post('/blackjack/tables/:code/start', async (req) => tables.start(code(req), me(req).id));
    app.post('/blackjack/tables/:code/next', async (req) => tables.next(code(req), me(req).id));
    app.post('/blackjack/tables/:code/bet', async (req) => {
      const p = z.object({ bet: z.number().int().min(1).max(1_000_000) }).safeParse(req.body);
      if (!p.success) throw new ServerError('BAD_REQUEST', 'Mise invalide');
      return tables.bet(code(req), me(req).id, p.data.bet);
    });
    app.post('/blackjack/tables/:code/action', async (req) => {
      const p = actionSchema.safeParse(req.body);
      if (!p.success) throw new ServerError('BAD_REQUEST', 'Action inconnue');
      return tables.act(code(req), me(req).id, p.data.action);
    });
    app.get('/blackjack/tables/:code/help', async (req) => tables.help(code(req), me(req).id));
  }
}
