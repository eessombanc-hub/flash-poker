import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyStrip, EngagementPanel } from '../src/components/Engagement';
import { SettingsProvider } from '../src/lib/settings';
import { AccountProvider } from '../src/lib/context';
import type { AccountClient } from '../src/lib/account';
import type { ProgressionReply, XpRanking } from '../src/lib/types';

const prog: ProgressionReply = {
  xp: 520,
  league: { id: 'silver', index: 1, floor: 400, next: { id: 'gold', floor: 1200 }, progress: 0.15 },
  breakdown: { games: 300, challenges: 120, achievements: 100 },
  achievements: [
    { id: 'first_game', tier: 'bronze', value: 1, target: 1, unlocked: true, xp: 15 },
    { id: 'games_100', tier: 'gold', value: 12, target: 100, unlocked: false, xp: 120 },
  ],
  rank: 2,
  players: 5,
};
const board: XpRanking = {
  rows: [
    { rank: 1, nickname: 'Ana', avatar: null, xp: 900, league: 'silver', you: false },
    { rank: 2, nickname: 'Emeric', avatar: null, xp: 520, league: 'silver', you: true },
  ],
  mine: null,
  players: 5,
};
const engagement = { day: '2026-11-13', streak: 2, bestStreak: 2, playedToday: 1, wonToday: 0, challenges: [{ id: 'play1', target: 1, progress: 1, done: true }], trophies: [] };

function account() {
  return {
    engagement: vi.fn().mockResolvedValue(engagement),
    progression: vi.fn().mockResolvedValue(prog),
    xpRanking: vi.fn().mockResolvedValue(board),
    leaderboard: vi.fn().mockResolvedValue([]),
  } as unknown as AccountClient;
}
const wrap = (ui: React.ReactNode) => (
  <SettingsProvider>
    <AccountProvider account={account()}>{ui}</AccountProvider>
  </SettingsProvider>
);

describe('ligues et hauts faits', () => {
  it('affiche la ligue, l’avancement, les hauts faits avec leur gain et le classement général', async () => {
    render(wrap(<EngagementPanel />));
    expect(await screen.findByRole('heading', { name: 'Argent' })).toBeInTheDocument();
    expect(screen.getByText(/n° 2 sur 5/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progression vers la ligue suivante' })).toHaveAttribute('aria-valuenow', '15');
    expect(screen.getByText('Encore 680 XP pour atteindre la ligue Or')).toBeInTheDocument();
    expect(screen.getByText('1 débloqués sur 2.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Cent parties jouées')).toBeInTheDocument();
    expect(screen.getByText('+120 XP')).toBeInTheDocument();
    const board = screen.getByRole('heading', { name: 'Classement des ligues' }).closest('section')!;
    expect(within(board).getAllByRole('listitem')).toHaveLength(2);
    expect(within(board).getByText('(vous)')).toBeInTheDocument();
  });
  it('le bandeau de l’accueil rappelle la ligue et les points', async () => {
    render(wrap(<DailyStrip onOpen={() => undefined} />));
    expect(await screen.findByText('Argent')).toBeInTheDocument();
    expect(screen.getByText(/520 XP/)).toBeInTheDocument();
  });
});
