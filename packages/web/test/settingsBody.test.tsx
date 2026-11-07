import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsBody } from '../src/components/SettingsBody';
import { SettingsProvider } from '../src/lib/settings';
import { Home } from '../src/screens/Home';
import { ClientProvider } from '../src/lib/context';
import { GameClient } from '../src/lib/client';
import { MemorySessionStore } from '../src/lib/session';

// Paramètres : couleur du tapis et dos des cartes, choisis dans un onglet dédié accessible depuis l'accueil
// (et retrouvés, identiques, dans la fenêtre « Options » en jeu). Persistance via localStorage vérifiée ici.

const KEY = 'poker.settings.v1';

function renderSettings() {
  return render(
    <SettingsProvider>
      <SettingsBody />
    </SettingsProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('paramètres : tapis et dos des cartes', () => {
  it('sélectionne « Vert classique » et « Losange » par défaut', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: 'Vert classique' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Losange' })).toHaveAttribute('aria-checked', 'true');
  });

  it('change la couleur du tapis et la retient (localStorage)', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Bordeaux' }));
    expect(screen.getByRole('radio', { name: 'Bordeaux' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Vert classique' })).toHaveAttribute('aria-checked', 'false');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.feltColor).toBe('bordeaux');
  });

  it('change le dos des cartes et la retient (localStorage)', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Étoile' }));
    expect(screen.getByRole('radio', { name: 'Étoile' })).toHaveAttribute('aria-checked', 'true');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.cardBack).toBe('etoile');
  });

  it('un réglage enregistré est repris au prochain montage', () => {
    localStorage.setItem(KEY, JSON.stringify({ fourColor: false, sound: true, feltColor: 'bleu', cardBack: 'rayures' }));
    renderSettings();
    expect(screen.getByRole('radio', { name: 'Bleu nuit' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Rayures' })).toHaveAttribute('aria-checked', 'true');
  });

  it('les cases sons et quatre couleurs fonctionnent toujours', () => {
    renderSettings();
    const fourColor = screen.getByRole('checkbox', { name: /quatre couleurs/ });
    const sound = screen.getByRole('checkbox', { name: /sons et vibrations/i });
    expect(fourColor).not.toBeChecked();
    expect(sound).toBeChecked();
    fireEvent.click(fourColor);
    fireEvent.click(sound);
    expect(fourColor).toBeChecked();
    expect(sound).not.toBeChecked();
  });
});

describe('accueil : onglet Paramètres', () => {
  function renderHome() {
    const client = new GameClient({ storage: new MemorySessionStore() });
    client.resume = () => false;
    client.dispose = () => undefined;
    client.listRooms = async () => [];
    return render(
      <SettingsProvider>
        <ClientProvider client={client}>
          <Home onCreate={() => undefined} onJoin={() => undefined} onTrain={() => undefined} />
        </ClientProvider>
      </SettingsProvider>,
    );
  }

  it('ouvre les paramètres depuis l’accueil et permet de changer le tapis', () => {
    renderHome();
    fireEvent.click(screen.getByText('Paramètres'));
    expect(screen.getByText('Couleur du tapis')).toBeInTheDocument();
    expect(screen.getByText('Dos des cartes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Anthracite' }));
    expect(screen.getByRole('radio', { name: 'Anthracite' })).toHaveAttribute('aria-checked', 'true');
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.feltColor).toBe('anthracite');
  });
});
