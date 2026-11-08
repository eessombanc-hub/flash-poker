import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HeroScene, RevealCard, SpinTrophy, CoinRain } from '../src/components/Scene3D';
import { SettingsBody } from '../src/components/SettingsBody';
import { AMBIANCE_OPTIONS } from '../src/lib/theme';
import { SettingsProvider } from '../src/lib/settings';

const KEY = 'poker.settings.v1';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.ambiance;
});

function renderSettings() {
  return render(
    <SettingsProvider>
      <SettingsBody />
    </SettingsProvider>,
  );
}

describe('ambiances de couleurs', () => {
  it('propose six ambiances, cognac par défaut, appliquée à la page', () => {
    renderSettings();
    expect(AMBIANCE_OPTIONS).toHaveLength(6);
    const group = screen.getByRole('radiogroup', { name: 'Ambiance' });
    expect(group.querySelectorAll('[role=radio]')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /^Cognac/ })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.ambiance).toBe('cognac');
  });

  it('change d’ambiance, la retient et met à jour la couleur de la barre du navigateur', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#081a3d';
    document.head.appendChild(meta);
    renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: /^Carbone/ }));
    expect(document.documentElement.dataset.ambiance).toBe('carbone');
    expect(meta.content).toBe('#0b0b0e');
    expect(JSON.parse(localStorage.getItem(KEY)!).ambiance).toBe('carbone');
    // les autres réglages ne sont pas perdus
    expect(JSON.parse(localStorage.getItem(KEY)!).feltColor).toBe('vert');
    meta.remove();
  });

  it('ignore une valeur enregistrée inconnue', () => {
    localStorage.setItem(KEY, JSON.stringify({ ambiance: 'fluo' }));
    renderSettings();
    expect(document.documentElement.dataset.ambiance).toBe('cognac');
  });
});

describe('effets 3D', () => {
  it('l’éventail d’accueil : cinq cartes, un clic retourne la carte', () => {
    render(
      <SettingsProvider>
        <HeroScene />
      </SettingsProvider>,
    );
    const buttons = screen.getAllByRole('button', { name: 'Retourner la carte' });
    expect(buttons).toHaveLength(5);
    fireEvent.click(buttons[0]!);
    expect(screen.getByRole('button', { name: 'Retourner la carte face visible' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('une carte dévoilée reste lisible par les lecteurs d’écran (le dos est masqué)', () => {
    render(
      <SettingsProvider>
        <RevealCard code="As" />
      </SettingsProvider>,
    );
    expect(screen.getByRole('img', { name: /as de pique/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /face cachée/i })).toBeNull();
  });

  it('trophée et pluie de pièces se montent sans erreur', () => {
    const { container } = render(
      <SettingsProvider>
        <SpinTrophy />
        <CoinRain count={4} />
      </SettingsProvider>,
    );
    act(() => undefined);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
