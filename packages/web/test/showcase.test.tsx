import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameShowcase, type Showcase } from '../src/components/GameShowcase';
import { SettingsProvider } from '../src/lib/settings';

// Diaporama central de l'accueil : un jeu par diapositive, navigation, pause, arrêt à la main.

const mk = (id: string, name: string, onClick = vi.fn()): Showcase => ({
  id, name, title: `Titre ${name}`, text: `Texte ${name}`, cta: `Jouer ${name}`, onClick,
  art: <span />, bg: 'from-felt-700 to-ink-900', suit: '♠',
});

function setup(slides: Showcase[]) {
  render(<SettingsProvider><GameShowcase slides={slides} label="Jeux" /></SettingsProvider>);
}

afterEach(() => vi.useRealTimers());

describe('GameShowcase', () => {
  it('affiche la première diapositive et déclenche son action', () => {
    const a = vi.fn();
    setup([mk('a', 'Alpha', a), mk('b', 'Bravo')]);
    expect(screen.getByText('Titre Alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jouer Alpha' }));
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('défile seul, puis s’arrête dès que l’on navigue à la main', () => {
    vi.useFakeTimers();
    setup([mk('a', 'Alpha'), mk('b', 'Bravo'), mk('c', 'Charlie')]);
    act(() => { vi.advanceTimersByTime(6600); });
    expect(screen.getByText('Titre Bravo')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Charlie/ }));
    expect(screen.getByText('Titre Charlie')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('Titre Charlie')).toBeTruthy();
  });

  it('la pause arrête le défilement', () => {
    vi.useFakeTimers();
    setup([mk('a', 'Alpha'), mk('b', 'Bravo')]);
    fireEvent.click(screen.getByRole('button', { name: 'Mettre le défilement en pause' }));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('Titre Alpha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relancer le défilement' })).toBeTruthy();
  });
});
