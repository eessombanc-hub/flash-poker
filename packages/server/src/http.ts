import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer, type Socket } from 'socket.io';
import { ServerError } from './errors';
import { authSchema, excludeSchema, approveAssistanceSchema, type Outgoing } from './protocol';
import { RateLimiter } from './rateLimiter';
import { clientIp, securityHeaders } from './netSecurity';
import { optionalAccount, registerAccountRoutes, registerPresence } from './accounts/routes';
import { registerBlackjackRoutes } from './blackjack/routes';
import type { BlackjackService } from './blackjack/service';
import type { BlackjackTables } from './blackjack/tables';
import { registerTableauRoutes } from './tableau/routes';
import type { TableauService } from './tableau/service';
import type { AccountService } from './accounts/service';
import type { RoomManager } from './roomManager';
import { renderIndex } from './sharePreview';

export interface ServerOptions {
  manager: RoomManager;
  /** Horloge (la même que celle du RoomManager, pour des tests déterministes). */
  now?: () => number;
  /** Création / arrivée : tentatives par IP. */
  httpRateLimit?: { max: number; windowMs: number };
  /** Commandes WebSocket : messages par connexion. */
  socketRateLimit?: { max: number; windowMs: number };
  /** Origine autorisée pour un client web hébergé ailleurs (par défaut : même origine uniquement). */
  corsOrigin?: string;
  /**
   * Dossier du build de l'interface (`packages/web/dist`) à servir depuis ce même serveur : utile pour un
   * déploiement à service unique (ex. Render) où une seule instance Node sert l'API, le WebSocket et les
   * fichiers statiques sur la même origine (pas de CORS à configurer). Omis en développement local, où
   * l'interface tourne séparément via Vite (voir `vite.config.ts`).
   */
  webDist?: string;
  /** Comptes joueurs (facultatif) : connexion, espace personnel, favoris, présence. */
  accounts?: AccountService;
  /** Module Blackjack (nécessite `accounts`). */
  blackjack?: BlackjackService;
  /** Tables de Blackjack à plusieurs (nécessite `blackjack`). */
  blackjackTables?: BlackjackTables;
  /** Parties du Tableau (nécessite `accounts`). */
  tableau?: TableauService;
  /** Adresse publique du jeu (APP_URL ou celle fournie par Render), pour l'aperçu des liens partagés. */
  publicUrl?: string;
  /** Inscription / connexion / mot de passe oublié : tentatives par IP. */
  authRateLimit?: { max: number; windowMs: number };
  /** Relais de confiance devant le serveur (voir `resolveTrustProxy`) : détermine l'adresse IP réelle des clients. */
  trustProxy?: number;
  /** Plafond de connexions temps réel simultanées par adresse IP (60 par défaut). */
  maxSocketsPerIp?: number;
  /** Route de diagnostic `/_ip` (affiche l'adresse vue par le serveur) : à n'activer que pour régler `trustProxy`. */
  debugIp?: boolean;
  onError?: (err: unknown) => void;
  /** Destination des erreurs signalées par le navigateur (journal du serveur par défaut). */
  onClientError?: (report: { message: string; stack: string; where: string; agent: string }) => void;
}

export interface WireError {
  code: string;
  message: string;
  ruleCode?: string;
}
export type Ack = { ok: true; data?: unknown } | { ok: false; error: WireError };

function toWire(e: unknown, onError?: (err: unknown) => void): WireError {
  if (e instanceof ServerError) return { code: e.code, message: e.message, ...(e.ruleCode ? { ruleCode: e.ruleCode } : {}) };
  (onError ?? ((err) => console.error('[serveur]', err)))(e);
  return { code: 'INTERNAL', message: 'Erreur interne' }; // aucun détail interne vers le client
}

/** Pont WebSocket ↔ RoomManager : authentifie par jeton, transmet les intentions, diffuse les vues filtrées. */
export class RealtimeManager {
  private sockets = new Map<string, Set<Socket>>();

  constructor(
    io: IOServer,
    private readonly manager: RoomManager,
    private readonly opts: ServerOptions,
  ) {
    manager.onOutgoing((o) => this.deliver(o));
    io.on('connection', (socket) => this.onConnection(socket));
  }

  private key(code: string, playerId: string): string {
    return `${code}|${playerId}`;
  }

  private deliver(o: Outgoing): void {
    const set = this.sockets.get(this.key(o.message.roomCode, o.playerId));
    if (!set) return;
    for (const s of [...set]) {
      s.emit(o.message.type, o.message);
      if (o.message.type === 'kicked') s.disconnect(true);
    }
  }

