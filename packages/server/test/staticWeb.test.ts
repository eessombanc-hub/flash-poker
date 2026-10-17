import { SeededRng } from '@poker/engine';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

// Vérifie le service des fichiers statiques du build web (`webDist`), utilisé pour un déploiement à
// service unique (ex. Render) où le même serveur Node sert l'API, le WebSocket et l'interface.

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function start(webDist?: string) {
  const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() });
  const server: BuiltServer = await buildServer({ manager, onError: () => undefined, webDist });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.app.server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  cleanup.push(() => server.close());
  return { url };
}

function makeFakeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flashpoker-webdist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Flash Poker</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log("build factice pour le test")');
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('service des fichiers statiques (webDist)', () => {
  it('sans webDist : aucune route statique, 404 Fastify normal sur une URL inconnue', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/une-url-qui-n-existe-pas`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('NOT_FOUND');
  });

  it('avec webDist : un fichier existant (app.js) est servi tel quel', async () => {
    const dist = makeFakeBuild();
    const { url } = await start(dist);
    const res = await fetch(`${url}/app.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('build factice');
  });

  it('avec webDist : une URL inconnue (ex. rechargement de page) retombe sur index.html (SPA)', async () => {
    const dist = makeFakeBuild();
    const { url } = await start(dist);
    const res = await fetch(`${url}/table/POKER-ABCD`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Flash Poker');
    // index.html ne doit jamais hériter du cache long (1 an) appliqué aux autres fichiers du build.
    expect(res.headers.get('cache-control') ?? '').not.toContain('max-age=31536000');
  });

  it("avec webDist : /health et /rooms restent prioritaires, jamais masqués par le fallback index.html", async () => {
    const dist = makeFakeBuild();
    const { url } = await start(dist);
    const health = await fetch(`${url}/health`);
    expect(await health.json()).toEqual({ ok: true });

    const badRoom = await fetch(`${url}/rooms/POKER-ZZZZ/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'X' }),
    });
    expect(badRoom.status).not.toBe(200); // code inconnu → erreur métier, jamais l'index.html
    const body = (await badRoom.json()) as { error?: { code?: string } };
    expect(body.error).toBeDefined();
  });

  it('un chemin webDist inexistant sur le disque est ignoré sans planter le serveur (comportement par défaut)', async () => {
    const { url } = await start('/chemin/qui/n-existe-pas-du-tout');
    const res = await fetch(`${url}/health`);
    expect(await res.json()).toEqual({ ok: true });
  });
});
