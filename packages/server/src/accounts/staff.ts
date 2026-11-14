import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ServerError } from '../errors';
import type { PublicChat } from '../publicChat';
import { RateLimiter } from '../rateLimiter';
import type { AccountDb } from './db';
import type { AccountService } from './service';
import { ROLE_RANK, ROLES, type Role } from './types';

export type StaffRole = 'moderator' | 'admin';

/** Qui agit : le propriétaire (jeton d'administration) ou un compte investi d'un rôle. */
export interface Actor {
  kind: 'root' | 'account';
  id: string | null;
  name: string;
  role: StaffRole;
}

export interface StaffUser {
  id: string;
  nickname: string;
  role: Role;
  createdAt: number;
  club: string | null;
  /** Secondes de silence restantes (0 : peut écrire) ; null si jamais sanctionné. */
  muteLeft: number;
  banned: boolean;
  /** Visible des administrateurs seulement. */
  email?: string;
}

const digest = (s: string): Buffer => createHash('sha256').update(s).digest();
const cut = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const MAX_MUTE_MINUTES = 30 * 24 * 60;
export const ANNOUNCEMENT_MAX = 280;

/**
 * Équipe du site : rôles (utilisateur, modérateur, administrateur), sanctions (silence dans les chats, suspension de
 * compte), journal des actions et annonce du site. Le jeton d'administration (variable ADMIN_TOKEN) agit comme
 * administrateur « racine » : il sert à nommer les premiers administrateurs et reste le recours si un compte est perdu.
 */
export class StaffService {
  private readonly failed: RateLimiter;
  private readonly token: string | null;
  private readonly now: () => number;

  constructor(private readonly store: AccountDb, private readonly accounts: AccountService, opts: { adminToken?: string; now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
    this.failed = new RateLimiter(10, 15 * 60_000, this.now);
    this.token = opts.adminToken && opts.adminToken.length >= 16 ? opts.adminToken : null;
  }

  private get db() {
    return this.store.db;
  }

  /** Authentifie la requête : jeton racine ou session d'un compte modérateur / administrateur. */
  authenticate(req: FastifyRequest): Actor {
    if (!this.failed.allows(req.ip)) throw new ServerError('RATE_LIMITED', 'Trop de tentatives, réessayez plus tard');
    const h = req.headers.authorization;
    const given = h && h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!given) throw new ServerError('UNAUTHORIZED', 'Connectez-vous avec un compte de l’équipe ou saisissez le jeton d’administration');
    if (this.token && timingSafeEqual(digest(given), digest(this.token))) return { kind: 'root', id: null, name: 'Propriétaire', role: 'admin' };
    const account = this.accounts.userBySession(given);
    if (!account) {
      this.failed.hit(req.ip);
      throw new ServerError('UNAUTHORIZED', 'Jeton ou session invalide');
    }
    if (account.role === 'user') throw new ServerError('FORBIDDEN', 'Ce compte ne fait pas partie de l’équipe du site');
    return { kind: 'account', id: account.id, name: account.nickname, role: account.role };
  }

  /** Authentifie et exige au moins le rôle indiqué. */
  require(req: FastifyRequest, role: StaffRole): Actor {
    const actor = this.authenticate(req);
    if (role === 'admin' && actor.role !== 'admin') throw new ServerError('FORBIDDEN', 'Réservé aux administrateurs');
    return actor;
  }

  log(actor: Actor, action: string, target = '', detail = ''): void {
    this.db.prepare('INSERT INTO mod_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(this.now(), `${actor.name}${actor.kind === 'root' ? ' (jeton)' : ''}`, action, cut(target, 80), cut(detail, 300));
  }

  logs(limit = 200): Array<{ id: number; at: number; actor: string; action: string; target: string; detail: string }> {
    return this.db.prepare('SELECT id, at, actor, action, target, detail FROM mod_log ORDER BY id DESC LIMIT ?').all(limit) as never;
  }

  private target(userId: string): { id: string; nickname: string; role: Role } {
    const r = this.db.prepare('SELECT id, nickname, role FROM users WHERE id = ?').get(userId) as { id: string; nickname: string; role: Role } | undefined;
    if (!r) throw new ServerError('NOT_FOUND', 'Joueur introuvable');
    return r;
  }

  /** Une sanction ne vise ni soi-même ni un rôle égal ou supérieur (sauf le propriétaire). */
  private assertCanSanction(actor: Actor, target: { id: string; role: Role }): void {
    if (actor.kind === 'root') return;
    if (actor.id === target.id) throw new ServerError('FORBIDDEN', 'Vous ne pouvez pas vous sanctionner vous-même');
    if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) throw new ServerError('FORBIDDEN', 'Ce joueur a un rôle égal ou supérieur au vôtre');
  }

