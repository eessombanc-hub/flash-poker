import { CryptoRng } from '@poker/engine';
import { buildServer } from './http';
import { RoomManager } from './roomManager';
import { RealScheduler } from './scheduler';
import { resolveStore, SqliteRoomStore } from './store';

// Garde-fou : la sauvegarde des parties utilise `node:sqlite`, disponible sans option depuis Node 22.13.
// Sans cette vérification, une version de Node trop ancienne produirait une erreur technique peu claire
// (« Cannot find module 'node:sqlite' ») au lieu de ce message explicite.
{
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error(
      `Version de Node.js trop ancienne (${process.versions.node}). Flash Poker nécessite Node 22.13 ou plus récent ` +
        `(sauvegarde des parties). Installez la dernière version « LTS » depuis https://nodejs.org puis relancez.`,
    );
    process.exit(1);
  }
}

const scheduler = new RealScheduler();
// Persistance sur disque par défaut (SQLite) : les parties survivent à un redémarrage du serveur.
// STORE=memory (essai local uniquement) revient à l'ancien comportement : tout est perdu à l'arrêt.
// DB_PATH change l'emplacement du fichier (utile pour plusieurs instances de test sur la même machine).
const store = resolveStore(process.env);
if (store instanceof SqliteRoomStore) console.log(`Parties sauvegardées dans ${process.env.DB_PATH ?? './data/flashpoker.db'} (survivent à un redémarrage)`);
// Règle validée : minuteurs de 60 s. PHASE_SECONDS n'existe que pour essayer le jeu seul (défaut inchangé) ;
// il n'est jamais proposé à l'hôte d'une partie.
const phaseSeconds = Number(process.env.PHASE_SECONDS ?? 60);
const testTimers = Number.isInteger(phaseSeconds) && phaseSeconds >= 15 && phaseSeconds <= 600 && phaseSeconds !== 60;
if (testTimers) console.warn(`⚠ Minuteurs allongés à ${phaseSeconds} s (mode essai) : la règle est de 60 s.`);
const manager = new RoomManager({ rng: new CryptoRng(), scheduler, store, ...(testTimers ? { timers: { durationMs: phaseSeconds * 1000, warningMs: 10_000 } } : {}) });
await manager.restoreFromStore();

// WEB_DIST (ex. ../web/dist, défini sur Render) : ce même serveur sert aussi l'interface, même origine.
// Absent en développement local : l'interface tourne séparément via Vite (`npm run dev`).
const server = await buildServer({ manager, corsOrigin: process.env.CORS_ORIGIN, webDist: process.env.WEB_DIST });
setInterval(() => manager.sweep(), 60_000).unref();

const port = Number(process.env.PORT ?? 3000);
await server.app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
console.log(`Serveur poker sur :${port}`);
