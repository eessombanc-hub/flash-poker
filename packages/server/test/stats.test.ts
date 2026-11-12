import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

describe('GET /stats : joueurs en ligne et parties ouvertes', () => {
  it('compte les onglets distincts vus depuis moins de 45 s, et les parties ouvertes', async () => {
    const scheduler = new ManualScheduler();
    const manager = new RoomManager({ rng: new SeededRng(3), scheduler });
    const server = await buildServer({ manager, onError: () => undefined, now: () => scheduler.now(), httpRateLimit: { max: 1000, windowMs: 60_000 } });
    cleanup.push(() => server.close());
    const get = async (v?: string) => (await server.app.inject({ method: 'GET', url: `/stats${v ? `?v=${v}` : ''}` })).json() as { online: number; rooms: number };

    expect(await get()).toEqual({ online: 0, rooms: 0 }); // sans identifiant : rien n'est compté
    expect(await get('visiteur-aaaaaaaa')).toEqual({ online: 1, rooms: 0 });
    expect((await get('visiteur-aaaaaaaa')).online).toBe(1); // même onglet : un seul
    expect((await get('visiteur-bbbbbbbb')).online).toBe(2);
    expect((await get('x')).online).toBe(2); // identifiant invalide ignoré

    manager.createRoom({ name: 'Ouverte', maxPlayers: 3, targetPoints: 2, stakeChips: 0, nickname: 'Ana' }, null);
    manager.createRoom({ name: 'Privée', maxPlayers: 3, targetPoints: 2, stakeChips: 0, nickname: 'Bob', private: true }, null);
    expect((await get('visiteur-aaaaaaaa')).rooms).toBe(1); // les parties privées n'y figurent pas

    scheduler.advance(30_000);
    expect((await get('visiteur-aaaaaaaa')).online).toBe(2); // b a 30 s : encore en ligne
    scheduler.advance(20_000);
    expect((await get('visiteur-aaaaaaaa')).online).toBe(1); // b a 50 s : parti
  });
});
