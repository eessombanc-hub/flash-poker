import { SeededRng } from '@poker/engine';
import { AccountDb } from '@poker/server/src/accounts/db';
import { LogMailer } from '@poker/server/src/accounts/mailer';
import { AccountService } from '@poker/server/src/accounts/service';
import { BlackjackService } from '@poker/server/src/blackjack/service';
import { buildServer } from '@poker/server/src/http';
import { RoomManager } from '@poker/server/src/roomManager';
import { ManualScheduler } from '@poker/server/src/scheduler';
import { TableauService } from '@poker/server/src/tableau/service';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountClient } from '../src/lib/account';
import { AccountProvider } from '../src/lib/context';
import { announce, clockSkew, inviteUrl, secondsLeft } from '../src/lib/tableau';
import { ClientProvider } from '../src/lib/context';
import { fakeClient } from './fixtures';
import { Home } from '../src/screens/Home';
import { Solo } from '../src/screens/Solo';
import { Tableau } from '../src/screens/Tableau';
import type { TbGameDto } from '../src/lib/types';

const noop = () => undefined;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignoré */
  }
});

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

async function serverAndClients() {
  const scheduler = new ManualScheduler();
  const db = new AccountDb(':memory:');
  const accounts = new AccountService(db, new LogMailer(true, () => undefined), { log: () => undefined });
  const blackjack = new BlackjackService(db);
  // IA rapide : peu de simulations et aucun délai de réflexion (le délai réel est testé côté serveur).
  const tableau = new TableauService(db, blackjack, { aiSims: 10, aiBudgetMs: 200, cpuDelayMs: 0 });
  const manager = new RoomManager({ rng: new SeededRng(3), scheduler, accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) } });
  const server = await buildServer({ manager, accounts, blackjack, tableau, now: () => scheduler.now(), onError: () => undefined, httpRateLimit: { max: 100000, windowMs: 60_000 } });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;
  cleanups.push(() => server.close());
  const make = () => {
    const a = new AccountClient({ baseUrl: url, storage: memoryStorage() });
    cleanups.push(() => a.dispose());
    return a;
  };
  return { make };
}

describe('Tableau : utilitaires', () => {
  it('horloge : le délai restant suit l’heure du serveur, jamais négatif', () => {
    const dto = { serverNow: 10_000, deadline: 40_000 } as TbGameDto;
    const skew = clockSkew(dto, 4_000); // le navigateur retarde de 6 s
    expect(secondsLeft(dto, skew, 4_000)).toBe(30);
    expect(secondsLeft(dto, skew, 14_000)).toBe(20);
    expect(secondsLeft(dto, skew, 99_000)).toBe(0);
    expect(secondsLeft({ deadline: null }, 0, 0)).toBe(0);
  });
  it('annonces pour lecteurs d’écran', () => {
    expect(announce({ status: 'waiting' } as TbGameDto)).toMatch(/attente/);
    expect(announce({ status: 'playing', paused: false, you: 0, view: { turn: 0 } } as TbGameDto)).toBe('À vous de jouer.');
    expect(announce({ status: 'playing', paused: false, you: 0, view: { turn: 1 } } as TbGameDto)).toMatch(/adversaire/);
    expect(announce({ status: 'finished', winner: 1, you: 0 } as TbGameDto)).toMatch(/perdu/);
    expect(announce({ status: 'finished', winner: null, you: 0 } as TbGameDto)).toMatch(/nul/);
  });
  it('lien d’invitation', () => {
    expect(inviteUrl('TB-ABCD')).toContain('tableau=TB-ABCD');
  });
});

