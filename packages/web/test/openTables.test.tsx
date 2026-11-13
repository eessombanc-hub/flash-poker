import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listOpenTables } from '../src/lib/api';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import { Home } from '../src/screens/Home';

// Parties ouvertes de tous les jeux : le Blackjack et le Tableau apparaissent à côté des salles de poker.

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('listOpenTables', () => {
  it('assemble les tables de Blackjack et les duels amicaux du Tableau', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/blackjack/tables')
        ? json({ tables: [{ code: 'BJ-AB2C', tableName: 'Découverte', host: 'Ana', seatsLeft: 2, humanSeats: 3 }] })
        : json({ games: [{ code: 'TB-XY7Z', variant: 'hand5', nickname: 'Ben' }] }),
    ) as unknown as typeof fetch;
    expect(await listOpenTables('', fetchFn)).toEqual([
      { game: 'blackjack', code: 'BJ-AB2C', title: 'Découverte', host: 'Ana', seatsLeft: 2, seats: 3 },
      { game: 'tableau', code: 'TB-XY7Z', title: 'hand5', host: 'Ben', seatsLeft: 1, seats: 2, variant: 'hand5' },
    ]);
  });

  it('une liste indisponible est vide, sans faire échouer l’autre', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.endsWith('/blackjack/tables') ? ({ ok: false } as Response) : json({ games: [{ code: 'TB-XY7Z', variant: 'classic', nickname: 'Ben' }] }))) as unknown as typeof fetch;
    expect((await listOpenTables('', fetchFn)).map((t) => t.code)).toEqual(['TB-XY7Z']);
  });
});

describe('accueil : parties ouvertes de tous les jeux', () => {
  it('affiche une table de Blackjack et un duel du Tableau, et ouvre le bon jeu au clic', async () => {
    const client = new GameClient({ storage: new MemorySessionStore() });
    client.resume = () => false;
    client.dispose = () => undefined;
    client.listRooms = async () => [];
    client.listOpenTables = async () => [
      { game: 'blackjack', code: 'BJ-AB2C', title: 'Découverte', host: 'Ana', seatsLeft: 2, seats: 3 },
      { game: 'tableau', code: 'TB-XY7Z', title: 'hand5', host: 'Ben', seatsLeft: 1, seats: 2, variant: 'hand5' },
    ];
    const onJoinTable = vi.fn();
    render(
      <SettingsProvider>
        <ClientProvider client={client}>
          <Home onCreate={() => undefined} onJoin={() => undefined} onJoinTable={onJoinTable} onTrain={() => undefined} />
        </ClientProvider>
      </SettingsProvider>,
    );
    const bj = await screen.findByRole('button', { name: /Blackjack · Découverte/ });
    expect(bj).toHaveTextContent('Hôte : Ana');
    fireEvent.click(bj);
    expect(onJoinTable).toHaveBeenCalledWith('blackjack', 'BJ-AB2C', undefined);
    fireEvent.click(await screen.findByRole('button', { name: /Tableau · Tableau 5 cartes/ }));
    await waitFor(() => expect(onJoinTable).toHaveBeenLastCalledWith('tableau', 'TB-XY7Z', 'hand5'));
    expect(screen.queryByText(/Aucune partie ouverte/)).toBeNull();
  });
});
