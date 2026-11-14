import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import { I18nProvider } from '../src/i18n';
import { VARIANTS } from '../src/lib/labels';
import { Multiplayer } from '../src/screens/Multiplayer';
import { Home } from '../src/screens/Home';

function setup() {
  const client = new GameClient({ storage: new MemorySessionStore() });
  client.resume = () => false;
  client.dispose = () => undefined;
  client.listRooms = async () => [];
  const props = { onBack: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn(), onBlackjack: vi.fn(), onTableau: vi.fn() };
  render(
    <I18nProvider initial="fr">
      <SettingsProvider>
        <ClientProvider client={client}>
          <Multiplayer {...props} />
        </ClientProvider>
      </SettingsProvider>
    </I18nProvider>,
  );
  return props;
}

describe('Jouer en multijoueurs', () => {
  it('donne accès au poker (toutes les variantes), au blackjack et au Tableau', async () => {
    const user = userEvent.setup();
    const p = setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Jouer en multijoueurs' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer une partie' }));
    expect(p.onCreate).toHaveBeenCalledWith();
    await user.click(screen.getByRole('button', { name: 'Rejoindre avec un code' }));
    expect(p.onJoin).toHaveBeenCalled();
    const cards = screen.getAllByRole('button', { name: /^Créer une table :/ });
    expect(cards).toHaveLength(VARIANTS.length);
    await user.click(cards[0]!);
    expect(p.onCreate).toHaveBeenLastCalledWith(VARIANTS[0]!.id);
    await user.click(screen.getByRole('button', { name: 'Jouer à plusieurs au blackjack' }));
    expect(p.onBlackjack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tableau' }));
    expect(p.onTableau).toHaveBeenCalledWith('classic');
  });

  it("l'accueil propose « Jouer en multijoueurs » à la place de « Variantes »", async () => {
    const user = userEvent.setup();
    const onMultiplayer = vi.fn();
    const client = new GameClient({ storage: new MemorySessionStore() });
    client.resume = () => false;
    client.dispose = () => undefined;
    client.listRooms = async () => [];
    render(
      <I18nProvider initial="fr">
        <SettingsProvider>
          <ClientProvider client={client}>
            <Home onCreate={vi.fn()} onJoin={vi.fn()} onTrain={vi.fn()} onVariants={vi.fn()} onMultiplayer={onMultiplayer} />
          </ClientProvider>
        </SettingsProvider>
      </I18nProvider>,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).queryByText('Variantes')).toBeNull();
    await user.click(within(nav).getByRole('button', { name: /Jouer en multijoueurs/ }));
    expect(onMultiplayer).toHaveBeenCalled();
  });
});
