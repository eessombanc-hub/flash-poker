import { SeededRng } from '@poker/engine';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../src/http';
import type { UpdateMessage } from '../src/protocol';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { closedWin, codesIn, LOSERS, WIN } from './helpers';

const CFG = { name: 'Table', maxPlayers: 4, targetPoints: 5, stakeCents: 2000, nickname: 'Host' };

interface Client {
  socket: Socket;
  updates: UpdateMessage[];
  fatal: unknown[];
  kicked: unknown[];
  playerId: string;
  token: string;
}

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function start(opts: { stacks?: Record<number, string[]>; httpMax?: number; socketMax?: number } = {}) {
  const scheduler = new ManualScheduler();
  const manager = new RoomManager({
    rng: new SeededRng(7),
    scheduler,
    gameHooks: { stackedDeck: (r) => opts.stacks?.[r] },
  });
  const server: BuiltServer = await buildServer({
    manager,
    now: () => scheduler.now(),
    httpRateLimit: { max: opts.httpMax ?? 100, windowMs: 60_000 },
    socketRateLimit: { max: opts.socketMax ?? 100, windowMs: 10_000 },
    onError: () => undefined,
  });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.app.server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  cleanup.push(() => server.close());

  const post = async (path: string, body: unknown, raw = false) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };
  const clients: Client[] = [];
  const open = (code: string, playerId: string, token: string): Client => {
    const socket = connect(url, { auth: { code, token }, transports: ['websocket'], reconnection: false, forceNew: true });
    const c: Client = { socket, updates: [], fatal: [], kicked: [], playerId, token };
    socket.on('update', (m: UpdateMessage) => c.updates.push(m));
    socket.on('fatal', (e) => c.fatal.push(e));
    socket.on('kicked', (e) => c.kicked.push(e));
    clients.push(c);
    cleanup.push(() => void socket.close());
    return c;
  };
  return { scheduler, manager, server, url, post, open };
}

