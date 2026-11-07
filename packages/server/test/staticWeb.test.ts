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

describe('aperçu des liens partagés (balises Open Graph)', () => {
  const TEMPLATE =
    '<!doctype html><title>Flash Poker</title><meta property="og:title" content="Flash Poker" /><meta property="og:description" content="Huit variantes" /><meta property="og:image" content="__APP_URL__/og-image.jpg" />';

  async function startWith(publicUrl?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'flashpoker-og-'));
    writeFileSync(join(dir, 'index.html'), TEMPLATE);
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() });
    const server = await buildServer({ manager, onError: () => undefined, webDist: dir, publicUrl });
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    cleanup.push(() => server.close());
    return `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;
  }

  it('image d’aperçu en adresse complète ; page d’accueil jamais mise en cache', async () => {
    const url = await startWith('https://jeu.example/');
    const res = await fetch(`${url}/`);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('content="https://jeu.example/og-image.jpg"');
  });

  it('lien de partie : titre « Une table vous attend », sans le nom de la salle', async () => {
    const url = await startWith('https://jeu.example');
    const html = await (await fetch(`${url}/?code=poker-7k2m`)).text();
    expect(html).toContain('content="Une table de Flash Poker vous attend"');
    expect(html).toContain('Partie POKER-7K2M');
  });

  it('paramètres invalides ou piégés : aperçu par défaut, rien d’injecté', async () => {
    const url = await startWith('https://jeu.example');
    const html = await (await fetch(`${url}/?code=${encodeURIComponent('"><script>x</script>')}&invitation=${encodeURIComponent('<b>')}`)).text();
    expect(html).not.toContain('<script>x');
    expect(html).toContain('content="Flash Poker"');
  });
});
