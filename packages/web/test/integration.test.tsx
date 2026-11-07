import { SeededRng } from '@poker/engine';
import { buildServer } from '@poker/server/src/http';
import { RoomManager } from '@poker/server/src/roomManager';
import { ManualScheduler } from '@poker/server/src/scheduler';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { ownCards } from '../src/lib/selectors';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function start() {
  const scheduler = new ManualScheduler();
  const manager = new RoomManager({ rng: new SeededRng(11), scheduler });
  const server = await buildServer({ manager, now: () => scheduler.now(), onError: () => undefined });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;
  cleanup.push(() => server.close());
  const make = (storage = new MemorySessionStore()) => {
    const c = new GameClient({ baseUrl: url, storage });
    cleanup.push(() => c.dispose());
    return { client: c, storage };
  };
  return { url, scheduler, make };
}
const CFG = { name: 'Table', maxPlayers: 4, targetPoints: 3, stakeChips: 2000 };
const until = (cond: () => unknown, label: string) => waitFor(() => expect(cond(), label).toBeTruthy(), { timeout: 5000, interval: 20 });

/** Table de 3 joueurs, partie démarrée, sur de vrais sockets. */
async function threePlayers() {
  const env = await start();
  const h = env.make();
  const a = env.make();
  const b = env.make();
  await h.client.createRoom({ ...CFG, nickname: 'Host' });
  const code = h.client.state.session!.code;
  await a.client.joinRoom(code, { nickname: 'Alice' });
  await b.client.joinRoom(code, { nickname: 'Bob' });
  const all = [h, a, b];
  await until(() => all.every((c) => c.client.state.view?.players.length === 3), '3 joueurs visibles partout');
  await h.client.startGame();
  await until(() => all.every((c) => c.client.state.view?.game?.phase === 'VARIANT_SELECTION'), 'partie démarrée');
  return { ...env, h, a, b, all, code };
}

