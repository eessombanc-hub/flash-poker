import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import { Seat } from '../src/components/Seat';
import { Home } from '../src/screens/Home';
import { TrainingRoom } from '../src/screens/Forms';
import { players } from './fixtures';

// Mode entraînement : bouton sur l'accueil, formulaire dédié (CPU, objectif, assistance, pseudo, avatar),
// envoi de la demande de création avec `cpu`, et pastille « CPU » sur les sièges pilotés par le serveur.

function makeClient(createRoom = vi.fn(async () => undefined)) {
  const client = new GameClient({ storage: new MemorySessionStore() });
  client.resume = () => false;
  client.dispose = () => undefined;
  client.listRooms = async () => [];
  client.createRoom = createRoom;
  return client;
}

function renderForm(client: GameClient, onBack = vi.fn()) {
  render(
    <SettingsProvider>
      <ClientProvider client={client}>
        <TrainingRoom onBack={onBack} />
      </ClientProvider>
    </SettingsProvider>,
  );
  return { onBack };
}

describe('accueil : entrée du mode entraînement', () => {
  it('le bouton « Jouer en solo » ouvre l’entraînement', () => {
    const onTrain = vi.fn();
    render(
      <SettingsProvider>
        <ClientProvider client={makeClient()}>
          <Home onCreate={() => undefined} onJoin={() => undefined} onTrain={onTrain} />
        </ClientProvider>
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Jouer en solo' }));
    expect(onTrain).toHaveBeenCalledTimes(1);
  });
});

describe('formulaire d’entraînement', () => {
  it('refuse un pseudo vide, puis envoie la création avec les CPU, l’objectif et la mise à zéro', async () => {
    const createRoom = vi.fn(async () => undefined);
    renderForm(makeClient(createRoom));
    const submit = screen.getByRole('button', { name: 'Lancer l’entraînement' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Votre pseudo'), { target: { value: 'Emeric' } });
    expect(submit).toBeEnabled();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Adversaires CPU' })).getByRole('radio', { name: '2' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Objectif en points' })).getByRole('radio', { name: '5' }));
    fireEvent.click(submit);

    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(createRoom).toHaveBeenCalledWith({
      name: 'Entraînement',
      maxPlayers: 3,
      targetPoints: 5,
      stakeChips: 0,
      assistance: false,
      cpu: 2,
      nickname: 'Emeric',
      avatar: 'or',
    });
  });

  it('valeurs par défaut : 3 CPU, objectif 3, sans assistance ; l’assistance se choisit', async () => {
    const createRoom = vi.fn(async () => undefined);
    renderForm(makeClient(createRoom));
    expect(within(screen.getByRole('radiogroup', { name: 'Adversaires CPU' })).getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('radiogroup', { name: 'Objectif en points' })).getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Avec assistance' }));
    fireEvent.change(screen.getByLabelText('Votre pseudo'), { target: { value: 'Emeric' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’entraînement' }));
    await waitFor(() => expect(createRoom).toHaveBeenCalled());
    expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ assistance: true, cpu: 3, maxPlayers: 4 }));
  });

  it('prévient qu’à 6 joueurs deux variantes ne sont pas jouables', () => {
    renderForm(makeClient());
    expect(screen.getByText(/toutes les variantes sont jouables/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Adversaires CPU' })).getByRole('radio', { name: '5' }));
    expect(screen.getByText(/Le 10 et le Poker fermé à 2 changes ne sont pas jouables/)).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur et laisse réessayer', async () => {
    const { ApiError } = await import('../src/lib/api');
    const createRoom = vi.fn(async () => {
      throw new ApiError('BAD_REQUEST', 'cpu : trop grand');
    });
    renderForm(makeClient(createRoom));
    fireEvent.change(screen.getByLabelText('Votre pseudo'), { target: { value: 'Emeric' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’entraînement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cpu : trop grand');
    expect(screen.getByRole('button', { name: 'Lancer l’entraînement' })).toBeEnabled();
  });

  it('le bouton Retour revient à l’accueil', () => {
    const { onBack } = renderForm(makeClient());
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('siège d’un joueur CPU', () => {
  const props = { isMe: false, target: 3, shown: [], hiddenCount: 0, active: false, validated: false, folded: false, insured: false, isChooser: false, score: 0 };
  it('affiche la pastille CPU et le signale aux lecteurs d’écran', () => {
    const [, cpu] = players(2, { p2: { bot: true } });
    render(
      <SettingsProvider>
        <Seat player={cpu!} {...props} />
      </SettingsProvider>,
    );
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByTestId(`seat-${cpu!.id}`).getAttribute('aria-label')).toContain('joueur CPU');
  });
  it('rien de tel pour un joueur humain', () => {
    const [human] = players(2);
    render(
      <SettingsProvider>
        <Seat player={human!} {...props} />
      </SettingsProvider>,
    );
    expect(screen.queryByText('CPU')).toBeNull();
  });
});

describe('Menu solo', () => {
  it('propose les huit variantes, le hasard et le Blackjack', async () => {
    const { Solo } = await import('../src/screens/Solo');
    const onPick = vi.fn();
    const onBlackjack = vi.fn();
    render(<Solo onBack={() => undefined} onPick={onPick} onBlackjack={onBlackjack} />);
    expect(within(screen.getByRole('list', { name: 'Variantes de poker' })).getAllByRole('listitem')).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Le 10' }));
    expect(onPick).toHaveBeenLastCalledWith('LE10');
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les variantes' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Blackjack' }));
    expect(onBlackjack).toHaveBeenCalled();
  });
  it('variante imposée : 5 CPU interdits quand elle ne se joue pas à 6, options du 6-3', () => {
    const { rerender } = render(<ClientProvider client={makeClient()}><TrainingRoom onBack={() => undefined} variant="LE10" /></ClientProvider>);
    expect(screen.getByRole('heading', { name: /Solo : Le 10/ })).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Adversaires CPU' })).queryByRole('radio', { name: '5' })).toBeNull();
    rerender(<ClientProvider client={makeClient()}><TrainingRoom onBack={() => undefined} variant="V6_3" /></ClientProvider>);
    expect(screen.getByRole('radiogroup', { name: 'Tétines' })).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Adversaires CPU' })).getByRole('radio', { name: '5' })).toBeInTheDocument();
  });
});