  private view(r: Record<string, unknown>, withEmail: boolean): StaffUser {
    const id = r.id as string;
    const u: StaffUser = {
      id,
      nickname: r.nickname as string,
      role: ((r.role as Role | undefined) ?? 'user'),
      createdAt: r.created_at as number,
      club: ((r.club as string | null) ?? null),
      muteLeft: this.accounts.muteLeft(id),
      banned: this.accounts.banLeft(id) > 0,
    };
    if (withEmail) u.email = r.email as string;
    return u;
  }

  searchUsers(actor: Actor, q: string, limit = 50): StaffUser[] {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db
      .prepare(
        `SELECT u.id, u.nickname, u.email, u.role, u.created_at, c.name AS club FROM users u LEFT JOIN club_member c ON c.user_id = u.id
         WHERE (u.nickname LIKE ? ESCAPE '\\' ${actor.role === 'admin' ? "OR u.email LIKE ? ESCAPE '\\'" : ''})
         ORDER BY (u.role = 'admin') DESC, (u.role = 'moderator') DESC, u.created_at DESC LIMIT ?`,
      )
      .all(...(actor.role === 'admin' ? [like, like, limit] : [like, limit])) as Array<Record<string, unknown>>;
    return rows.map((r) => this.view(r, actor.role === 'admin'));
  }