describe('intégration : vrais clients, vrai serveur', () => {
  it('parcours complet d’une manche : mêmes vues, secret des cartes, résultat identique', async () => {
    const { all } = await threePlayers();
    const chooserId = all[0]!.client.state.view!.game!.chooser;
    const chooser = all.find((c) => c.client.state.session!.playerId === chooserId)!;
    expect(await chooser.client.command({ type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' })).toBe(true);
    await until(() => all.every((c) => c.client.state.view?.game?.round), 'manche démarrée partout');

    // Secret : aucune carte cachée d'un joueur ne figure dans la vue d'un autre
    const hands = all.map((c) => ownCards(c.client.state.view!.game!.round!, c.client.state.session!.playerId).map((x) => x.code));
    hands.forEach((h) => expect(h).toHaveLength(5));
    all.forEach((c, i) => {
      const json = JSON.stringify(c.client.state.view);
      hands.forEach((h, j) => {
        if (i !== j) for (const code of h) expect(json, `${code} de ${j} visible par ${i}`).not.toContain(`"${code}"`);
      });
    });

    for (const c of all) expect(await c.client.command({ type: 'VALIDATE' })).toBe(true);
    await until(() => all.every((c) => c.client.state.view?.game?.history.length === 1), 'manche notée partout');

    const records = all.map((c) => c.client.state.view!.game!.history[0]!);
    expect(records[1]).toEqual(records[0]);
    expect(records[2]).toEqual(records[0]);
    // Showdown reçu par tous, avec les 3 mains dévoilées
    for (const c of all) {
      const sd = c.client.state.feed.find((f) => f.event.type === 'SHOWDOWN')!;
      expect(Object.keys((sd.event.data as { hands: object }).hands)).toHaveLength(3);
    }
    // Les scores servis aux clients sont cohérents avec le résultat
    const g = all[0]!.client.state.view!.game!;
    const gained = Object.values(records[0]!.points).reduce((x, y) => x + y, 0);
    expect(g.players.reduce((s, p) => s + p.score, 0)).toBe(gained);
    expect(g.roundNo).toBe(2);
    expect(g.phase).toBe('VARIANT_SELECTION');
  });

  it('un joueur qui n’a pas la main ne peut pas choisir la variante ; message français', async () => {
    const { all } = await threePlayers();
    const chooserId = all[0]!.client.state.view!.game!.chooser;
    const other = all.find((c) => c.client.state.session!.playerId !== chooserId)!;
    expect(await other.client.command({ type: 'CHOOSE_VARIANT', variant: 'V6_3' })).toBe(false);
    const toast = other.client.state.toasts.at(-1)!;
    expect(toast.tone).toBe('error');
    expect(toast.text).toMatch(/[a-zé]/i);
    expect(all[0]!.client.state.view!.game!.phase).toBe('VARIANT_SELECTION'); // rien n'a bougé
  });

  it('reconnexion : une nouvelle page avec le même jeton retrouve siège, main et manche', async () => {
    const { all, make, a } = await threePlayers();
    const chooserId = all[0]!.client.state.view!.game!.chooser;
    const chooser = all.find((c) => c.client.state.session!.playerId === chooserId)!;
    await chooser.client.command({ type: 'CHOOSE_VARIANT', variant: 'CLOSED_2' });
    await until(() => a.client.state.view?.game?.round, 'manche');
    const before = a.client.state.view!;
    const myHand = ownCards(before.game!.round!, a.client.state.session!.playerId).map((c) => c.code);

    a.client.dispose(); // fermeture de l'onglet
    const reopened = make(a.storage); // même jeton en mémoire locale
    expect(reopened.client.state.session?.token).toBe(a.client.state.session?.token);
    reopened.client.resume();
    await until(() => reopened.client.state.view?.game?.round, 'vue rétablie');
    const after = reopened.client.state.view!;
    expect(after.you.playerId).toBe(before.you.playerId);
    expect(ownCards(after.game!.round!, after.you.playerId).map((c) => c.code)).toEqual(myHand);
    expect(after.deadline?.key).toBe(before.deadline?.key); // même minuteur, pas de remise à 30 s
  });

  it('le brouillon de sélection survit à la reconnexion', async () => {
    const { all, make, a } = await threePlayers();
    const chooserId = all[0]!.client.state.view!.game!.chooser;
    const chooser = all.find((c) => c.client.state.session!.playerId === chooserId)!;
    await chooser.client.command({ type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    await until(() => a.client.state.view?.game?.round, 'manche');
    const me = a.client.state.session!.playerId;
    const pick = ownCards(a.client.state.view!.game!.round!, me).slice(0, 2).map((c) => c.code!);
    await a.client.command({ type: 'SELECT', cards: pick });
    a.client.dispose();
    const re = make(a.storage);
    re.client.resume();
    await until(() => re.client.state.view?.game?.round, 'vue rétablie');
    expect((re.client.state.view!.game!.round!.info as { yourDraft: string[] }).yourDraft).toEqual(pick);
  });

  it('exclusion en salle : le joueur retiré est prévenu et sa session est effacée', async () => {
    const env = await start();
    const h = env.make();
    const a = env.make();
    await h.client.createRoom({ ...CFG, nickname: 'Host' });
    await a.client.joinRoom(h.client.state.session!.code, { nickname: 'Alice' });
    await until(() => h.client.state.view?.players.length === 2, 'Alice en salle');
    await h.client.excludePlayer(a.client.state.session!.playerId);
    await until(() => a.client.state.closed === 'KICKED', 'exclusion reçue');
    expect(a.storage.load()).toBeNull();
    await until(() => h.client.state.view?.players.length === 1, 'salle mise à jour');
  });

  it('jeton invalide : la session est refusée et effacée', async () => {
    const env = await start();
    const h = env.make();
    await h.client.createRoom({ ...CFG, nickname: 'Host' });
    const storage = new MemorySessionStore();
    storage.save({ ...h.client.state.session!, token: 'faux-jeton' });
    const bad = env.make(storage);
    bad.client.resume();
    await until(() => bad.client.state.closed === 'INVALID_SESSION', 'session refusée');
    expect(storage.load()).toBeNull();
  });
});

describe('intégration : interface complète dans le DOM, pilotée comme un utilisateur', () => {
  it('création, arrivée d’un joueur, démarrage, choix de variante, panneau puis résultat', async () => {
    const env = await start();
    const user = userEvent.setup();
    const host = env.make();
    render(
      <ClientProvider client={host.client}>
        <App />
      </ClientProvider>,
    );
    // accueil → création
    await user.click(screen.getByRole('button', { name: 'Créer une partie' }));
    await user.type(screen.getByLabelText('Nom de la table'), 'Vendredi soir');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Emeric');
    await user.click(screen.getByRole('button', { name: 'Créer la table' }));
    const codeEl = await screen.findByTestId('room-code', {}, { timeout: 5000 });
    const code = codeEl.textContent!.trim();
    expect(code).toMatch(/^POKER-[2-9A-Z]{4}$/);
    expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeDisabled();

    // un second joueur arrive : la salle se met à jour en temps réel
    const alice = env.make();
    await alice.client.joinRoom(code, { nickname: 'Alice' });
    await within(screen.getByRole('list', { name: 'Joueurs' })).findByText('Alice', { exact: false }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Démarrer la partie' }));

    // partie démarrée : la table s'affiche
    await screen.findByRole('navigation', { name: 'Menu de la table' }, { timeout: 5000 });
    const hostId = host.client.state.session!.playerId;
    const chooserIsHost = () => host.client.state.view?.game?.chooser === hostId;
    await until(() => host.client.state.view?.game?.chooser, 'chooser connu');
    if (chooserIsHost()) {
      await user.click(await screen.findByRole('button', { name: /^Poker fermé — 1 change/ }));
    } else {
      expect(await screen.findByRole('heading', { name: /choisit la variante/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^6-3/ })).toBeDisabled(); // pas la main : rien à cliquer
      await alice.client.command({ type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    }
    // panneau du poker fermé, avec ma main réelle (5 cartes cliquables)
    const hand = await screen.findByRole('group', { name: 'Votre main' }, { timeout: 5000 });
    expect(within(hand).getAllByRole('button')).toHaveLength(5);
    await user.click(within(hand).getAllByRole('button')[0]!);
    expect(await screen.findByText('1 carte à changer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Changer 1 carte' }));
    await screen.findByText(/En attente des autres joueurs \(1 \/ 2\)/);
    // le second joueur valide : la manche se termine et le récapitulatif s'affiche chez l'hôte
    await alice.client.command({ type: 'VALIDATE' });
    const dialog = await screen.findByRole('dialog', { name: 'Résultat de la manche 1' }, { timeout: 5000 });
    expect(within(dialog).getByRole('list', { name: 'Mains dévoilées' }).querySelectorAll('li')).toHaveLength(2);
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toMatch(/remporte la manche|Hold’em de départage|Aucun point/);
  });

  it('rechargement de la page : l’interface reprend la partie sans repasser par l’accueil', async () => {
    const env = await start();
    const first = env.make();
    await first.client.createRoom({ ...CFG, nickname: 'Emeric' });
    const code = first.client.state.session!.code;
    first.client.dispose();
    // « nouvelle page » : même stockage local, nouveau client, nouvelle interface
    const reopened = env.make(first.storage);
    render(
      <ClientProvider client={reopened.client}>
        <App />
      </ClientProvider>,
    );
    expect(await screen.findByTestId('room-code', {}, { timeout: 5000 })).toHaveTextContent(code);
    expect(screen.queryByRole('button', { name: 'Créer une partie' })).toBeNull();
  });
});
