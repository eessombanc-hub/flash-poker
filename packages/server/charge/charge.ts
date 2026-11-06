/**
 * Test de charge : de nombreuses parties simultanées, jouées par des robots connectés en temps réel.
 *
 *   npm -w @poker/server run charge                       (50 tables de 4 joueurs)
 *   TABLES=150 JOUEURS=4 npm -w @poker/server run charge  (600 connexions)
 *
 * Le vrai serveur (Fastify + Socket.IO + sauvegarde SQLite sur disque) tourne dans ce processus ; seule la
 * limite de créations de parties par adresse IP est relevée, puisque tous les robots partagent la même adresse.
 * Les robots jouent le poker fermé à 1 change en gardant leur main : aucune règle n'est simulée ni modifiée,
 * le moteur arbitre comme en vrai. Mesures : délai d'accusé de réception des commandes (p50, p95, p99),
 * manches jouées par seconde, mémoire du serveur, erreurs.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoRng } from '@poker/engine';
import { io as connect, type Socket } from 'socket.io-client';
import { buildServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { RealScheduler } from '../src/scheduler';
import { SqliteRoomStore } from '../src/store';

const TABLES = Number(process.env.TABLES ?? 50);
const PLAYERS = Number(process.env.JOUEURS ?? 4);
const TARGET = Number(process.env.OBJECTIF ?? 3);
const LIMIT_S = Number(process.env.DUREE_MAX_S ?? 240);

type Ack = { ok: boolean; error?: { code: string; message: string } };
const latencies: number[] = [];
const errors: string[] = [];
let rounds = 0;
let finishedTables = 0;

function pct(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : NaN;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'flashpoker-charge-'));
  const store = new SqliteRoomStore(join(dir, 'charge.db'));
  const manager = new RoomManager({ rng: new CryptoRng(), scheduler: new RealScheduler(), store });
  const server = await buildServer({ manager, httpRateLimit: { max: 1_000_000, windowMs: 60_000 }, onError: (e) => errors.push(String(e)) });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
    return (await r.json()) as { code: string; playerId: string; token: string };
  };

  console.log(`Charge : ${TABLES} tables × ${PLAYERS} joueurs = ${TABLES * PLAYERS} connexions, objectif ${TARGET} points.`);
  const t0 = performance.now();
  const sockets: Socket[] = [];
  const done: Promise<void>[] = [];

  for (let t = 0; t < TABLES; t++) {
    const host = await post('/rooms', { name: `Charge ${t}`, maxPlayers: PLAYERS, targetPoints: TARGET, stakeCents: 1000, nickname: 'Hote' });
    const seats = [host];
    for (let i = 1; i < PLAYERS; i++) seats.push({ ...(await post(`/rooms/${host.code}/join`, { nickname: `Robot${i}` })), code: host.code });

    let resolveTable!: () => void;
    done.push(new Promise((r) => (resolveTable = r)));
    let tableOver = false;
    for (const seat of seats) {
      const s = connect(base, { auth: { code: host.code, token: seat.token }, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      let lastKey = '';
      const send = (event: string, payload?: unknown) => {
        const start = performance.now();
        s.emit(event, payload, (ack: Ack) => {
          latencies.push(performance.now() - start);
          if (!ack.ok && ack.error?.code !== 'RULE') errors.push(`${event} : ${ack.error?.code} ${ack.error?.message}`);
        });
      };
      s.on('connect_error', (e) => errors.push(`connexion : ${e.message}`));
      s.on('update', (msg: { view: { status: string; game: null | { phase: string; chooser: string; awaiting: string[]; roundNo: number; timer: { key: string } | null } } }) => {
        const g = msg.view.game;
        if (msg.view.status === 'FINISHED' || g?.phase === 'GAME_OVER') {
          if (!tableOver) {
            tableOver = true;
            finishedTables++;
            resolveTable();
          }
          return;
        }
        if (!g || !g.awaiting.includes(seat.playerId)) return;
        const key = g.timer?.key ?? `${g.phase}:${g.roundNo}`;
        if (key === lastKey) return;                         // une seule action par phase attendue
        lastKey = key;
        if (g.phase === 'VARIANT_SELECTION' && g.chooser === seat.playerId) {
          rounds++;
          send('command', { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
        } else if (g.phase === 'ROUND') {
          send('command', { type: 'VALIDATE' });             // garder sa main : coup toujours légal au poker fermé
        }
      });
      await new Promise<void>((r) => s.once('update', () => r()));
    }
    sockets[sockets.length - PLAYERS]!.emit('lobby:start', null, () => undefined);
  }
  const setupS = (performance.now() - t0) / 1000;
  console.log(`Tables créées et connectées en ${setupS.toFixed(1)} s.`);

  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), LIMIT_S * 1000));
  const outcome = await Promise.race([Promise.all(done).then(() => 'ok' as const), timeout]);
  const totalS = (performance.now() - t0) / 1000;
  const sorted = [...latencies].sort((a, b) => a - b);
  const mem = process.memoryUsage();

  console.log('\n— Résultats —');
  console.log(`Parties terminées : ${finishedTables} / ${TABLES}${outcome === 'timeout' ? ` (arrêt après ${LIMIT_S} s)` : ''}`);
  console.log(`Manches jouées : ${rounds} en ${totalS.toFixed(1)} s (${(rounds / totalS).toFixed(1)} manches/s)`);
  console.log(`Commandes : ${latencies.length} ; accusé de réception p50 ${pct(sorted, 50).toFixed(1)} ms, p95 ${pct(sorted, 95).toFixed(1)} ms, p99 ${pct(sorted, 99).toFixed(1)} ms, max ${(sorted.at(-1) ?? NaN).toFixed(1)} ms`);
  console.log(`Mémoire (serveur et robots ensemble) : ${(mem.rss / 1e6).toFixed(0)} Mo`);
  console.log(`Erreurs : ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 10).join('\n  ') : ''}`);

  for (const s of sockets) s.disconnect();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
  process.exit(errors.length || outcome === 'timeout' ? 1 : 0);
}

void main();