  private onConnection(socket: Socket): void {
    const parsed = authSchema.safeParse(socket.handshake.auth);
    let code = '';
    let playerId = '';
    try {
      if (!parsed.success) throw new ServerError('UNAUTHORIZED', 'Session invalide');
      playerId = this.opts.manager.authenticate(parsed.data.code, parsed.data.token);
      code = this.opts.manager.view(parsed.data.code, playerId).code; // code canonique
    } catch {
      socket.emit('fatal', { code: 'UNAUTHORIZED', message: 'Session invalide' });
      socket.disconnect(true);
      return;
    }
    const k = this.key(code, playerId);
    if (!this.sockets.has(k)) this.sockets.set(k, new Set());
    this.sockets.get(k)!.add(socket);
    this.manager.connect(code, playerId); // diffuse à tous, y compris à cette connexion : l'état complet est restauré

    const limiter = new RateLimiter(this.opts.socketRateLimit?.max ?? 60, this.opts.socketRateLimit?.windowMs ?? 10_000, this.opts.now ?? Date.now);
    const on = (event: string, fn: (payload: unknown) => unknown): void => {
      socket.on(event, (payload: unknown, ack?: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (a: Ack) => void) : () => undefined;
        try {
          if (!limiter.hit('socket')) throw new ServerError('RATE_LIMITED', 'Trop de messages, ralentissez');
          const data = fn(payload);
          reply({ ok: true, ...(data !== undefined ? { data } : {}) });
        } catch (e) {
          reply({ ok: false, error: toWire(e, this.opts.onError) });
        }
      });
    };

    on('command', (payload) => this.manager.command(code, playerId, payload));
    on('lobby:start', () => this.manager.startGame(code, playerId));
    on('lobby:cancel', () => this.manager.cancelRoom(code, playerId));
    on('lobby:leave', () => this.manager.leaveLobby(code, playerId));
    on('host:exclude', (payload) => {
      const p = excludeSchema.safeParse(payload);
      if (!p.success) throw new ServerError('BAD_REQUEST', 'Joueur invalide');
      this.manager.excludePlayer(code, playerId, p.data.playerId);
    });
    on('lobby:approveAssistance', (payload) => {
      const p = approveAssistanceSchema.safeParse(payload);
      if (!p.success) throw new ServerError('BAD_REQUEST', 'Réponse invalide');
      this.manager.approveAssistance(code, playerId, p.data.approve);
    });
    on('state:resync', () => {
      const view = this.manager.view(code, playerId);
      socket.emit('update', { type: 'update', roomCode: code, version: view.version, view, events: [] });
    });

    socket.on('disconnect', () => {
      const set = this.sockets.get(k);
      set?.delete(socket);
      if (!set || set.size === 0) {
        this.sockets.delete(k);
        this.manager.disconnect(code, playerId); // plusieurs onglets : hors ligne seulement quand le dernier se ferme
      }
    });
  }
}

export interface BuiltServer {
  app: FastifyInstance;
  io: IOServer;
  realtime: RealtimeManager;
  close(): Promise<void>;
}

