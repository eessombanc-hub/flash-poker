import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import type { RoomSummary } from '../src/lib/api';
import { Home } from '../src/screens/Home';
import { Table } from '../src/screens/Table';
import { game, renderWith, roomView } from './fixtures';

const ROOM: RoomSummary = { code: 'POKER-7K2M', name: 'Vendredi soir', status: 'RUNNING', maxPlayers: 2, seatsLeft: 0, targetPoints: 3, stakeChips: 0, assistance: false, spectators: 2 };

function renderHome(rooms: RoomSummary[], onWatch = vi.fn(), onJoin = vi.fn()) {
  const client = new GameClient({ storage: new MemorySessionStore() });
  client.resume = () => false;
  client.dispose = () => undefined;
  client.listRooms = async () => rooms;
  render(
    <SettingsProvider>
      <ClientProvider client={client}>
        <Home onCreate={vi.fn()} onJoin={onJoin} onWatch={onWatch} onTrain={vi.fn()} />
      </ClientProvider>
    </SettingsProvider>,
  );
  return { onWatch, onJoin };
}

describe('accueil : regarder une partie en cours', () => {
  it('une partie en cours complète propose « Regarder » mais pas « Rejoindre »', async () => {
    const { onWatch, onJoin } = renderHome([ROOM]);
    expect(await screen.findByText('Vendredi soir')).toBeInTheDocument();
    expect(screen.getByText('2 spectateurs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejoindre' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Regarder' }));
    expect(onWatch).toHaveBeenCalledWith('POKER-7K2M');
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('une partie en cours avec un siège libre propose les deux', async () => {
    renderHome([{ ...ROOM, seatsLeft: 1, spectators: 0 }]);
    await screen.findByText('Vendredi soir');
    expect(screen.getByRole('button', { name: 'Regarder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeInTheDocument();
  });
});

describe('table vue par un spectateur', () => {
  const watcherView = () => roomView({ you: { playerId: 's_1', role: 'SPECTATOR' }, spectators: [{ id: 's_1', nickname: 'Curieux', avatar: null }] }, game());

  it('affiche la table, les points et le chat, sans main ni boutons de jeu', () => {
    renderWith(<Table />, watcherView());
    expect(screen.getByText('Vous regardez cette partie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scores/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Options/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ouvrir le chat|chat/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Valider|Confirmer/ })).toBeNull();
  });

  it('quitter l’observation ne demande pas de confirmation', async () => {
    const { client } = renderWith(<Table />, watcherView());
    const leave = vi.spyOn(client, 'leave').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Quitter l’observation' }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
  });
});
