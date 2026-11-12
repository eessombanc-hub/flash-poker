import { SeededRng } from '@poker/engine';
import { AccountDb } from '@poker/server/src/accounts/db';
import { LogMailer } from '@poker/server/src/accounts/mailer';
import { AccountService } from '@poker/server/src/accounts/service';
import { BlackjackService } from '@poker/server/src/blackjack/service';
import { BlackjackTables } from '@poker/server/src/blackjack/tables';
import { buildServer } from '@poker/server/src/http';
import { RoomManager } from '@poker/server/src/roomManager';
import { ManualScheduler } from '@poker/server/src/scheduler';
import { createHash } from 'node:crypto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BjTable } from '../src/components/blackjack/BjTable';
import { FairnessProof } from '../src/components/blackjack/Panels';
import { AccountClient } from '../src/lib/account';
import { DEFAULT_PREFS, handTotal, loadPrefs, savePrefs, totalText, verifyCommitment } from '../src/lib/blackjack';
import { AccountProvider } from '../src/lib/context';
import { hasFeature } from '../src/lib/entitlements';
import { Blackjack } from '../src/screens/Blackjack';
import { Home } from '../src/screens/Home';
import { ClientProvider } from '../src/lib/context';
import { fakeClient } from './fixtures';
import type { BjActive, BjResult } from '../src/lib/types';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignoré */
  }
});

