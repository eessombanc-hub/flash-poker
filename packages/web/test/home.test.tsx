import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClient } from '../src/lib/client';
import { ApiError, type RoomSummary } from '../src/lib/api';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import { Home } from '../src/screens/Home';

// Liste publique des parties ouvertes sur l'accueil : affichage, état vide, état d'erreur, sélection
// (navigation vers « Rejoindre » avec le code pré-rempli), et actualisation périodique.

function renderHome(listRooms: () => Promise<RoomSummary[]>, onJoin = vi.fn(), onCreate = vi.fn()) {
  const client = new GameClient({ storage: new MemorySessionStore() });
  client.resume = () => false;
  client.dispose = () => undefined;
  client.listRooms = listRooms;
  const utils = render(
    <SettingsProvider>
      <ClientProvider client={client}>
        <Home onCreate={onCreate} onJoin={onJoin} />
      </ClientProvider>
    </SettingsProvider>,
  );
  return { ...utils, onJoin, onCreate };
}

const ROOM: RoomSummary = { code: 'POKER-7K2M', name: 'Vendredi soir', status: 'WAITING', maxPlayers: 4, seatsLeft: 2, targetPoints: 3, stakeChips: 2000, assistance: false };

afterEach(() => {
  vi.useRealTimers();
});

describe('accueil : parties ouvertes', () => {
  it('affiche les parties renvoyées par le serveur, avec places occupées et objectif', async () => {
    renderHome(async () => [ROOM]);
    expect(await screen.findByText('Vendredi soir')).toBeInTheDocument();
    expect(screen.getByText('2/4 joueurs')).toBeInTheDocument();
    expect(screen.getByText(/Objectif 3 pts/)).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });

  it('affiche la mise et le badge assistance quand ils s’appliquent', async () => {
    renderHome(async () => [{ ...ROOM, assistance: true, stakeChips: 500 }]);
    expect(await screen.findByText(/500\s*jetons/u)).toBeInTheDocument();
    expect(screen.getByText('Assistance')).toBeInTheDocument();
  });

  it('une partie en cours affiche le badge « En cours »', async () => {
    renderHome(async () => [{ ...ROOM, status: 'RUNNING' }]);
    expect(await screen.findByText('En cours')).toBeInTheDocument();
  });

  it('état vide : aucune partie ouverte', async () => {
    renderHome(async () => []);
    expect(await screen.findByText(/Aucune partie ouverte/)).toBeInTheDocument();
  });

  it('état d’erreur réseau : message plutôt qu’un plantage', async () => {
    renderHome(async () => {
      throw new ApiError('NETWORK', 'Impossible de joindre le serveur.');
    });
    expect(await screen.findByText(/Liste indisponible/)).toBeInTheDocument();
  });

  it('cliquer une partie appelle onJoin avec son code (prérempli dans le formulaire suivant)', async () => {
    const { onJoin } = renderHome(async () => [ROOM]);
    fireEvent.click(await screen.findByText('Vendredi soir'));
    expect(onJoin).toHaveBeenCalledWith('POKER-7K2M');
  });

  it('le bouton « Rejoindre avec un code » appelle onJoin sans code', async () => {
    const { onJoin } = renderHome(async () => []);
    fireEvent.click(screen.getByText('Rejoindre avec un code'));
    expect(onJoin).toHaveBeenCalledWith();
  });

  it('la liste s’actualise périodiquement', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const listRooms = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? [ROOM] : [{ ...ROOM, name: 'Table actualisée' }];
    });
    renderHome(listRooms);
    await vi.waitFor(() => expect(listRooms).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 5; i++) await act(async () => vi.advanceTimersByTime(1000));
    await vi.waitFor(() => expect(listRooms).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Table actualisée')).toBeInTheDocument();
  });
});