describe('Tableau : accès depuis les menus', () => {
  it('l’accueil et le menu Solo proposent Le Tableau', async () => {
    const onTableau = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <ClientProvider client={fakeClient(null).client}>
        <Home onCreate={noop} onJoin={noop} onTrain={noop} onBlackjack={noop} onTableau={onTableau} />
      </ClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Tableau' }));
    expect(onTableau).toHaveBeenLastCalledWith('classic');
    await user.click(screen.getByRole('button', { name: 'Le tableau 5 cartes' }));
    expect(onTableau).toHaveBeenLastCalledWith('hand5');
    // rangées sous le Blackjack, comme un jeu à part (et non parmi les variantes de poker)
    const bj = screen.getByRole('region', { name: 'Blackjack' });
    const tb = screen.getByRole('region', { name: 'Le Tableau' });
    expect(bj.compareDocumentPosition(tb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    const again = vi.fn();
    render(<Solo onBack={noop} onPick={noop} onBlackjack={noop} onTableau={again} />);
    await user.click(screen.getByRole('button', { name: 'Le tableau 5 cartes' }));
    expect(again).toHaveBeenLastCalledWith('hand5');
  });
});

describe('Tableau : classé, ligues et défis', () => {
  it('compte connecté : progression, défis du jour, classement, puis partie classée abandonnée et comptée', async () => {
    const { make } = await serverAndClients();
    const account = make();
    await account.register({ nickname: 'Zoé', email: 'zoe@x.fr', password: 'tapis-vert-42' });
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    const progress = await screen.findByTestId('tb-progress');
    expect(within(progress).getByText('800 points')).toBeInTheDocument();
    expect(within(progress).getByText('Débutant')).toBeInTheDocument();
    expect(within(progress).getByText('Encore 100 points pour la ligue Apprenti.')).toBeInTheDocument();
    expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '89');
    expect(within(await screen.findByTestId('tb-challenges')).getAllByRole('listitem')).toHaveLength(3);
    expect(await within(screen.getByTestId('tb-leaderboard')).findByText('Personne n’est encore classé dans cette variante.')).toBeInTheDocument();
    expect(screen.getByTestId('tb-ranked')).toHaveTextContent('Pas de conseils en classé');

    // Le sélecteur de variante commande tout le menu : classé, progression et classement suivent la variante choisie.
    expect(within(progress).getByText('Tableau')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /5 cartes/ }));
    await waitFor(() => expect(within(screen.getByTestId('tb-progress')).getByText(/5 cartes/)).toBeInTheDocument());
    expect(within(screen.getByTestId('tb-ranked')).getByText(/5 cartes/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Tableau' }));
    await waitFor(() => expect(within(screen.getByTestId('tb-progress')).getByText('Tableau')).toBeInTheDocument());

    await user.click(within(screen.getByTestId('tb-ranked')).getByRole('button', { name: 'Lancer une partie classée' }));
    await screen.findByTestId('tb-board-mine');
    expect(screen.queryByRole('button', { name: /conseil/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Quitter la partie' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Quitter une partie classée compte comme une défaite.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Quitter' }));

    // La défaite est enregistrée et le joueur entre au classement.
    const stats = await account.tbProfile('classic');
    expect(stats).toMatchObject({ games: 1, losses: 1, rankedGames: 1, position: 1 });
    expect(stats.rating).toBeLessThan(800);
    const lb = await account.tbLeaderboard('classic');
    expect(lb[0]).toMatchObject({ nickname: 'Zoé', you: true });
    await expect(account.tbCreate({ mode: 'ranked', level: 'beginner' })).resolves.toMatchObject({ mode: 'ranked' });
  });
});

describe('Tableau : duel classé contre un humain', () => {
  it('recherche, annulation, puis appariement avec un second joueur : la partie s’ouvre chez le premier', async () => {
    const { make } = await serverAndClients();
    const ana = make();
    const ben = make();
    await ana.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
    await ben.register({ nickname: 'Ben', email: 'ben@x.fr', password: 'tapis-vert-42' });
    const user = userEvent.setup();
    render(
      <AccountProvider account={ana}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    const panel = await screen.findByTestId('tb-duel');
    expect(panel).toHaveTextContent('Duel classé');
    await user.click(within(panel).getByRole('button', { name: 'Chercher un adversaire' }));
    expect(await screen.findByTestId('tb-queue-wait')).toHaveTextContent(/Recherche en cours depuis \d+ secondes/);
    await user.click(within(screen.getByTestId('tb-duel')).getByRole('button', { name: 'Annuler la recherche' }));
    expect(within(screen.getByTestId('tb-duel')).getByRole('button', { name: 'Chercher un adversaire' })).toBeInTheDocument();
    expect(await ana.tbQueueStatus()).toMatchObject({ status: 'idle' });

    await user.click(within(screen.getByTestId('tb-duel')).getByRole('button', { name: 'Chercher un adversaire' }));
    await screen.findByTestId('tb-queue-wait');
    const matched = await ben.tbQueueJoin('classic');
    expect(matched.status).toBe('matched');
    // Le sondage du premier joueur découvre la partie et l'ouvre, avec le classement de l'adversaire.
    expect(await screen.findByTestId('tb-board-mine', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText(/800 points/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conseil/i })).toBeNull();
  }, 30000);
});

describe('Tableau : de bout en bout', () => {
  it('menu : règles et dix combinaisons, tournois à venir, classé réservé aux comptes', async () => {
    const { make } = await serverAndClients();
    const account = make();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Le Tableau' })).toBeInTheDocument();
    expect(screen.getAllByText('à venir')).toHaveLength(1); // seuls les tournois restent à venir
    expect(screen.getByTestId('tb-ranked')).toHaveTextContent('Connectez-vous pour jouer en classé');
    expect(screen.queryByTestId('tb-progress')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Règles et combinaisons' }));
    const dialog = await screen.findByRole('dialog', { name: 'Règles du Tableau' });
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);
    expect(within(dialog).getByText('Quinte flush royale')).toBeInTheDocument();
    expect(within(dialog).getByText(/la première quinte flush complétée par l’un des joueurs/i)).toBeInTheDocument();
  });

  it('entraînement : plateau à cinq colonnes, placement, conseil, puis tour de l’IA', async () => {
    const { make } = await serverAndClients();
    const account = make();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Lancer l’entraînement' }));
    const mine = await screen.findByTestId('tb-board-mine');
    const theirs = screen.getByTestId('tb-board-theirs');
    expect(within(mine).queryAllByRole('group').length + within(mine).queryAllByRole('button').length).toBe(5);
    expect(within(theirs).getAllByRole('group')).toHaveLength(5);
    expect(screen.getAllByTestId('tb-remaining')[1]!.textContent).toBe('20');
    // attend son tour (l'IA peut commencer)
    await waitFor(() => expect(within(mine).queryAllByRole('button').length).toBeGreaterThan(0), { timeout: 8000 });
    expect(screen.getByTestId('tb-drawn').querySelector('svg')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Conseil' }));
    expect(await screen.findByRole('note')).toHaveTextContent(/colonne \d/);
    // placement avec confirmation (par défaut sur un écran non tactile : direct)
    const first = within(mine).getAllByRole('button')[0]!;
    await user.click(first);
    const confirmBtn = screen.queryByRole('button', { name: /Poser en colonne/ });
    if (confirmBtn) await user.click(confirmBtn);
    await waitFor(() => expect(screen.getAllByTestId('tb-remaining')[1]!.textContent).toBe('19'), { timeout: 4000 });
    // l'IA a joué à son tour
    await waitFor(() => expect(Number(screen.getAllByTestId('tb-remaining')[0]!.textContent)).toBeLessThanOrEqual(19), { timeout: 8000 });
  }, 30000);

  it('partie complète contre l’IA jusqu’à l’écran de résultats, avec vérification de l’équité', async () => {
    const { make } = await serverAndClients();
    const account = make();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Lancer l’entraînement' }));
    const mine = await screen.findByTestId('tb-board-mine');
    // Joue vite : l'interface est pilotée comme un joueur, colonne libre la plus à gauche.
    const stop = Date.now() + 90_000;
    while (Date.now() < stop && !screen.queryByTestId('tb-outcome')) {
      const cols = within(mine).queryAllByRole('button');
      if (cols.length > 0) {
        await user.click(cols[0]!);
        const confirmBtn = screen.queryByRole('button', { name: /Poser en colonne/ });
        if (confirmBtn) await user.click(confirmBtn);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(await screen.findByTestId('tb-outcome', undefined, { timeout: 120000 })).toHaveTextContent(/Victoire|Défaite|Match nul/);
    expect(screen.getByRole('list', { name: 'Détail des cinq colonnes' }).children).toHaveLength(5);
    expect(screen.getAllByTestId('tb-remaining').map((e) => e.textContent)).toEqual(['0', '0']);
    await user.click(screen.getByText(/Vérifier l’équité du mélange/));
    await user.click(screen.getByRole('button', { name: 'Contrôler l’empreinte' }));
    expect(await screen.findByText(/Conforme/)).toBeInTheDocument();
  }, 180000);

  it('amical : l’hôte reçoit un code, l’ami le saisit, les deux voient la même partie', async () => {
    const { make } = await serverAndClients();
    const host = make();
    const friend = make();
    const user = userEvent.setup();
    const hostView = render(
      <AccountProvider account={host}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    await user.clear(await screen.findByLabelText('Votre nom'));
    await user.type(screen.getByLabelText('Votre nom'), 'Hôte');
    await user.click(screen.getByRole('button', { name: 'Créer une partie privée' }));
    const code = (await screen.findByTestId('tb-code')).textContent!;
    expect(code).toMatch(/^TB-[A-Z2-9]{4}$/);
    expect(screen.getByText(/En attente de votre ami/)).toBeInTheDocument();

    // L'ami rejoint (interface séparée)
    const friendView = render(
      <AccountProvider account={friend}>
        <Tableau onBack={noop} onLogin={noop} initialCode={code} />
      </AccountProvider>,
    );
    const friendUser = userEvent.setup();
    const input = (await within(friendView.container).findByLabelText('Code de la partie')) as HTMLInputElement;
    expect(input.value).toBe(code);
    await friendUser.clear(await within(friendView.container).findByLabelText('Votre nom'));
    await friendUser.type(within(friendView.container).getByLabelText('Votre nom'), 'Ami');
    await friendUser.click(within(friendView.container).getByRole('button', { name: 'Rejoindre' }));
    await within(friendView.container).findByTestId('tb-board-mine');
    // L'hôte passe automatiquement de la salle d'attente à la partie
    await within(hostView.container).findByTestId('tb-board-mine', undefined, { timeout: 5000 });
    expect(within(hostView.container).getByText('Ami')).toBeInTheDocument();
    expect(within(friendView.container).getByText('Hôte')).toBeInTheDocument();
    // Les cartes cachées de l'autre n'apparaissent jamais : une seule des deux interfaces affiche une carte piochée
    await waitFor(() => {
      const drawn = [hostView.container, friendView.container].map((c) => !!within(c).getByTestId('tb-drawn').querySelector('[aria-label*="Carte piochée"]'));
      expect(drawn.filter(Boolean)).toHaveLength(1);
    });
  }, 30000);

  it('Tableau 5 cartes : main visible, carte de la main ou piochée, partie jusqu’au résultat', async () => {
    const { make } = await serverAndClients();
    const account = make();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Tableau onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    expect(await screen.findByRole('radio', { name: 'Le tableau 5 cartes', checked: false })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Le tableau 5 cartes' }));
    await user.click(screen.getByRole('button', { name: 'Lancer l’entraînement' }));
    const hand = await screen.findByTestId('tb-hand');
    expect(within(hand).queryAllByRole('img').length + within(hand).queryAllByRole('button').length).toBe(5);
    expect(screen.getAllByTestId('tb-remaining')[1]!.textContent).toBe('20');
    const mine = screen.getByTestId('tb-board-mine');
    const stop = Date.now() + 90_000;
    let n = 0;
    while (Date.now() < stop && !screen.queryByTestId('tb-outcome')) {
      const cols = within(mine).queryAllByRole('button');
      const cards = within(screen.getByTestId('tb-hand')).queryAllByRole('button');
      if (cols.length > 0 && cards.length > 0) {
        if (n++ % 2 === 0) await user.click(cards[0]!);
        await user.click(cols[0]!);
        const confirmBtn = screen.queryByRole('button', { name: /Poser en colonne/ });
        if (confirmBtn) await user.click(confirmBtn);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(await screen.findByTestId('tb-outcome', undefined, { timeout: 20000 })).toHaveTextContent(/Victoire|Défaite|Match nul/);
    expect(screen.getAllByTestId('tb-remaining').map((e) => e.textContent)).toEqual(['0', '0']);
  }, 120000);
});
