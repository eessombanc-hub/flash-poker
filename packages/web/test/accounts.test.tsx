import { SeededRng } from '@poker/engine';
import { AccountDb } from '@poker/server/src/accounts/db';
import { LogMailer } from '@poker/server/src/accounts/mailer';
import { AccountService } from '@poker/server/src/accounts/service';
import { buildServer } from '@poker/server/src/http';
import { RoomManager } from '@poker/server/src/roomManager';
import { ManualScheduler } from '@poker/server/src/scheduler';
import { closedWin } from '@poker/server/test/helpers';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AccountClient } from '../src/lib/account';
import { GameClient } from '../src/lib/client';
import { AccountProvider, ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const until = (cond: () => unknown, label: string) => waitFor(() => expect(cond(), label).toBeTruthy(), { timeout: 5000, interval: 20 });

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

async function start() {
  const scheduler = new ManualScheduler();
  const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(true, () => undefined), { log: () => undefined });
  const manager = new RoomManager({
    rng: new SeededRng(11),
    scheduler,
    gameHooks: { stackedDeck: (r) => (r === 1 ? closedWin(2, 0) : undefined) },
    accounts: {
      isReservedNickname: (n) => accounts.isReservedNickname(n),
      onGameFinished: (g) => accounts.recordGame(g),
    },
  });
  const server = await buildServer({ manager, accounts, now: () => scheduler.now(), onError: () => undefined, httpRateLimit: { max: 1000, windowMs: 60_000 } });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;
  cleanup.push(() => server.close());
  const make = () => {
    const account = new AccountClient({ baseUrl: url, storage: memoryStorage() });
    const client = new GameClient({ baseUrl: url, storage: new MemorySessionStore(), accountToken: () => account.token });
    cleanup.push(() => {
      client.dispose();
      account.dispose();
    });
    return { account, client };
  };
  return { url, scheduler, make };
}

const renderApp = (p: { account: AccountClient; client: GameClient }) =>
  render(
    <ClientProvider client={p.client}>
      <AccountProvider account={p.account}>
        <App />
      </AccountProvider>
    </ClientProvider>,
  );

describe('comptes joueurs dans l’interface', () => {
  it('inscription depuis l’accueil, puis création de partie sous le pseudo du compte', async () => {
    const env = await start();
    const p = env.make();
    const user = userEvent.setup();
    renderApp(p);
    await user.click(await screen.findByRole('button', { name: /Se connecter/ }));
    await user.click(await screen.findByRole('button', { name: 'Créer un compte' }));
    await user.type(screen.getByLabelText('Pseudo'), 'Emeric');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'emeric@exemple.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('button', { name: /Emeric/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Créer une partie/ }));
    expect(screen.getByText(/Vous jouez sous le pseudo/)).toBeTruthy();
    expect(screen.queryByLabelText('Votre pseudo')).toBeNull();
    await user.type(screen.getByLabelText('Nom de la table'), 'Vendredi');
    await user.click(screen.getByRole('button', { name: 'Créer la table' }));
    await until(() => p.client.state.view?.players[0]?.nickname === 'Emeric', 'pseudo du compte');
    expect(p.client.state.view!.players[0]!.registered).toBe(true);
  });

  it('lien d’invitation : écran d’inscription avec l’invitant, puis favoris réciproques', async () => {
    const env = await start();
    const ana = env.make();
    await ana.account.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const { code } = await ana.account.invites();
    window.history.replaceState(null, '', `/?invitation=${code}`);
    const zoe = env.make();
    const user = userEvent.setup();
    renderApp(zoe);
    expect(await screen.findByText(/vous invite à rejoindre Flash Poker/)).toBeTruthy();
    expect(window.location.search).toBe(''); // lien retiré de la barre d'adresse
    await user.type(screen.getByLabelText('Pseudo'), 'Zoe');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'zoe@x.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('button', { name: /Zoe/ })).toBeTruthy();
    expect((await zoe.account.favorites()).map((f) => f.nickname)).toEqual(['Ana']);
    expect((await ana.account.invites()).joined.map((u) => u.nickname)).toEqual(['Zoe']);

    // Onglet « Inviter des amis » de Zoé : son propre lien
    await user.click(screen.getByRole('button', { name: /Zoe/ }));
    await user.click(await screen.findByRole('tab', { name: /Inviter des amis/ }));
    const input = (await screen.findByRole('textbox', { name: 'Lien d’invitation' })) as HTMLInputElement;
    expect(input.value).toMatch(/\/\?invitation=[A-Za-z0-9_-]+$/);
    expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toBeTruthy(); // e-mail activé sur ce serveur de test
  });

  it('un favori qui se connecte est annoncé dans l’application', async () => {
    const env = await start();
    const ana = env.make();
    const bea = env.make();
    await bea.account.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    await bea.account.logout();
    await ana.account.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    await ana.account.addFavorite('Bea');
    const seen: string[] = [];
    ana.account.onFavoriteOnline = (who) => seen.push(who.nickname);
    await new Promise((r) => setTimeout(r, 80)); // présence d'Ana établie
    await bea.account.login('bea@x.fr', 'motdepasse1');
    await until(() => seen.includes('Bea'), 'notification reçue');
  });

  it('Mon espace : historique, manche favorite, statistiques, bankroll', async () => {
    const env = await start();
    const ana = env.make();
    const guest = env.make();
    await ana.account.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1', avatar: 'rubis' });
    await guest.account.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    await ana.client.createRoom({ name: 'Mardi soir', maxPlayers: 2, targetPoints: 1, stakeChips: 20, nickname: 'Ana' });
    await guest.client.joinRoom(ana.client.state.session!.code, { nickname: 'Bea' });
    await until(() => ana.client.state.view?.players.length === 2, 'deux joueurs');
    await ana.client.startGame();
    await until(() => ana.client.state.view?.game?.phase === 'VARIANT_SELECTION', 'partie démarrée');
    const chooser = ana.client.state.view!.game!.chooser === ana.client.state.session!.playerId ? ana : guest;
    await chooser.client.command({ type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    await until(() => ana.client.state.view?.game?.round, 'manche');
    await ana.client.command({ type: 'VALIDATE' });
    await guest.client.command({ type: 'VALIDATE' });
    await until(() => ana.client.state.view?.status === 'FINISHED', 'partie terminée');
    const won = ana.client.state.view!.game!.outcome!.winner === ana.client.state.session!.playerId;
    ana.client.leave();

    const user = userEvent.setup();
    renderApp(ana);
    await user.click(await screen.findByRole('button', { name: /Ana/ }));
    await user.click(await screen.findByRole('tab', { name: /Historique/ }));
    const row = await screen.findByRole('button', { name: /Mardi soir/ });
    expect(row.textContent?.replace(/[\u202f\u00a0]/g, ' ')).toContain(won ? '+20 jetons' : '−20 jetons');
    await user.click(row);
    await user.click(await screen.findByRole('button', { name: 'Manche 1 favorite' }));
    await until(() => screen.getByRole('button', { name: 'Manche 1 favorite' }).getAttribute('aria-pressed') === 'true', 'étoile allumée');

    await user.click(screen.getByRole('tab', { name: /Manches favorites/ }));
    expect(await screen.findByText(/Mardi soir/)).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Statistiques/ }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('rowheader', { name: /fermé \(1 change\)/i })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Bankroll/ }));
    expect(await screen.findByRole('img', { name: /Bilan cumulé sur 1 partie/ })).toBeTruthy();

    expect(screen.queryByRole('tab', { name: /Jetons/ })).toBeNull(); // pas de boutique tant que la vente n'est pas validée
  });
});
