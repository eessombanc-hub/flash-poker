import { dirname, join } from 'node:path';
import { CryptoRng } from '@poker/engine';
import { AccountDb } from './accounts/db';
import { resolveMailer } from './accounts/mailer';
import { AccountService } from './accounts/service';
import { BlackjackService } from './blackjack/service';
import { BlackjackTables } from './blackjack/tables';
import { TableauService } from './tableau/service';
import { buildServer } from './http';
import { resolveTrustProxy } from './netSecurity';
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
// Comptes joueurs : fichier SQLite à côté de celui des parties (ACCOUNTS_DB_PATH pour le déplacer) ; en mémoire si STORE=memory.
// E-mails (mot de passe oublié, favori connecté) : variables SMTP_* (voir accounts/mailer.ts) ; sans elles, rien ne part.
const accountsPath = process.env.STORE === 'memory' ? ':memory:' : (process.env.ACCOUNTS_DB_PATH ?? join(dirname(process.env.DB_PATH ?? './data/flashpoker.db'), 'comptes.db'));
const mailer = resolveMailer(process.env);
const accountsDb = new AccountDb(accountsPath);
const accounts = new AccountService(accountsDb, mailer, { appUrl: process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL });
console.log(mailer.enabled ? 'E-mails activés (SMTP)' : 'E-mails désactivés : SMTP non configuré (mot de passe oublié indisponible)');
const blackjack = new BlackjackService(accountsDb);
const blackjackTables = new BlackjackTables(accountsDb, blackjack);
const tableau = new TableauService(accountsDb, blackjack);
const manager = new RoomManager({
  rng: new CryptoRng(),
  scheduler,
  store,
  accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => {
      accounts.recordGame(g);
      // Progression commune : le poker nourrit la même XP que le Blackjack.
      for (const p of g.players) if (p.accountId && g.seated.includes(p.playerId)) blackjack.awardXp(p.accountId, 40 + (g.outcome.winner === p.playerId ? 60 : 0));
    }, canAfford: (id, stake) => accounts.canAfford(id, stake) },
  ...(testTimers ? { timers: { durationMs: phaseSeconds * 1000, warningMs: 10_000 } } : {}),
});
await manager.restoreFromStore();

// WEB_DIST (ex. ../web/dist, défini sur Render) : ce même serveur sert aussi l'interface, même origine.
// Absent en développement local : l'interface tourne séparément via Vite (`npm run dev`).
// HTTP_RATE_LIMIT : nombre de créations / arrivées par minute et par adresse (30 par défaut). Réglage réservé aux
// tests automatisés, où tous les joueurs simulés partagent la même adresse.
const httpMax = Number(process.env.HTTP_RATE_LIMIT ?? 30);
const server = await buildServer({
  manager,
  accounts,
  blackjack,
  blackjackTables,
  tableau,
  publicUrl: process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  trustProxy: resolveTrustProxy(process.env),
  debugIp: process.env.DEBUG_IP === '1',
  webDist: process.env.WEB_DIST,
  ...(Number.isInteger(httpMax) && httpMax > 0 && httpMax !== 30
    ? { httpRateLimit: { max: httpMax, windowMs: 60_000 }, authRateLimit: { max: httpMax, windowMs: 60_000 } }
    : {}),
});
setInterval(() => manager.sweep(), 60_000).unref();

const port = Number(process.env.PORT ?? 3000);
await server.app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
console.log(`Serveur poker sur :${port}`);