const until = async (cond: () => boolean, label = 'condition', ms = 3000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const emit = (c: Client, event: string, payload?: unknown): Promise<any> =>
  new Promise((resolve) => c.socket.emit(event, payload, (ack: unknown) => resolve(ack)));
const last = (c: Client): UpdateMessage => c.updates.at(-1)!;

/** Room à 3 joueurs, connectés, partie démarrée. Les clients sont renvoyés dans l'ordre des positions. */
async function game(env: Awaited<ReturnType<typeof start>>, cfg: Record<string, unknown> = {}) {
  const created = await env.post('/rooms', { ...CFG, ...cfg });
  const code = created.body.code as string;
  const players = [{ playerId: created.body.playerId as string, token: created.body.token as string }];
  for (const nickname of ['Alice', 'Bob']) {
    const j = await env.post(`/rooms/${code}/join`, { nickname });
    players.push({ playerId: j.body.playerId, token: j.body.token });
  }
  const clients = players.map((p) => env.open(code, p.playerId, p.token));
  await until(() => clients.every((c) => c.updates.length > 0 && last(c).view.players.every((p) => p.connected)), 'connexions');
  const ack = await emit(clients[0]!, 'lobby:start');
  expect(ack).toEqual({ ok: true });
  await until(() => clients.every((c) => last(c).view.status === 'RUNNING'), 'démarrage');
  const order = last(clients[0]!).view.game!.players.map((p) => p.player);
  const byPos = order.map((id) => clients.find((c) => c.playerId === id)!);
  return { code, clients, byPos, host: clients[0]!, order };
}

describe('API HTTP', () => {
  it('création, arrivée, santé ; erreurs sans détail interne', async () => {
    const env = await start();
    expect((await (await fetch(env.url + '/health')).json())).toEqual({ ok: true });
    const created = await env.post('/rooms', CFG);
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^POKER-/);
    expect(created.body.token).toHaveLength(48);
    const j = await env.post(`/rooms/${created.body.code}/join`, { nickname: 'Alice', avatar: 'lion_2' });
    expect(j.status).toBe(201);
    expect((await env.post(`/rooms/${created.body.code}/join`, { nickname: 'alice' })).status).toBe(409);
    expect((await env.post('/rooms/POKER-ZZZZ/join', { nickname: 'X' })).body.error.code).toBe('ROOM_NOT_FOUND');
    expect((await env.post('/rooms', { ...CFG, targetPoints: 6 })).status).toBe(400);
    expect((await env.post('/rooms', { ...CFG, stakeCents: 1_000_001 })).body.error.code).toBe('BAD_REQUEST');
    expect((await env.post('/rooms', '{pas du json', true)).status).toBe(400);
    expect((await env.post('/rooms', 'x'.repeat(20_000), true)).status).toBeGreaterThanOrEqual(400); // corps trop gros
  });

  it('limitation de débit : au-delà de N tentatives par IP, 429', async () => {
    const env = await start({ httpMax: 4 });
    const created = await env.post('/rooms', CFG); // 1 création
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await env.post(`/rooms/${created.body.code}/join`, { nickname: `N${i}` })).status);
    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('WebSocket : authentification', () => {
  it('jeton invalide, absent ou room inconnue : refusé, déconnecté, rien de diffusé', async () => {
    const env = await start();
    const created = await env.post('/rooms', CFG);
    for (const [code, token] of [[created.body.code, 'jeton-invalide-du-tout-123'], ['POKER-ZZZZ', created.body.token], ['', '']] as const) {
      const c = env.open(code, 'x', token);
      await until(() => c.fatal.length > 0, 'fatal');
      expect(c.fatal[0]).toMatchObject({ code: 'UNAUTHORIZED' });
      await until(() => !c.socket.connected, 'déconnexion');
      expect(c.updates).toHaveLength(0);
    }
  });
});

describe('WebSocket : partie de bout en bout', () => {
  it('lobby → démarrage → variante → showdown, tout le monde synchronisé ; les non-hôtes ne démarrent pas', async () => {
    const env = await start({ stacks: { 1: closedWin(3, 1) } });
    const created = await env.post('/rooms', CFG);
    const b = await env.post(`/rooms/${created.body.code}/join`, { nickname: 'Alice' });
    const host = env.open(created.body.code, created.body.playerId, created.body.token);
    const alice = env.open(created.body.code, b.body.playerId, b.body.token);
    await until(() => last(host)?.view.players.every((p) => p.connected) === true && alice.updates.length > 0, 'lobby');
    expect((await emit(alice, 'lobby:start')).error).toMatchObject({ code: 'FORBIDDEN' });
    expect(await emit(host, 'lobby:start')).toEqual({ ok: true });
    await until(() => last(host).view.status === 'RUNNING' && last(alice).view.status === 'RUNNING');
    expect(last(host).version).toBe(last(alice).version); // même version au même moment

    const byPos = last(host).view.game!.players.map((p) => (p.player === host.playerId ? host : alice));
    expect((await emit(byPos[1]!, 'command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' })).error).toMatchObject({ code: 'RULE', ruleCode: 'NOT_YOUR_TURN' });
    expect((await emit(byPos[0]!, 'command', { type: 'TIMEOUT' })).error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await emit(byPos[0]!, 'command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' })).toEqual({ ok: true });
    await until(() => last(alice).view.game!.phase === 'ROUND');
    env.scheduler.advance(60_000); // échéance côté serveur : 0 change pour tous → showdown
    await until(() => last(host).view.game!.history.length === 1 && last(alice).view.game!.history.length === 1, 'showdown');
  });

  it('aucune carte cachée adverse ne transite par le réseau avant le showdown', async () => {
    const env = await start({ stacks: { 1: closedWin(3, 1) } });
    const g = await game(env);
    expect(await emit(g.byPos[0]!, 'command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_2' })).toEqual({ ok: true });
    await until(() => g.clients.every((c) => last(c).view.game!.phase === 'ROUND'));
    const hands = [LOSERS[0]!, WIN, LOSERS[1]!];
    await new Promise((r) => setTimeout(r, 50));
    for (let me = 0; me < 3; me++) {
      const seen = new Set<string>();
      for (const u of g.byPos[me]!.updates) codesIn(u).forEach((c) => seen.add(c));
      for (let other = 0; other < 3; other++) {
        if (other !== me) for (const c of hands[other]!) expect(seen.has(c), `${c} reçu par la position ${me}`).toBe(false);
      }
      for (const c of hands[me]!) expect(seen.has(c)).toBe(true); // mais chacun voit sa propre main
    }
  });

  it('reconnexion : l\'état complet et l\'échéance sont restaurés ; les autres voient la connexion changer', async () => {
    const env = await start({ stacks: { 1: closedWin(3, 1) } });
    const g = await game(env);
    await emit(g.byPos[0]!, 'command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    await until(() => last(g.byPos[2]!).view.game!.phase === 'ROUND');
    const victim = g.byPos[2]!;
    const before = last(victim).view;
    victim.socket.close();
    await until(() => last(g.byPos[0]!).view.players.find((p) => p.id === victim.playerId)!.connected === false, 'hors ligne');
    env.scheduler.advance(9_000);
    const again = env.open(g.code, victim.playerId, victim.token); // même jeton
    await until(() => again.updates.length > 0 && last(again).view.players.find((p) => p.id === victim.playerId)!.connected, 'reconnexion');
    const after = last(again).view;
    expect(after.deadline).toEqual(before.deadline); // même échéance : le temps écoulé hors ligne compte
    expect(after.game!.round!.cards.hands[victim.playerId]).toEqual(before.game!.round!.cards.hands[victim.playerId]);
    expect(after.serverTime).toBe(before.serverTime + 9_000);
  });

  it('plusieurs onglets pour un même joueur : hors ligne seulement quand le dernier se ferme', async () => {
    const env = await start();
    const g = await game(env);
    const second = env.open(g.code, g.clients[1]!.playerId, g.clients[1]!.token);
    await until(() => second.updates.length > 0);
    g.clients[1]!.socket.close();
    await new Promise((r) => setTimeout(r, 60));
    expect(last(g.host).view.players.find((p) => p.id === g.clients[1]!.playerId)!.connected).toBe(true);
    second.socket.close();
    await until(() => last(g.host).view.players.find((p) => p.id === g.clients[1]!.playerId)!.connected === false);
  });

  it('exclusion par l\'hôte : le joueur en est informé et déconnecté ; un non-hôte ne peut pas exclure', async () => {
    const env = await start();
    const created = await env.post('/rooms', CFG);
    const a = await env.post(`/rooms/${created.body.code}/join`, { nickname: 'Alice' });
    const host = env.open(created.body.code, created.body.playerId, created.body.token);
    const alice = env.open(created.body.code, a.body.playerId, a.body.token);
    await until(() => alice.updates.length > 0 && host.updates.length > 0);
    expect((await emit(alice, 'host:exclude', { playerId: host.playerId })).error).toMatchObject({ code: 'FORBIDDEN' });
    expect((await emit(host, 'host:exclude', { playerId: 42 })).error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await emit(host, 'host:exclude', { playerId: alice.playerId })).toEqual({ ok: true });
    await until(() => alice.kicked.length === 1, 'kicked');
    await until(() => !alice.socket.connected, 'déconnexion');
  });

  it('annulation par l\'hôte : la room passe à CANCELLED pour tous', async () => {
    const env = await start();
    const created = await env.post('/rooms', CFG);
    const a = await env.post(`/rooms/${created.body.code}/join`, { nickname: 'Alice' });
    const host = env.open(created.body.code, created.body.playerId, created.body.token);
    const alice = env.open(created.body.code, a.body.playerId, a.body.token);
    await until(() => alice.updates.length > 0 && host.updates.length > 0);
    expect(await emit(host, 'lobby:cancel')).toEqual({ ok: true });
    await until(() => last(alice).view.status === 'CANCELLED');
  });

  it('resync à la demande ; limitation de débit par connexion ; messages mal formés sans effet', async () => {
    const env = await start({ socketMax: 6 });
    const g = await game(env);
    const c = g.clients[1]!;
    const n = c.updates.length;
    expect(await emit(c, 'state:resync')).toEqual({ ok: true });
    await until(() => c.updates.length > n);
    expect(last(c).events).toEqual([]);
    const acks = [];
    for (let i = 0; i < 8; i++) acks.push(await emit(c, 'command', 'pas un objet'));
    expect(acks.some((a) => a.ok === false && a.error.code === 'RATE_LIMITED')).toBe(true);
    expect(acks.some((a) => a.ok === false && a.error.code === 'BAD_REQUEST')).toBe(true);
  });
});

