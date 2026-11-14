import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ServerError } from '../errors';
import { RateLimiter } from '../rateLimiter';
import { optionalAccount } from './routes';
import type { AccountDb } from './db';
import type { Mailer } from './mailer';
import type { AccountService } from './service';
import type { StaffService } from './staff';

export const FEEDBACK_KINDS = ['bug', 'idea', 'comment'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackStatus = 'open' | 'done';

export interface FeedbackRow {
  id: string;
  createdAt: number;
  kind: FeedbackKind;
  message: string;
  contact: string | null;
  nickname: string | null;
  context: string;
  status: FeedbackStatus;
}

const clean = (v: unknown, max: number, multiline = false): string => {
  if (typeof v !== 'string') return '';
  const t = multiline ? v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : v.replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
};

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Commentaires et signalements envoyés par les joueurs (onglet « Un bug ? »). */
export class FeedbackService {
  constructor(
    private readonly store: AccountDb,
    private readonly mailer: Mailer,
    private readonly opts: { to?: string; now?: () => number; log?: (s: string) => void } = {},
  ) {}

  private get now(): number {
    return (this.opts.now ?? Date.now)();
  }

  async submit(body: unknown, userId: string | null, nickname: string | null, agent: string): Promise<{ id: string }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const kind = FEEDBACK_KINDS.includes(b.kind as FeedbackKind) ? (b.kind as FeedbackKind) : null;
    if (!kind) throw new ServerError('BAD_REQUEST', 'Type de message inconnu');
    const message = clean(b.message, 2000, true);
    if (message.length < 10) throw new ServerError('BAD_REQUEST', 'Décrivez votre message en quelques mots (10 caractères minimum)');
    const contactRaw = clean(b.contact, 254);
    if (contactRaw && !EMAIL.test(contactRaw)) throw new ServerError('BAD_REQUEST', 'Adresse e-mail de contact invalide');
    const where = clean(b.where, 60);
    const version = clean(b.version, 30);
    const context = [where && `écran ${where}`, version && `version ${version}`, clean(agent, 160)].filter(Boolean).join(' · ');
    const id = randomUUID();
    this.store.db
      .prepare('INSERT INTO feedback (id, created_at, kind, message, contact, user_id, context) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, this.now, kind, message, contactRaw || null, userId, context);
    if (this.opts.to && this.mailer.enabled) {
      const who = nickname ? ` de ${nickname}` : '';
      const text = `${message}\n\n${contactRaw ? `Contact : ${contactRaw}\n` : ''}${context}`;
      this.mailer
        .send({ to: this.opts.to, subject: `[Flash Poker] Un bug ? (${kind})${who}`, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</pre>` })
        .catch(() => (this.opts.log ?? console.warn)('[retour] notification non envoyée'));
    }
    return { id };
  }

  list(status?: FeedbackStatus): FeedbackRow[] {
    const rows = this.store.db
      .prepare(
        `SELECT f.id, f.created_at, f.kind, f.message, f.contact, f.context, f.status, u.nickname
         FROM feedback f LEFT JOIN users u ON u.id = f.user_id
         ${status ? 'WHERE f.status = ?' : ''} ORDER BY f.created_at DESC LIMIT 500`,
      )
      .all(...(status ? [status] : [])) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as number,
      kind: r.kind as FeedbackKind,
      message: r.message as string,
      contact: (r.contact as string | null) ?? null,
      nickname: (r.nickname as string | null) ?? null,
      context: r.context as string,
      status: r.status as FeedbackStatus,
    }));
  }

  setStatus(id: string, status: FeedbackStatus): boolean {
    return Number(this.store.db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id).changes) > 0;
  }

  remove(id: string): boolean {
    return Number(this.store.db.prepare('DELETE FROM feedback WHERE id = ?').run(id).changes) > 0;
  }
}

export interface FeedbackRouteOptions {
  now?: () => number;
  /** Équipe du site : sans elle (ou sans jeton ni compte autorisé), aucune route d'administration n'est ouverte. */
  staff?: StaffService;
}

export function registerFeedbackRoutes(app: FastifyInstance, accounts: AccountService, feedback: FeedbackService, opts: FeedbackRouteOptions = {}): void {
  const now = opts.now ?? Date.now;
  const send = new RateLimiter(5, 60 * 60_000, now);

  app.post('/feedback', async (req, reply) => {
    if (!send.hit(req.ip)) throw new ServerError('RATE_LIMITED', 'Vous avez déjà envoyé plusieurs messages, réessayez dans une heure');
    const account = optionalAccount(accounts, req);
    const agent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    const r = await feedback.submit(req.body, account?.id ?? null, account?.nickname ?? null, agent);
    return reply.status(201).send(r);
  });

  const staff = opts.staff;
  if (!staff) return;
  const admin = (req: FastifyRequest): void => void staff.require(req, 'admin');
  app.get<{ Querystring: { status?: string } }>('/admin/feedback', async (req, reply) => {
    admin(req);
    const s = req.query.status;
    return reply.header('Cache-Control', 'no-store').send({ items: feedback.list(s === 'open' || s === 'done' ? s : undefined) });
  });
  app.post<{ Params: { id: string }; Body: { status?: string } }>('/admin/feedback/:id', async (req, reply) => {
    admin(req);
    const status = (req.body as { status?: string } | null)?.status;
    if (status !== 'open' && status !== 'done') throw new ServerError('BAD_REQUEST', 'Statut inconnu');
    if (!feedback.setStatus(req.params.id, status)) throw new ServerError('NOT_FOUND', 'Message introuvable');
    return reply.status(204).send();
  });
  app.delete<{ Params: { id: string } }>('/admin/feedback/:id', async (req, reply) => {
    admin(req);
    if (!feedback.remove(req.params.id)) throw new ServerError('NOT_FOUND', 'Message introuvable');
    return reply.status(204).send();
  });
}