describe('Blackjack : totaux affichés', () => {
  it('compte l’As pour 11 puis pour 1', () => {
    expect(handTotal(['As', 'Kd'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['As', '6d'])).toEqual({ total: 17, soft: true });
    expect(handTotal(['As', '6d', 'Th'])).toEqual({ total: 17, soft: false });
    expect(handTotal(['As', 'Ad', 'Ah'])).toEqual({ total: 13, soft: true });
    expect(handTotal(['Kd', 'Qd', '5c'])).toEqual({ total: 25, soft: false });
  });
  it('texte : total souple, dépassement, carte cachée ignorée', () => {
    expect(totalText(['As', '6d'])).toBe('7 / 17');
    expect(totalText(['As', 'Kd'])).toBe('21');
    expect(totalText(['Kd', 'Qd', '5c'])).toBe('25, dépasse');
    expect(totalText(['9d', null])).toBe('9');
  });
});

describe('Blackjack : préférences et droits', () => {
  it('valeurs par défaut, relecture, et rejet des valeurs invalides', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    savePrefs({ ...DEFAULT_PREFS, speed: 'rapide', pedagogy: 'coach', bet: 50 });
    expect(loadPrefs()).toMatchObject({ speed: 'rapide', pedagogy: 'coach', bet: 50 });
    localStorage.setItem('poker.blackjack.v1', JSON.stringify({ speed: 'x', pedagogy: 1, bet: -4, rules: { decks: 99, blackjackPays: 'oups' } }));
    const p = loadPrefs();
    expect(p).toMatchObject({ speed: 'normale', pedagogy: 'libre', bet: 10 });
    expect(p.rules).toMatchObject({ decks: 6, blackjackPays: '3:2' });
    localStorage.setItem('poker.blackjack.v1', '{pas du json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
  it('le jeu complet est accessible aux deux plans', () => {
    expect(hasFeature('jeu-complet', 'gratuit')).toBe(true);
    expect(hasFeature('stats-avancees', 'gratuit')).toBe(false);
    expect(hasFeature('stats-avancees', 'premium')).toBe(true);
  });
});

describe('Blackjack : preuve d’équité dans le navigateur', () => {
  it('l’engagement est le SHA-256 de la graine, et seulement elle', async () => {
    const seed = 'ab'.repeat(32);
    const expected = createHash('sha256').update(`flashpoker-blackjack-v1:commit:${seed}`).digest('hex');
    expect(await verifyCommitment(seed, expected)).toBe(true);
    expect(await verifyCommitment(seed + '0', expected)).toBe(false);
  });
  it('affiche le verdict', async () => {
    const seed = 'cd'.repeat(32);
    const commitment = createHash('sha256').update(`flashpoker-blackjack-v1:commit:${seed}`).digest('hex');
    render(<FairnessProof seed={seed} commitment={commitment} />);
    expect(await screen.findByText(/SHA-256 de la graine = engagement/)).toBeInTheDocument();
    render(<FairnessProof seed={seed} commitment={'0'.repeat(64)} />);
    expect(await screen.findByText(/ne correspond pas/)).toBeInTheDocument();
  });
});

const rules = { decks: 6, dealerHitsSoft17: false, blackjackPays: '3:2' as const, doubleOn: 'any' as const, doubleAfterSplit: true, maxHands: 4, resplitAces: false, surrender: true };
const hand = (cards: string[], over = {}) => ({ cards, bet: 10, doubled: false, fromSplit: false, splitAces: false, done: false, surrendered: false, result: null, net: 0, ...over });
function active(over: Partial<BjActive['round']> = {}, legal: BjActive['legal'] = ['HIT', 'STAND', 'DOUBLE', 'SURRENDER']): BjActive {
  return {
    table: 'decouverte',
    rules,
    bet: 10,
    legal,
    commitment: 'f'.repeat(64),
    startedAt: 1,
    freeChips: 990,
    round: { rules, bet: 10, hands: [hand(['9s', '7h'])], active: 0, dealer: ['Kd', null], phase: 'PLAYER', dealerBlackjack: false, net: 0, wagered: 10, ...over },
  };
}
const noop = () => undefined;
const props = { result: null, chips: 990, speed: 'rapide' as const, pedagogy: 'libre' as const, help: null, busy: false, error: null, canReplay: true, onAction: noop, onReplay: noop, onLeave: noop };

describe('Blackjack : table', () => {
  it('manche en cours : croupier à moitié caché, total du joueur, actions autorisées', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<BjTable {...props} active={active()} onAction={onAction} />);
    expect(screen.getByTestId('total-0').textContent).toBe('16');
    expect(screen.getByTestId('dealer-total').textContent).toBe('10');
    expect(screen.getByRole('button', { name: /Séparer/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Tirer/ }));
    expect(onAction).toHaveBeenCalledWith('HIT');
    await user.keyboard('s');
    expect(onAction).toHaveBeenLastCalledWith('STAND');
    await user.keyboard('p'); // séparation non autorisée : aucune requête
    expect(onAction).toHaveBeenCalledTimes(2);
  });
  it('actions bloquées pendant une requête', async () => {
    const onAction = vi.fn();
    render(<BjTable {...props} active={active()} busy onAction={onAction} />);
    expect(screen.getByRole('button', { name: /Tirer/ })).toBeDisabled();
    await userEvent.setup().keyboard('h');
    expect(onAction).not.toHaveBeenCalled();
  });
  it('l’abandon n’apparaît pas sur une table qui le refuse', () => {
    const a = active();
    a.round.rules = { ...rules, surrender: false };
    render(<BjTable {...props} active={a} />);
    expect(screen.queryByRole('button', { name: /Abandonner/ })).toBeNull();
  });
  it('niveau « coach » : conseil et probabilités ; « indices » : probabilités seules', () => {
    const help = { advice: { action: 'HIT' as const, reason: 'Le croupier montre un 10.' }, odds: { bustOnHit: 0.62, stand: { win: 0.2, push: 0.1, lose: 0.7 }, dealerFinal: { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 } } };
    const { rerender } = render(<BjTable {...props} active={active()} pedagogy="coach" help={help} />);
    expect(screen.getByTestId('help-box').textContent).toMatch(/Conseil\. Tirer.*Le croupier montre un 10/);
    expect(screen.getByTestId('help-box').textContent).toMatch(/62 %/);
    rerender(<BjTable {...props} active={active()} pedagogy="indices" help={help} />);
    expect(screen.getByTestId('help-box').textContent).not.toMatch(/Conseil/);
    rerender(<BjTable {...props} active={active()} pedagogy="libre" help={help} />);
    expect(screen.queryByTestId('help-box')).toBeNull();
  });
  it('fin de manche : croupier révélé, résultat par main, rejouer', async () => {
    const onReplay = vi.fn();
    const a = active(
      { phase: 'DONE', dealer: ['Kd', '7c'], net: 10, hands: [hand(['Th', '9s'], { done: true, result: 'WIN', net: 10 })] },
      [],
    );
    const res: BjResult = { net: 10, xpGained: 12, level: null, challengesDone: [], achievements: [], seed: 'a'.repeat(64), commitment: 'b'.repeat(64) };
    render(<BjTable {...props} active={a} result={res} onReplay={onReplay} />);
    await waitFor(() => expect(screen.getByTestId('round-net').textContent).toMatch(/Vous gagnez/), { timeout: 3000 });
    expect(screen.getByTestId('dealer-total').textContent).toBe('17');
    expect(screen.getByText('Gagné')).toBeInTheDocument();
    expect(screen.getByText(/\+12 XP/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Rejouer/ }));
    expect(onReplay).toHaveBeenCalled();
  });
  it('solde insuffisant : « Rejouer » désactivé avec explication', async () => {
    const a = active({ phase: 'DONE', dealer: ['Kd', '7c'], net: -10, hands: [hand(['Th', '6s'], { done: true, result: 'LOSE', net: -10 })] }, []);
    render(<BjTable {...props} active={a} chips={4} canReplay={false} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Rejouer/ })).toBeDisabled(), { timeout: 3000 });
    expect(screen.getByText(/Solde insuffisant/)).toBeInTheDocument();
  });
  it('deux mains après séparation : la main active est signalée', () => {
    const a = active({ hands: [hand(['8s', '3h']), hand(['8d', '5c'])], active: 1 }, ['HIT', 'STAND']);
    render(<BjTable {...props} active={a} />);
    expect(screen.getByLabelText('Main 2 (en cours)')).toBeInTheDocument();
    expect(screen.getByLabelText('Main 1')).toBeInTheDocument();
  });
});