describe('assistance : vote par WebSocket (vrais sockets)', () => {
  /** Salle d'attente de 3 joueurs connectés, partie non démarrée, assistance proposée par l'hôte. */
  async function waiting(env: Awaited<ReturnType<typeof start>>, assistance = true) {
    const created = await env.post('/rooms', { ...CFG, assistance });
    const code = created.body.code as string;
    const players = [{ playerId: created.body.playerId as string, token: created.body.token as string }];
    for (const nickname of ['Alice', 'Bob']) {
      const j = await env.post(`/rooms/${code}/join`, { nickname });
      players.push({ playerId: j.body.playerId, token: j.body.token });
    }
    const clients = players.map((p) => env.open(code, p.playerId, p.token));
    await until(() => clients.every((c) => c.updates.length > 0 && last(c).view.players.every((p) => p.connected)), 'connexions');
    return { code, clients, host: clients[0]! };
  }

  it('chaque joueur voit en direct les votes des autres ; l’unanimité active l’assistance pour tous', async () => {
    const env = await start();
    const { clients, host } = await waiting(env);
    expect(last(clients[1]!).view.config.assistance).toBe(true);
    expect(await emit(clients[1]!, 'lobby:approveAssistance', { approve: true })).toEqual({ ok: true });
    await until(() => last(host).view.players.find((p) => p.id === clients[1]!.playerId)!.assistanceApproved === true, 'vote de Alice visible');
    expect(last(host).view.players.find((p) => p.id === clients[2]!.playerId)!.assistanceApproved).toBeNull(); // pas encore répondu
    await emit(clients[2]!, 'lobby:approveAssistance', { approve: true });
    await until(() => last(host).view.players.every((p) => p.assistanceApproved === true), 'tous approuvés');
    await emit(host, 'lobby:start');
    await until(() => clients.every((c) => last(c).view.status === 'RUNNING'), 'démarrage');
    for (const c of clients) expect(last(c).view.game!.assistance).toBe(true);
  });

  it('un seul refus : la partie démarre sans assistance', async () => {
    const env = await start();
    const { clients, host } = await waiting(env);
    await emit(clients[1]!, 'lobby:approveAssistance', { approve: true });
    await emit(clients[2]!, 'lobby:approveAssistance', { approve: false });
    await emit(host, 'lobby:start');
    await until(() => clients.every((c) => last(c).view.status === 'RUNNING'), 'démarrage');
    for (const c of clients) expect(last(c).view.game!.assistance).toBe(false);
  });

  it('charge utile invalide, vote sans proposition, vote après le départ : refusés avec un code clair', async () => {
    const env = await start();
    const { clients, host } = await waiting(env);
    const bad = await emit(clients[1]!, 'lobby:approveAssistance', { approve: 'oui' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await emit(clients[1]!, 'lobby:approveAssistance', undefined)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    await emit(host, 'lobby:start');
    await until(() => clients.every((c) => last(c).view.status === 'RUNNING'), 'démarrage');
    expect(await emit(clients[1]!, 'lobby:approveAssistance', { approve: true })).toMatchObject({ ok: false, error: { code: 'WRONG_STATE' } });
    const env2 = await start();
    const w2 = await waiting(env2, false); // rien de proposé
    expect(await emit(w2.clients[1]!, 'lobby:approveAssistance', { approve: true })).toMatchObject({ ok: false, error: { code: 'WRONG_STATE' } });
  });

  it('secret : l’assistance n’expose que la combinaison du joueur, jamais celle d’un autre', async () => {
    const env = await start({ stacks: { 1: closedWin(3, 0) } });
    const { clients, host } = await waiting(env);
    for (const c of clients.slice(1)) await emit(c, 'lobby:approveAssistance', { approve: true });
    await emit(host, 'lobby:start');
    await until(() => clients.every((c) => last(c).view.status === 'RUNNING'), 'démarrage');
    const chooser = last(host).view.game!.chooser;
    await emit(clients.find((c) => c.playerId === chooser)!, 'command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    await until(() => clients.every((c) => last(c).view.game!.round !== null), 'manche démarrée');
    const seen = clients.map((c) => (last(c).view.game!.round!.info as { assistCategory: number }).assistCategory);
    expect(seen.every((x) => typeof x === 'number')).toBe(true);
    // la vue d'un joueur ne contient qu'une seule valeur d'assistance (la sienne)
    for (const c of clients) expect(JSON.stringify(last(c).view).match(/assistCategory/g)).toHaveLength(1);
  });
});
