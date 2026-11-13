import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function make() {
  const scheduler = new ManualScheduler();
  const manager = new RoomManager({ rng: new SeededRng(3), scheduler });
  const server = await buildServer({ manager, onError: () => undefined, now: () => scheduler.now(), httpRateLimit: { max: 1000, windowMs: 60_000 } });
  cleanup.push(() => server.close());
  const post = (body: unknown) => server.app.inject({ method: 'POST', url: '/chat', payload: body as object });
  const get = async (since = 0) => (await server.app.inject({ method: 'GET', url: `/chat?since=${since}` })).json() as { messages: { id: number; nickname: string; text: string }[]; last: number };
  return { scheduler, post, get };
}

describe('chat public de l’accueil', () => {
  it('un invité écrit sous un pseudo, chacun relit les nouveaux messages', async () => {
    const { post, get } = await make();
    expect((await get()).messages).toEqual([]);
    const r = await post({ text: 'Bonjour à tous', nickname: 'Ana' });
    expect(r.statusCode).toBe(201);
    await post({ text: 'Une partie ?', nickname: 'Bob' });
    const all = await get();
    expect(all.messages.map((m) => `${m.nickname}: ${m.text}`)).toEqual(['Ana: Bonjour à tous', 'Bob: Une partie ?']);
    expect((await get(all.messages[0]!.id)).messages).toHaveLength(1);
    expect((await get(all.last)).messages).toHaveLength(0);
  });

  it('refuse un message sans pseudo, vide, ou contenant un lien', async () => {
    const { post } = await make();
    expect((await post({ text: 'Salut' })).statusCode).toBe(400);
    expect((await post({ text: '   ', nickname: 'Ana' })).statusCode).toBe(400);
    expect((await post({ text: 'Venez sur www.exemple.fr', nickname: 'Ana' })).statusCode).toBe(400);
    expect((await post({ text: 'https://exemple.com', nickname: 'Ana' })).statusCode).toBe(400);
  });

  it('freine le débit et les doublons d’un même auteur', async () => {
    const { post, scheduler } = await make();
    for (let i = 0; i < 4; i++) expect((await post({ text: `message ${i}`, nickname: 'Ana' })).statusCode).toBe(201);
    expect((await post({ text: 'message 5', nickname: 'Ana' })).statusCode).toBe(429);
    scheduler.advance(11_000);
    expect((await post({ text: 'message 3', nickname: 'Ana' })).statusCode).toBe(429); // doublon récent
    expect((await post({ text: 'autre chose', nickname: 'Ana' })).statusCode).toBe(201);
  });

  it('ne conserve que les derniers messages', async () => {
    const { post, get, scheduler } = await make();
    for (let i = 0; i < 100; i++) {
      scheduler.advance(3_000);
      await post({ text: `m${i}`, nickname: `P${i % 10}` });
    }
    const first = await get();
    expect(first.messages).toHaveLength(40);
    expect(first.messages.at(-1)!.text).toBe('m99');
  });
});
