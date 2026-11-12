import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RankingsPanel } from '../src/components/Rankings';
import type { AccountClient } from '../src/lib/account';
import { AccountProvider } from '../src/lib/context';
import type { Ranking, RankGame, RankPeriod } from '../src/lib/types';

const row = (rank: number, nickname: string, wins: number, played: number, you = false, net: number | null = null) => ({ rank, nickname, avatar: null, wins, played, net, you });
const T0 = Date.UTC(2026, 10, 8, 23);

function renderPanel(answer: (g: RankGame, p: RankPeriod) => Ranking) {
  const rankings = vi.fn(async (g: RankGame, p: RankPeriod) => answer(g, p));
  render(
    <AccountProvider account={{ rankings } as unknown as AccountClient}>
      <RankingsPanel />
    </AccountProvider>,
  );
  return rankings;
}

describe('onglet Classements', () => {
  it('affiche la semaine par défaut, souligne le joueur et change de période et de jeu', async () => {
    const rankings = renderPanel((game, period) => ({
      game, period, since: T0, until: T0 + 7 * 86_400_000,
      rows: game === 'blackjack' ? [row(1, 'Ana', 3, 5, false, 120), row(2, 'Bea', 1, 4, true, -30)] : [row(1, 'Ana', 4, 6), row(2, 'Bea', 2, 3, true)],
      mine: null,
    }));
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: /Parties de poker .* — Semaine/ });
    expect(rankings).toHaveBeenLastCalledWith('poker', 'week');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('4 victoires')).toBeInTheDocument();
    expect(within(list).getByText('vous').closest('li')).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('radio', { name: 'Mois' }));
    await waitFor(() => expect(rankings).toHaveBeenLastCalledWith('poker', 'month'));
    await user.click(screen.getByRole('radio', { name: 'Total' }));
    await waitFor(() => expect(rankings).toHaveBeenLastCalledWith('poker', 'all'));
    expect(await screen.findByText('Depuis la création des comptes.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type de jeu'), 'blackjack');
    await waitFor(() => expect(rankings).toHaveBeenLastCalledWith('blackjack', 'all'));
    expect(await screen.findByText('6 mains'.replace('6', '5'))).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type de jeu'), 'LE10');
    await waitFor(() => expect(rankings).toHaveBeenLastCalledWith('LE10', 'all'));
  });

  it('classement vide, et position du joueur quand il est hors du haut du classement', async () => {
    renderPanel((game, period) => ({ game, period, since: 0, until: null, rows: [], mine: null }));
    expect(await screen.findByText(/Personne n’a encore joué à ce jeu/)).toBeInTheDocument();
  });

  it('joueur hors du haut du classement : sa ligne est rappelée dessous', async () => {
    renderPanel((game, period) => ({ game, period, since: 0, until: null, rows: [row(1, 'Ana', 9, 9)], mine: row(27, 'Moi', 1, 4, true) }));
    expect(await screen.findByText('Votre position')).toBeInTheDocument();
    expect(screen.getByText('Moi')).toBeInTheDocument();
  });
});
