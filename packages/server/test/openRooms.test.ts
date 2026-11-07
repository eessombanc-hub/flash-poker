import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { closedWin, makeManager, setup } from './helpers';

// Liste publique des parties ouvertes (`listOpen()` / `GET /rooms`) : vérifie ce qui doit y figurer (en
// attente ou en cours, avec un siège libre) et ce qui ne doit jamais y figurer (complètes, terminées,
// annulées) — et qu'aucune donnée privée (pseudo, jeton) n'y fuit.

const CFG = { name: 'Table', maxPlayers: 4, targetPoints: 5, stakeChips: 2000, nickname: 'Host' };

describe('RoomManager.listOpen', () => {
  it('une room en attente avec des sièges libres apparaît, avec les bons champs publics', () => {
    const { m } = makeManager();
    m.createRoom(CFG);
    const list = m.listOpen();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      code: expect.stringMatching(/^POKER-/),
      name: 'Table',
      status: 'WAITING',
      maxPlayers: 4,
      seatsLeft: 3,
      targetPoints: 5,
      stakeChips: 2000,
      assistance: false,
    });
  });

  it('une salle privée n’apparaît jamais dans la liste, mais reste accessible par son code', () => {
    const { m } = makeManager();
    const r = m.createRoom({ ...CFG, private: true });
    m.createRoom({ ...CFG, name: 'Publique' });
    expect(m.listOpen().map((x) => x.name)).toEqual(['Publique']);
    const j = m.joinRoom(r.code, { nickname: 'Ami' });
    expect(j.playerId).toBeTruthy();
    expect(m.view(r.code, r.playerId).config.private).toBe(true);
  });

  it('une room complète (sièges = 0) disparaît de la liste', () => {
    const { m } = makeManager();
    const r = m.createRoom({ ...CFG, maxPlayers: 2 });
    expect(m.listOpen()).toHaveLength(1);
    m.joinRoom(r.code, { nickname: 'J1' });
    expect(m.listOpen()).toHaveLength(0);
  });

  it('une room annulée disparaît de la liste', () => {
    const { m } = makeManager();
    const r = m.createRoom(CFG);
    m.cancelRoom(r.code, r.playerId);
    expect(m.listOpen()).toHaveLength(0);
  });

  it('une room terminée disparaît de la liste', () => {
    const env = setup(2, { 1: closedWin(1, 0) }, { targetPoints: 1 });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    env.act(0, { type: 'SELECT', cards: [] });
    env.act(0, { type: 'VALIDATE' });
    env.act(1, { type: 'SELECT', cards: [] });
    env.act(1, { type: 'VALIDATE' });
    expect(env.m.view(env.code, env.host.playerId).status).toBe('FINISHED');
    expect(env.m.listOpen()).toHaveLength(0);
  });

  it('une room en cours avec un siège libre apparaît (statut RUNNING, rejoignable en file d’attente)', () => {
    const env = setup(2, {}, { maxPlayers: 4 });
    const list = env.m.listOpen();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: env.code, status: 'RUNNING', seatsLeft: 2 });
  });

  it('plusieurs rooms : les plus récentes en premier', () => {
    const scheduler = new ManualScheduler();
    const { m } = makeManager({}, { scheduler });
    const r1 = m.createRoom({ ...CFG, name: 'Première' });
    scheduler.advance(1000);
    const r2 = m.createRoom({ ...CFG, name: 'Seconde' });
    const list = m.listOpen();
    expect(list.map((r) => r.code)).toEqual([r2.code, r1.code]);
  });

  it('aucune donnée privée (pseudo, jeton, joueurs) dans les entrées de la liste', () => {
    const { m } = makeManager();
    m.createRoom(CFG);
    const entry = m.listOpen()[0] as unknown as Record<string, unknown>;
    expect(entry).not.toHaveProperty('players');
    expect(entry).not.toHaveProperty('hostId');
    expect(entry).not.toHaveProperty('token');
  });
});

describe('GET /rooms', () => {
  const cleanup: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    for (const fn of cleanup.splice(0).reverse()) await fn();
  });

  async function start() {
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() });
    const server: BuiltServer = await buildServer({ manager, onError: () => undefined });
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (server.app.server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;
    cleanup.push(() => server.close());
    return { manager, url };
  }

  it('renvoie { rooms: [] } sans partie créée', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/rooms`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rooms: [] });
  });

  it('renvoie la room créée via la même API HTTP', async () => {
    const { url } = await start();
    await fetch(`${url}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CFG) });
    const res = await fetch(`${url}/rooms`);
    const body = (await res.json()) as { rooms: Array<{ name: string; status: string }> };
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]).toMatchObject({ name: 'Table', status: 'WAITING' });
  });
});
