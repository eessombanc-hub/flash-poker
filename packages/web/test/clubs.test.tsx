import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClubBoard } from '../src/components/Clubs';
import { RankingsPanel } from '../src/components/Rankings';
import { AccountProvider } from '../src/lib/context';
import type { AccountClient } from '../src/lib/account';
import { SettingsProvider } from '../src/lib/settings';
import type { ClubRanking } from '../src/lib/types';

const season = { id: '2026-T4', year: 2026, quarter: 4 as const, start: 0, end: 1 };
const board: ClubRanking = {
  rows: [
    { rank: 1, name: 'Amical Poker Club', members: 5, active: 3, xp: 1200, average: 400, you: true },
    { rank: 2, name: 'Cercle Élysée', members: 2, active: 2, xp: 500, average: 250, you: false },
  ],
  mine: null,
  clubs: 2,
  season,
};
const acc = (data: ClubRanking, _club: string | null) =>
  ({ clubRanking: vi.fn().mockResolvedValue(data), rankings: vi.fn().mockResolvedValue({ rows: [], mine: null, since: 0, until: null }) }) as unknown as AccountClient;

const wrap = (ui: React.ReactNode, client: AccountClient) => (
  <SettingsProvider>
    <AccountProvider account={client}>{ui}</AccountProvider>
  </SettingsProvider>
);

describe('classement des clubs', () => {
  it('affiche les clubs avec leurs membres, leur expérience et repère le club du joueur', async () => {
    render(wrap(<ClubBoard />, acc(board, 'Amical Poker Club')));
    const list = await screen.findByRole('list', { name: 'Classement des clubs' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Amical Poker Club')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/5 membres, 3 actifs cette saison/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('(votre club)')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/250 en moyenne/)).toBeInTheDocument();
    expect(screen.getByText(/au moins deux joueurs/)).toBeInTheDocument();
  });
  it('sans club classé, explique la condition ; l’onglet Clubs du classement y mène', async () => {
    render(wrap(<RankingsPanel />, acc({ rows: [], mine: null, clubs: 0, season }, null)));
    await userEvent.click(screen.getByRole('radio', { name: 'Clubs' }));
    expect(await screen.findByText(/Aucun club n’est encore classé/)).toBeInTheDocument();
    expect(screen.getByText(/Vous n’avez pas indiqué de club/)).toBeInTheDocument();
  });
});