describe('Blackjack : accueil', () => {
  it('rubrique distincte des variantes de poker', async () => {
    const onBlackjack = vi.fn();
    render(
      <ClientProvider client={fakeClient(null).client}>
        <Home onCreate={noop} onJoin={noop} onTrain={noop} onBlackjack={onBlackjack} />
      </ClientProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Jeux' });
    await userEvent.setup().click(within(rail).getByRole('button', { name: 'Blackjack' }));
    expect(onBlackjack).toHaveBeenCalled();
  });
});

// ---------- Bout en bout : vrai serveur, vrai compte ----------
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

async function serverAndAccount() {
  const scheduler = new ManualScheduler();
  const db = new AccountDb(':memory:');
  const accounts = new AccountService(db, new LogMailer(true, () => undefined), { log: () => undefined });
  const blackjack = new BlackjackService(db);
  const blackjackTables = new BlackjackTables(db, blackjack);
  const manager = new RoomManager({ rng: new SeededRng(3), scheduler, accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) } });
  const server = await buildServer({ manager, accounts, blackjack, blackjackTables, now: () => scheduler.now(), onError: () => undefined, httpRateLimit: { max: 1000, windowMs: 60_000 } });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;
  cleanups.push(() => server.close());
  const account = new AccountClient({ baseUrl: url, storage: memoryStorage() });
  cleanups.push(() => account.dispose());
  const another = () => {
    const a = new AccountClient({ baseUrl: url, storage: memoryStorage() });
    cleanups.push(() => a.dispose());
    return a;
  };
  return { account, another };
}