export async function buildServer(opts: ServerOptions): Promise<BuiltServer> {
  // Fastify 5 refuse un nombre de relais brut (il ne valide plus le pair direct) : on exprime la règle en fonction.
  const trust = opts.trustProxy ?? 0;
  const app = Fastify({ bodyLimit: 10_000, logger: false, ...(trust > 0 ? { trustProxy: (_addr: string, hop: number) => hop < trust } : {}) });
  const now = opts.now ?? Date.now;
  const http = new RateLimiter(opts.httpRateLimit?.max ?? 30, opts.httpRateLimit?.windowMs ?? 60_000, now);

  const headers = securityHeaders(opts.corsOrigin ? { connectExtra: opts.corsOrigin } : {});
  app.addHook('onSend', async (_req, reply) => {
    for (const [k, v] of Object.entries(headers)) reply.header(k, v);
  });

  if (opts.corsOrigin) {
    app.addHook('onRequest', async (req, reply) => {
      reply.header('Access-Control-Allow-Origin', opts.corsOrigin!);
      reply.header('Access-Control-Allow-Headers', 'content-type, authorization, x-bj-guest');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') return reply.status(204).send();
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ServerError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.ruleCode ? { ruleCode: err.ruleCode } : {}) } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: { code: 'BAD_REQUEST', message: 'Requête invalide' } });
    (opts.onError ?? ((e) => console.error('[serveur]', e)))(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Erreur interne' } });
  });

  const guard = (kind: string, ip: string): void => {
    if (!http.hit(`${kind}:${ip}`)) throw new ServerError('RATE_LIMITED', 'Trop de tentatives, réessayez plus tard');
  };

  app.get('/health', async () => ({ ok: true }));
  // Journal des erreurs du navigateur : de quoi comprendre un affichage cassé sans avoir l'appareil sous la main.
  // Taille bornée, 10 signalements par minute et par adresse, aucune donnée de compte.
  const clientErrors = new RateLimiter(10, 60_000, now);
  app.post('/client-errors', async (req, reply) => {
    if (!clientErrors.hit(req.ip)) return reply.status(429).send({ ok: false });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const cut = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').slice(0, n) : '');
    const report = { message: cut(b.message, 300), stack: cut(b.stack, 1500), where: cut(b.where, 200), agent: cut(req.headers['user-agent'], 200) };
    if (!report.message) throw new ServerError('BAD_REQUEST', 'Signalement vide');
    (opts.onClientError ?? ((r) => console.warn('[navigateur]', JSON.stringify(r))))(report);
    return reply.status(204).send();
  });
  if (opts.debugIp) app.get('/_ip', async (req) => ({ ip: req.ip, forwardedFor: req.headers['x-forwarded-for'] ?? null, socket: req.socket.remoteAddress ?? null }));
  app.get('/rooms', async (req, reply) => {
    guard('list', req.ip); // limite le polling de la liste, distinct de la création/arrivée
    return reply.send({ rooms: opts.manager.listOpen() });
  });
  app.post('/rooms', async (req, reply) => {
    guard('create', req.ip);
    const account = opts.accounts ? optionalAccount(opts.accounts, req) : null;
    return reply.status(201).send(opts.manager.createRoom(req.body, account));
  });
  app.post<{ Params: { code: string } }>('/rooms/:code/join', async (req, reply) => {
    guard('join', req.ip); // freine l'énumération des codes de partie
    const account = opts.accounts ? optionalAccount(opts.accounts, req) : null;
    return reply.status(201).send(opts.manager.joinRoom(req.params.code, req.body, account));
  });
  if (opts.accounts) registerAccountRoutes(app, opts.accounts, { now, authRateLimit: opts.authRateLimit });
  if (opts.accounts && opts.tableau) registerTableauRoutes(app, opts.tableau, opts.accounts, { now });
  if (opts.accounts && opts.blackjack) registerBlackjackRoutes(app, opts.blackjack, opts.accounts, { now, tables: opts.blackjackTables });

  const isApiPath = (url: string): boolean => ['/rooms', '/socket.io', '/health', '/auth/', '/me', '/avatars', '/users', '/invites', '/blackjack', '/tableau'].some((p) => url === p || url.startsWith(p.endsWith('/') ? p : `${p}/`) || url.startsWith(`${p}?`));

  if (opts.webDist && existsSync(opts.webDist)) {
    // Fichiers avec hash dans leur nom (assets Vite) : cache long ; `index.html` : jamais mis en cache (sert
    // toujours la dernière version déployée). Application mono-page sans routeur : `index.html` répond à
    // toute requête GET qui ne correspond ni à l'API ni à un fichier existant.
    // `@fastify/static` exige un chemin absolu : `webDist` peut être relatif (ex. `../web/dist` en variable
    // d'environnement), donc résolu ici plutôt que de reporter la contrainte sur l'appelant.
    // `index: false` : la page d'accueil n'est jamais servie telle quelle, elle passe par `renderIndex` (aperçu
    // des liens partagés) ; ses fichiers voisins (images, icônes, manifeste) restent servis directement.
    const root = resolve(opts.webDist);
    await app.register(fastifyStatic, { root, index: false, wildcard: false, cacheControl: true, maxAge: '1y', immutable: true });
    const template = existsSync(resolve(root, 'index.html')) ? readFileSync(resolve(root, 'index.html'), 'utf8') : '';
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || isApiPath(req.url)) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Introuvable' } });
      }
      const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]!.trim();
      const baseUrl = (opts.publicUrl ?? `${proto}://${req.headers.host ?? 'localhost'}`).replace(/\/+$/, '');
      const html = renderIndex(template, {
        baseUrl,
        query: req.query as Record<string, string | undefined>,
        inviterOf: (code) => {
          try {
            return opts.accounts?.inviteInfo(code).inviter.nickname ?? null;
          } catch {
            return null;
          }
        },
      });
      return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(html);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Introuvable' } }));
  }

  const io = new IOServer(app.server, {
    maxHttpBufferSize: 10_000,
    cors: opts.corsOrigin ? { origin: opts.corsOrigin } : undefined,
  });
  // Plafond de connexions temps réel simultanées par adresse (tous espaces de noms confondus).
  const perIp = new Map<string, number>();
  const maxPerIp = opts.maxSocketsPerIp ?? 60;
  const limitPerIp = (socket: Socket, next: (err?: Error) => void): void => {
    const ip = clientIp(socket.handshake.headers, socket.handshake.address, trust);
    const n = perIp.get(ip) ?? 0;
    if (n >= maxPerIp) return next(new Error('Trop de connexions'));
    perIp.set(ip, n + 1);
    socket.on('disconnect', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    });
    next();
  };
  io.use(limitPerIp);
  io.of('/compte').use(limitPerIp);
  const realtime = new RealtimeManager(io, opts.manager, opts);
  if (opts.accounts) registerPresence(io, opts.accounts);
  await app.ready();
  return {
    app,
    io,
    realtime,
    close: async () => {
      await io.close();
      await app.close().catch(() => undefined);
    },
  };
}
