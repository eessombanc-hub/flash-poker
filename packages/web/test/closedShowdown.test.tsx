import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { SettingsProvider } from '../src/lib/settings';
import type { RoundRecord } from '../src/lib/types';
import { RoundResultModal, SHOWDOWN_SECONDS } from '../src/screens/Overlays';
import { game, roomView } from './fixtures';

afterEach(() => vi.useRealTimers());

const record = (variant: string): RoundRecord =>
  ({
    roundNo: 2,
    chooser: 'p1',
    variant,
    result: { kind: 'WINNER', winner: 'p1' },
    award: { kind: 'POINTS', winner: 'p1', points: 1 },
    points: { p1: 1, p2: 0, p3: 0 },
    scoresAfter: { p1: 1, p2: 0, p3: 0 },
    summary: {
      hands: {
        p1: { cards: ['Ah', 'Ad', 'As', 'Kc', '2d'], category: 3 },
        p2: { cards: ['9h', '9d', '4s', '5c', '7d'], category: 1 },
        p3: { cards: ['2h', '8d', '4c', '5s', 'Jd'], category: 0 },
      },
    },
  }) as unknown as RoundRecord;

const show = (r: RoundRecord, onClose = () => undefined) =>
  render(
    <I18nProvider initial="fr">
      <SettingsProvider>
        <RoundResultModal record={r} events={[]} board={[]} view={roomView({}, game())} final={false} onClose={onClose} />
      </SettingsProvider>
    </I18nProvider>,
  );

describe('poker fermé : les mains avant le résultat', () => {
  it('montre toutes les mains et leurs combinaisons, sans annoncer le vainqueur', () => {
    show(record('CLOSED_2'));
    const list = screen.getByTestId('abattage');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(list).toHaveTextContent(/Brelan/);
    expect(list).toHaveTextContent(/Paire/);
    expect(screen.queryByTestId('vainqueur-manche')).toBeNull();
  });

  it('le bouton passe au résultat de la manche', async () => {
    show(record('CLOSED_1'));
    await userEvent.click(screen.getByRole('button', { name: 'Voir le résultat de la manche' }));
    expect(screen.getByTestId('vainqueur-manche')).toBeInTheDocument();
    expect(screen.queryByTestId('abattage')).toBeNull();
  });

  it('passe seul au résultat au bout du délai', () => {
    vi.useFakeTimers();
    show(record('CLOSED_2'));
    expect(screen.getByTestId('abattage')).toBeInTheDocument();
    for (let i = 0; i <= SHOWDOWN_SECONDS; i++) act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('vainqueur-manche')).toBeInTheDocument();
  });

  it('les autres variantes affichent directement le résultat', () => {
    show(record('AVIATION'));
    expect(screen.queryByTestId('abattage')).toBeNull();
    expect(screen.getByTestId('vainqueur-manche')).toBeInTheDocument();
  });
});
