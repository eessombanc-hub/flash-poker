import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveStats } from '../src/lib/liveStats';
import { Home } from '../src/screens/Home';
import { ClientProvider } from '../src/lib/context';
import { GameClient } from '../src/lib/client';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';

afterEach(() => vi.useRealTimers());

describe('fréquentation du site', () => {
  it('les compteurs n’apparaissent qu’à partir d’une fréquentation suffisante, sinon un message neutre les remplace', () => {
    const client = new GameClient({ storage: new MemorySessionStore() });
    client.dispose = () => undefined;
    client.listRooms = async () => [];
    const view = (live: { online: number; rooms: number } | null) => (
      <SettingsProvider>
        <ClientProvider client={client}>
          <Home onCreate={() => undefined} onJoin={() => undefined} onTrain={() => undefined} live={live} />
        </ClientProvider>
      </SettingsProvider>
    );
    const { rerender } = render(view(null));
    expect(screen.queryByTestId('lob.live.online')).toBeNull();
    expect(screen.getByTestId('lob.live.always')).toBeInTheDocument();
    rerender(view({ online: 3, rooms: 1 }));
    expect(screen.queryByTestId('lob.live.online')).toBeNull();
    rerender(view({ online: 12, rooms: 3 }));
    expect(screen.getByTestId('lob.live.online').textContent).toBe('12');
    expect(screen.getByTestId('lob.live.rooms').textContent).toBe('3');
    expect(screen.queryByTestId('lob.live.always')).toBeNull();
    expect(screen.getByText('Joueurs en ligne')).toBeInTheDocument();
    expect(screen.getByText('Salles ouvertes')).toBeInTheDocument();
  });

  it('le crochet se signale avec un identifiant stable, se répète à intervalle régulier et s’arrête au démontage', async () => {
    const seen: string[] = [];
    const stats = vi.fn(async (id: string) => {
      seen.push(id);
      return { online: seen.length, rooms: 2 };
    });
    const client = { stats };
    const { result, unmount } = renderHook(() => useLiveStats(client, 25));
    await waitFor(() => expect(stats.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(result.current).toMatchObject({ rooms: 2 });
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toMatch(/^[a-z0-9]{24}$/);
    unmount();
    const calls = stats.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(stats.mock.calls.length).toBe(calls);
  });

  it('serveur injoignable : pas de chiffres, aucune erreur', async () => {
    const offline = { stats: async () => { throw new Error('hors ligne'); } };
    const { result } = renderHook(() => useLiveStats(offline));
    await act(async () => {});
    expect(result.current).toBeNull();
  });
});
