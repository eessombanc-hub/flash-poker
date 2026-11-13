import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DailyStrip, EngagementPanel } from '../src/components/Engagement';
import { RewardsPanel } from '../src/components/Rewards';
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
  season: { id: '2026-T4', year: 2026, quarter: 4, start: Date.UTC(2026, 9, 1), end: Date.now() + 10 * 86_400_000 },
  career: { xp: 520, bestLeague: 1, feats: 7, seasons: [{ id: '2026-T4', year: 2026, quarter: 4, xp: 520, league: 'silver', feats: 7, current: true }] },
  equipped: { title: 'title.novice', frame: 'frame.silver', emblem: null },
};
const board: XpRanking = {
  rows: [
    { rank: 1, nickname: 'Ana', avatar: null, xp: 900, league: 'silver', title: null, frame: 'frame.gold', emblem: 'emblem.spade', you: false },
    { rank: 2, nickname: 'Emeric', avatar: null, xp: 520, league: 'silver', title: 'title.regular', frame: null, emblem: null, you: true },
  ],
  mine: null,
  players: 5,
  season: { id: '2026-T4', year: 2026, quarter: 4, start: 0, end: 1 },
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
    expect(screen.getByRole('progressbar', { name: 'Progression vers le grade suivant' })).toHaveAttribute('aria-valuenow', '15');
    expect(screen.getByText('Encore 680 XP pour atteindre le grade Or')).toBeInTheDocument();
    expect(screen.getByText('1 débloqués sur 2.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Cent parties jouées')).toBeInTheDocument();
    expect(screen.getByText('+120 XP')).toBeInTheDocument();
    const board = screen.getByRole('heading', { name: 'Classement de la saison' }).closest('section')!;
    expect(within(board).getAllByRole('listitem')).toHaveLength(2);
    expect(within(board).getByText('(vous)')).toBeInTheDocument();
  });
  it('indique la saison, les jours restants et la remise à zéro, et habille le classement des récompenses équipées', async () => {
    render(wrap(<EngagementPanel />));
    expect(await screen.findByText('Saison 4 · 2026', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Plus que \d+ jours/)).toBeInTheDocument();
    expect(screen.getByText(/repartent de zéro à chaque saison de trois mois/)).toBeInTheDocument();
    expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'frame.gold');
    expect(screen.getByRole('img', { name: 'Emblème pique' })).toBeInTheDocument();
    expect(screen.getByText('Habitué')).toBeInTheDocument();
  });
  it('le bandeau de l’accueil rappelle la ligue et les points', async () => {
    render(wrap(<DailyStrip onOpen={() => undefined} />));
    expect(await screen.findByText('Argent')).toBeInTheDocument();
    expect(screen.getByText(/520 XP/)).toBeInTheDocument();
  });
});

describe('galerie de récompenses', () => {
  const rewards = {
    items: [
      { id: 'title.novice', kind: 'title', need: { of: 'xp', n: 0 }, unlocked: true, value: 0, target: 0 },
      { id: 'title.shark', kind: 'title', need: { of: 'league', league: 'platinum' }, unlocked: false, value: 1, target: 3 },
      { id: 'frame.ember', kind: 'frame', need: { of: 'feat', feat: 'win_row_5' }, unlocked: false, value: 0, target: 1 },
      { id: 'emblem.spade', kind: 'emblem', need: { of: 'xp', n: 1000 }, unlocked: true, value: 1000, target: 1000 },
    ],
    equipped: { title: null, frame: null, emblem: null },
    career: { xp: 1200, bestLeague: 1, feats: 9, seasons: [{ id: '2026-T4', year: 2026, quarter: 4, xp: 1200, league: 'silver', feats: 9, current: true }, { id: '2026-T3', year: 2026, quarter: 3, xp: 0, league: 'bronze', feats: 0, current: false }] },
  };
  it('montre les conditions de déblocage, équipe une récompense gagnée et liste les saisons', async () => {
    const equip = vi.fn().mockResolvedValue({ title: 'title.novice', frame: null, emblem: null });
    const acc = { rewards: vi.fn().mockResolvedValue(rewards), equip } as unknown as AccountClient;
    render(
      <SettingsProvider>
        <AccountProvider account={acc}>
          <RewardsPanel />
        </AccountProvider>
      </SettingsProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Galerie de récompenses' })).toBeInTheDocument();
    const shark = screen.getByTestId('reward-title.shark');
    expect(within(shark).getByText('Atteindre le grade Platine lors d’une saison')).toBeInTheDocument();
    expect(within(shark).getByText('Verrouillé')).toBeInTheDocument();
    expect(within(screen.getByTestId('reward-frame.ember')).getByText('Haut fait : Cinq victoires d’affilée')).toBeInTheDocument();
    expect(within(screen.getByTestId('reward-title.novice')).getByText('Offert')).toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('reward-title.novice')).getByRole('button', { name: 'Équiper' }));
    expect(equip).toHaveBeenCalledWith('title', 'title.novice');
    expect(await within(screen.getByTestId('reward-title.novice')).findByRole('button', { name: 'Retirer' })).toBeInTheDocument();
    expect(screen.getByText('Saison 3 · 2026')).toBeInTheDocument();
  });
});
