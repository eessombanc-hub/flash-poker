import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer, type Socket } from 'socket.io';
import { ServerError } from './errors';
import { authSchema, excludeSchema, approveAssistanceSchema, type Outgoing } from './protocol';
import { RateLimiter } from './rateLimiter';
import { optionalAccount, registerAccountRoutes, registerPresence } from './accounts/routes';
import type { AccountService } from './accounts/service';
import type { RoomManager } from './roomManager';

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
  /** Inscription / connexion / mot de passe oublié : tentatives par IP. */
  authRateLimit?: { max: number; windowMs: number };
  onError?: (err: unknown) => void;
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
    private readonly io: IOServer,
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
  const app = Fastify({ bodyLimit: 10_000, logger: false });
  const now = opts.now ?? Date.now;
  const http = new RateLimiter(opts.httpRateLimit?.max ?? 30, opts.httpRateLimit?.windowMs ?? 60_000, now);

  if (opts.corsOrigin) {
    app.addHook('onRequest', async (req, reply) => {
      reply.header('Access-Control-Allow-Origin', opts.corsOrigin!);
      reply.header('Access-Control-Allow-Headers', 'content-type, authorization');
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

  const isApiPath = (url: string): boolean => ['/rooms', '/socket.io', '/health', '/auth/', '/me', '/users', '/invites'].some((p) => url === p || url.startsWith(p.endsWith('/') ? p : `${p}/`) || url.startsWith(`${p}?`));

  if (opts.webDist && existsSync(opts.webDist)) {
    // Fichiers avec hash dans leur nom (assets Vite) : cache long ; `index.html` : jamais mis en cache (sert
    // toujours la dernière version déployée). Application mono-page sans routeur : `index.html` répond à
    // toute requête GET qui ne correspond ni à l'API ni à un fichier existant.
    // `@fastify/static` exige un chemin absolu : `webDist` peut être relatif (ex. `../web/dist` en variable
    // d'environnement), donc résolu ici plutôt que de reporter la contrainte sur l'appelant.
    await app.register(fastifyStatic, { root: resolve(opts.webDist), wildcard: false, cacheControl: true, maxAge: '1y', immutable: true });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || isApiPath(req.url)) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Introuvable' } });
      }
      return reply.sendFile('index.html', { cacheControl: false, maxAge: 0 });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Introuvable' } }));
  }

  const io = new IOServer(app.server, {
    maxHttpBufferSize: 10_000,
    cors: opts.corsOrigin ? { origin: opts.corsOrigin } : undefined,
  });
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
