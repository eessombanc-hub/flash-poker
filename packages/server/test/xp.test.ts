import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { logRank } from '../src/accounts/rankings';
import { AccountService } from '../src/accounts/service';
import { ACHIEVEMENTS, computeProgression, leagueFor, LEAGUES, type XpFacts } from '../src/accounts/xp';

const D = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 11, 0, 0);
const none: XpFacts = { games: [], bjHands: 0, bjWins: 0, tbGames: 0, tbWins: 0, variants: 0, variantWins: 0 };

describe('ligues', () => {
  it('Bronze au départ, puis une ligue à chaque seuil, jusqu’à Légende', () => {
    expect(LEAGUES.map((l) => l.id)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend']);
    expect(leagueFor(0).id).toBe('bronze');
    expect(leagueFor(299).id).toBe('bronze');
    expect(leagueFor(300).id).toBe('silver');
    expect(leagueFor(12_000).id).toBe('legend');
    expect(leagueFor(99_999).next).toBeNull();
    expect(leagueFor(99_999).progress).toBe(1);
  });
  it('avancement vers la ligue suivante', () => {
    expect(leagueFor(150)).toMatchObject({ id: 'bronze', progress: 0.5, next: { id: 'silver', floor: 300 } });
  });
});

describe('points d’expérience', () => {
  it('sans jeu : zéro point, aucun haut fait', () => {
    const p = computeProgression(none);
    expect(p.xp).toBe(0);
    expect(p.achievements.every((a) => !a.unlocked)).toBe(true);
    expect(p.achievements).toHaveLength(ACHIEVEMENTS.length);
  });
  it('une partie gagnée rapporte 50 points, plus les défis du jour et les hauts faits débloqués', () => {
    const p = computeProgression({ ...none, games: [{ endedAt: NOW - 1000, won: true }] });
    // partie 20 + victoire 30 ; défis jouer 1 (10) + gagner 1 (20) ; hauts faits « première partie » et « première victoire » (15 chacun)
    expect(p.breakdown).toEqual({ games: 50, challenges: 30, achievements: 30 });
    expect(p.xp).toBe(110);
  });
  it('une journée parfaite (3 parties dont une victoire) valide les trois défis', () => {
    const games = [true, false, false].map((won, i) => ({ endedAt: NOW - i * 1000, won }));
    const p = computeProgression({ ...none, games });
    expect(p.breakdown.challenges).toBe(50);
    expect(p.achievements.find((a) => a.id === 'perfect_day')!.unlocked).toBe(true);
    expect(p.achievements.find((a) => a.id === 'challenges_5')!.value).toBe(3);
  });
  it('les jours consécutifs forment une série ; une journée sautée la coupe', () => {
    const games = [0, 1, 2, 4].map((d) => ({ endedAt: NOW - d * D, won: false }));
    const p = computeProgression({ ...none, games });
    expect(p.achievements.find((a) => a.id === 'streak_3')!.unlocked).toBe(true);
    expect(p.achievements.find((a) => a.id === 'streak_7')!.unlocked).toBe(false);
  });
  it('blackjack, Tableau et variantes comptent dans l’expérience et les hauts faits', () => {
    const p = computeProgression({ ...none, bjHands: 50, bjWins: 20, tbGames: 2, tbWins: 1, variants: 3, variantWins: 3 });
    expect(p.breakdown.games).toBe(50 + 20 + 30 + 25);
    const ok = (id: string) => p.achievements.find((a) => a.id === id)!.unlocked;
    expect(ok('bj_hands_50') && ok('tb_first') && ok('explorer_3') && ok('variant_wins_3')).toBe(true);
    expect(ok('bj_wins_50')).toBe(false);
  });
  it('les identifiants sont uniques', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('progression et classement général', () => {
  it('classe les joueurs à l’expérience et indique la position de chacun', async () => {
    const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { now: () => NOW, log: () => undefined });
    const ids: Record<string, string> = {};
    for (const n of ['Ana', 'Bea']) ids[n] = (await accounts.register({ nickname: n, email: `${n}@x.fr`, password: 'tapis-vert-42' })).account.id;
    const db = accounts['store'].db;
    for (let i = 0; i < 3; i++) {
      db.prepare('INSERT INTO games (id, ended_at, data) VALUES (?, ?, ?)').run(`g${i}`, NOW - i * 1000, '{}');
      for (const [who, won] of [['Ana', 1], ['Bea', 0]] as const) {
        db.prepare('INSERT INTO user_games (user_id, game_id, player_id, net_cents, won, ended_at) VALUES (?, ?, ?, 0, ?, ?)').run(ids[who]!, `g${i}`, 'p', won, NOW - i * 1000);
        logRank(db, { userId: ids[who]!, game: 'poker', ref: `g${i}`, endedAt: NOW - i * 1000, played: 1, won });
      }
    }
    const ana = accounts.progression(ids.Ana!);
    const bea = accounts.progression(ids.Bea!);
    expect(ana.xp).toBeGreaterThan(bea.xp);
    expect([ana.rank, bea.rank, ana.players]).toEqual([1, 2, 2]);
    const board = accounts.xpRanking(ids.Bea!);
    expect(board.rows.map((r) => [r.nickname, r.you])).toEqual([['Ana', false], ['Bea', true]]);
    expect(board.rows[0]!.league).toBe('silver'); // 350 points : au-dessus du seuil d'Argent (300)
    expect(board.mine).toBeNull();
  });
});