  setRole(actor: Actor, userId: string, role: unknown): void {
    if (actor.role !== 'admin') throw new ServerError('FORBIDDEN', 'Réservé aux administrateurs');
    if (!ROLES.includes(role as Role)) throw new ServerError('BAD_REQUEST', 'Rôle inconnu');
    const t = this.target(userId);
    if (actor.kind === 'account' && actor.id === t.id) throw new ServerError('FORBIDDEN', 'Vous ne pouvez pas modifier votre propre rôle');
    if (actor.kind === 'account' && t.role === 'admin') throw new ServerError('FORBIDDEN', 'Seul le propriétaire peut modifier un administrateur');
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role as Role, userId);
    this.log(actor, 'rôle', t.nickname, `${t.role} → ${role as string}`);
  }

  mute(actor: Actor, userId: string, minutes: unknown, reason: unknown): void {
    const m = Math.floor(Number(minutes));
    if (!Number.isFinite(m) || m < 1 || m > MAX_MUTE_MINUTES) throw new ServerError('BAD_REQUEST', 'Durée de silence : de 1 minute à 30 jours');
    const t = this.target(userId);
    this.assertCanSanction(actor, t);
    this.lift(userId, 'mute');
    const at = this.now();
    this.db.prepare('INSERT INTO sanction (user_id, kind, until, reason, by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, 'mute', at + m * 60_000, cut(reason, 200), actor.name, at);
    this.log(actor, 'silence', t.nickname, `${m} min${cut(reason, 120) ? ` · ${cut(reason, 120)}` : ''}`);
  }

  unmute(actor: Actor, userId: string): void {
    const t = this.target(userId);
    this.lift(userId, 'mute');
    this.log(actor, 'fin du silence', t.nickname);
  }

  ban(actor: Actor, userId: string, reason: unknown): void {
    if (actor.role !== 'admin') throw new ServerError('FORBIDDEN', 'Réservé aux administrateurs');
    const t = this.target(userId);
    this.assertCanSanction(actor, t);
    this.lift(userId, 'ban');
    const at = this.now();
    this.db.prepare('INSERT INTO sanction (user_id, kind, until, reason, by, created_at) VALUES (?, ?, NULL, ?, ?, ?)').run(userId, 'ban', cut(reason, 200), actor.name, at);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    this.log(actor, 'suspension', t.nickname, cut(reason, 150));
  }

  unban(actor: Actor, userId: string): void {
    if (actor.role !== 'admin') throw new ServerError('FORBIDDEN', 'Réservé aux administrateurs');
    const t = this.target(userId);
    this.lift(userId, 'ban');
    this.log(actor, 'fin de suspension', t.nickname);
  }

  private lift(userId: string, kind: 'mute' | 'ban'): void {
    this.db.prepare('UPDATE sanction SET lifted_at = ? WHERE user_id = ? AND kind = ? AND lifted_at IS NULL').run(this.now(), userId, kind);
  }

  announcement(): string | null {
    const r = this.db.prepare("SELECT value FROM site_setting WHERE key = 'announcement'").get() as { value: string } | undefined;
    return r?.value || null;
  }

  setAnnouncement(actor: Actor, text: unknown): string | null {
    if (actor.role !== 'admin') throw new ServerError('FORBIDDEN', 'Réservé aux administrateurs');
    const t = cut(text, ANNOUNCEMENT_MAX);
    if (!t) this.db.prepare("DELETE FROM site_setting WHERE key = 'announcement'").run();
    else this.db.prepare("INSERT INTO site_setting (key, value) VALUES ('announcement', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(t);
    this.log(actor, t ? 'annonce publiée' : 'annonce retirée', '', t);
    return t || null;
  }

  stats(): { accounts: number; newThisWeek: number; staff: number; mutes: number; bans: number; feedbackOpen: number } {
    const n = (sql: string, ...a: unknown[]): number => Number((this.db.prepare(sql).get(...(a as [])) as { n: number }).n);
    const t = this.now();
    return {
      accounts: n('SELECT COUNT(*) AS n FROM users'),
      newThisWeek: n('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', t - 7 * 86_400_000),
      staff: n("SELECT COUNT(*) AS n FROM users WHERE role != 'user'"),
      mutes: n("SELECT COUNT(DISTINCT user_id) AS n FROM sanction WHERE kind = 'mute' AND lifted_at IS NULL AND until > ?", t),
      bans: n("SELECT COUNT(DISTINCT user_id) AS n FROM sanction WHERE kind = 'ban' AND lifted_at IS NULL"),
      feedbackOpen: n("SELECT COUNT(*) AS n FROM feedback WHERE status = 'open'"),
    };
  }
}

export interface StaffRouteOptions {
  chat: PublicChat;
}

export function registerStaffRoutes(app: FastifyInstance, staff: StaffService, opts: StaffRouteOptions): void {
  const noStore = (reply: { header: (k: string, v: string) => unknown }): void => void reply.header('Cache-Control', 'no-store');
  const idOf = (req: FastifyRequest): string => String((req.params as { id: string }).id).slice(0, 80);
  const body = (req: FastifyRequest): Record<string, unknown> => (req.body ?? {}) as Record<string, unknown>;

  // Annonce du site : lisible de tous (bandeau de l'accueil), modifiable par les administrateurs.
  app.get('/announcement', async (_req, reply) => {
    noStore(reply);
    return reply.send({ text: staff.announcement() });
  });

  app.get('/staff/me', async (req, reply) => {
    const a = staff.authenticate(req);
    noStore(reply);
    return reply.send({ role: a.role, name: a.name, root: a.kind === 'root' });
  });
  app.get<{ Querystring: { q?: string } }>('/staff/users', async (req, reply) => {
    const a = staff.authenticate(req);
    noStore(reply);
    return reply.send({ users: staff.searchUsers(a, cut(req.query.q, 60)) });
  });
  app.post('/staff/users/:id/role', async (req, reply) => {
    staff.setRole(staff.require(req, 'admin'), idOf(req), body(req).role);
    return reply.status(204).send();
  });
  app.post('/staff/users/:id/mute', async (req, reply) => {
    const a = staff.authenticate(req);
    staff.mute(a, idOf(req), body(req).minutes, body(req).reason);
    return reply.status(204).send();
  });
  app.delete('/staff/users/:id/mute', async (req, reply) => {
    staff.unmute(staff.authenticate(req), idOf(req));
    return reply.status(204).send();
  });
  app.post('/staff/users/:id/ban', async (req, reply) => {
    staff.ban(staff.authenticate(req), idOf(req), body(req).reason);
    return reply.status(204).send();
  });
  app.delete('/staff/users/:id/ban', async (req, reply) => {
    staff.unban(staff.authenticate(req), idOf(req));
    return reply.status(204).send();
  });

  app.get('/staff/chat', async (req, reply) => {
    staff.authenticate(req);
    noStore(reply);
    return reply.send({ messages: opts.chat.forStaff() });
  });
  app.delete<{ Params: { id: string } }>('/staff/chat/:id', async (req, reply) => {
    const a = staff.authenticate(req);
    const id = Number.parseInt(req.params.id, 10);
    const m = opts.chat.forStaff().find((x) => x.id === id);
    if (!m || !opts.chat.remove(id)) throw new ServerError('NOT_FOUND', 'Message introuvable (déjà retiré ?)');
    staff.log(a, 'message supprimé', m.nickname, m.text.slice(0, 120));
    return reply.status(204).send();
  });

  app.get('/staff/log', async (req, reply) => {
    staff.require(req, 'admin');
    noStore(reply);
    return reply.send({ items: staff.logs() });
  });
  app.get('/staff/stats', async (req, reply) => {
    staff.require(req, 'admin');
    noStore(reply);
    return reply.send(staff.stats());
  });
  app.post('/staff/announcement', async (req, reply) => {
    const text = staff.setAnnouncement(staff.require(req, 'admin'), body(req).text);
    return reply.send({ text });
  });
}