describe('Blackjack : de bout en bout', () => {
  it('sans compte : on joue en invité, avec un rappel discret pour se connecter', async () => {
    const { account } = await serverAndAccount();
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Blackjack onBack={noop} onLogin={onLogin} />
      </AccountProvider>,
    );
    expect((await screen.findByTestId('bj-chips')).textContent).toMatch(/1\s?000/);
    expect(screen.getByTestId('bj-guest-note')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Distribuer/ }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Actions' }) ?? screen.queryByTestId('round-net')).toBeTruthy(), { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(onLogin).toHaveBeenCalled();
  });

  it('le code d’invité est créé une fois, puis conservé', async () => {
    const { account } = await serverAndAccount();
    const id = account.guestId();
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(account.guestId()).toBe(id);
  });

  it('distribution, tirage ou arrêt, résumé, classement et historique', async () => {
    const { account } = await serverAndAccount();
    await account.register({ nickname: 'Croupier', email: 'c@x.fr', password: 'tapis-vert-42' });
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Blackjack onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    expect((await screen.findByTestId('bj-chips')).textContent).toMatch(/1\s?000/);
    expect(screen.getByTestId('rules-line').textContent).toMatch(/6 jeux/);

    await user.click(screen.getByRole('button', { name: /Distribuer/ }));
    // Soit la manche se joue (actions), soit un Blackjack naturel la termine d'emblée.
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Actions' }) ?? screen.queryByTestId('round-net')).toBeTruthy(), { timeout: 4000 });
    for (let i = 0; i < 12 && !screen.queryByTestId('round-net'); i++) {
      const stand = screen.queryByRole('button', { name: /Rester/ });
      if (stand && !stand.hasAttribute('disabled')) await user.click(stand);
      await new Promise((r) => setTimeout(r, 60));
    }
    await waitFor(() => expect(screen.getByTestId('round-net')).toBeInTheDocument(), { timeout: 8000 });

    // Équité : la preuve est vérifiable dès la fin de la manche.
    await user.click(screen.getByText(/Vérifier l’équité/));
    expect(await screen.findByText(/SHA-256 de la graine = engagement/)).toBeInTheDocument();

    // Retour au salon : le solde a bougé de la mise au plus, l'historique garde la manche.
    await user.click(screen.getByRole('button', { name: /Changer de mise/ }));
    await user.click(await screen.findByRole('tab', { name: 'Historique' }));
    await waitFor(() => expect(within(screen.getByTestId('bj-history')).getAllByRole('listitem').length).toBe(1), { timeout: 4000 });
    await user.click(screen.getByRole('tab', { name: 'Progression' }));
    expect(screen.getByTestId('bj-stats').textContent).toMatch(/^1Mains jouées/);
    await user.click(screen.getByRole('tab', { name: 'Classement' }));
    expect(await within(await screen.findByTestId('bj-leaderboard')).findByText('Croupier')).toBeInTheDocument();
  });

  it('reprise : une manche interrompue est rouverte au rechargement', async () => {
    const { account } = await serverAndAccount();
    await account.register({ nickname: 'Reprise', email: 'r@x.fr', password: 'tapis-vert-42' });
    // On distribue jusqu'à obtenir une manche encore en cours (un Blackjack naturel la terminerait d'emblée).
    let started = await account.blackjackStart({ table: 'decouverte', bet: 5 });
    for (let i = 0; i < 20 && started.active.round.phase === 'DONE'; i++) started = await account.blackjackStart({ table: 'decouverte', bet: 5 });
    expect(started.active.round.phase).toBe('PLAYER');
    render(
      <AccountProvider account={account}>
        <Blackjack onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    expect(await screen.findByRole('group', { name: 'Actions' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByTestId('total-0').textContent).toBeTruthy();
  });
});

describe('Blackjack : à plusieurs', () => {
  it('créer une table avec un CPU, miser, jouer, voir le bilan', async () => {
    const { account } = await serverAndAccount();
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Blackjack onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    await screen.findByTestId('bj-chips');
    await user.click(screen.getByRole('tab', { name: 'À plusieurs' }));
    await user.click(screen.getByRole('button', { name: 'Seul' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Place 2' })).getByRole('radio', { name: 'CPU' }));
    await user.type(screen.getByLabelText('Votre pseudo'), 'Ana');
    await user.click(screen.getByRole('button', { name: /Créer la table/ }));
    expect(await screen.findByTestId('bj-table-code')).toHaveTextContent(/^BJ-/);
    await user.click(screen.getByRole('button', { name: /Lancer la partie/ }));
    await user.click(await screen.findByRole('button', { name: /^Miser/ }));
    // Le CPU joue à son rythme ; on reste dès que c'est notre tour.
    await waitFor(
      async () => {
        const stand = screen.queryByRole('button', { name: 'Rester' });
        if (stand && !stand.hasAttribute('disabled')) await user.click(stand);
        expect(screen.getByTestId('round-net')).toBeInTheDocument();
      },
      { timeout: 12000, interval: 300 },
    );
    expect(screen.getByTestId('table-seats').querySelectorAll('li')).toHaveLength(2);
    expect(await screen.findByRole('button', { name: /Manche suivante/ })).toBeInTheDocument();
  }, 20000);

  it('rejoindre avec un code : place humaine, attente du lancement', async () => {
    const { account, another } = await serverAndAccount();
    const host = another();
    const created = await host.bjTableCreate({ table: 'decouverte', seats: ['human', 'human', 'cpu'], nickname: 'Hôte' });
    const user = userEvent.setup();
    render(
      <AccountProvider account={account}>
        <Blackjack onBack={noop} onLogin={noop} />
      </AccountProvider>,
    );
    await screen.findByTestId('bj-chips');
    await user.click(screen.getByRole('tab', { name: 'À plusieurs' }));
    await user.type(screen.getByLabelText('Votre pseudo'), 'Invitée');
    await user.type(screen.getByLabelText('Code de la table'), created.code);
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));
    expect(await screen.findByText(/En attente du lancement par l’hôte/)).toBeInTheDocument();
    expect(screen.getByText('Hôte')).toBeInTheDocument();
    expect(screen.getByText('Invitée')).toBeInTheDocument();
    // Table inconnue : message d'erreur lisible
    await user.click(screen.getByRole('button', { name: 'Quitter la table' }));
    await user.type(await screen.findByLabelText('Code de la table'), 'BJ-ZZZZ');
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  }, 20000);
});
