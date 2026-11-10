import { describe, expect, it } from 'vitest';
import { tbClampRating, tbDailyChallenges, tbDayKey, tbEloDelta, tbLeagueOf, TB_CHALLENGES, TB_CPU_RATING, TB_LEAGUES, TB_START_RATING, type TbGameFacts } from '../src';

describe('Tableau : ligues', () => {
  it('dix ligues, seuils croissants, départ en ligue 1', () => {
    expect(TB_LEAGUES).toHaveLength(10);
    expect(TB_LEAGUES.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < TB_LEAGUES.length; i++) expect(TB_LEAGUES[i]!.min).toBeGreaterThan(TB_LEAGUES[i - 1]!.min);
    expect(tbLeagueOf(TB_START_RATING).league.id).toBe(1);
  });
  it('ligue, avancement et points restants', () => {
    expect(tbLeagueOf(899).league.name).toBe('Débutant');
    expect(tbLeagueOf(900).league.name).toBe('Apprenti');
    const s = tbLeagueOf(950);
    expect(s.next?.name).toBe('Amateur');
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.toNext).toBe(50);
    const top = tbLeagueOf(2500);
    expect(top.league.id).toBe(10);
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
    expect(top.toNext).toBe(0);
  });
});

describe('Tableau : classement Elo', () => {
  it('gain et perte symétriques à force égale, nuls = 0', () => {
    expect(tbEloDelta(1000, 1000, 'win', 20)).toBe(12);
    expect(tbEloDelta(1000, 1000, 'loss', 20)).toBe(-12);
    expect(tbEloDelta(1000, 1000, 'draw', 20)).toBe(0);
  });
  it('battre plus fort rapporte beaucoup, battre plus faible presque rien', () => {
    expect(tbEloDelta(800, TB_CPU_RATING.expert, 'win', 20)).toBeGreaterThan(20);
    expect(tbEloDelta(1600, TB_CPU_RATING.beginner, 'win', 20)).toBeLessThanOrEqual(1);
    expect(tbEloDelta(1600, TB_CPU_RATING.beginner, 'loss', 20)).toBeLessThan(-20);
  });
  it('les premières parties classées pèsent plus', () => {
    expect(Math.abs(tbEloDelta(1000, 1000, 'win', 0))).toBeGreaterThan(Math.abs(tbEloDelta(1000, 1000, 'win', 30)));
  });
  it('le classement ne descend jamais sous zéro', () => {
    expect(tbClampRating(-15)).toBe(0);
    expect(tbClampRating(812.6)).toBe(813);
  });
});

describe('Tableau : défis du jour', () => {
  it('trois défis distincts, identiques un même jour, variables d’un jour à l’autre', () => {
    const a = tbDailyChallenges('2026-11-10');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(tbDailyChallenges('2026-11-10').map((c) => c.id)).toEqual(a.map((c) => c.id));
    const days = new Set(Array.from({ length: 20 }, (_, i) => tbDailyChallenges(`2026-12-${String(i + 1).padStart(2, '0')}`).map((c) => c.id).join()));
    expect(days.size).toBeGreaterThan(5);
  });
  it('chaque défi réagit aux bons faits', () => {
    const base: TbGameFacts = { mode: 'training', variant: 'classic', outcome: 'loss', columnsWon: 0, columnsPlayed: 5, straightFlushWin: false, straightFlushMade: false, opponentLevel: 'beginner', forfeit: false };
    const by = (id: string) => TB_CHALLENGES.find((c) => c.id === id)!;
    expect(by('play2').gain(base)).toBe(1);
    expect(by('win1').gain(base)).toBe(0);
    const won = { ...base, outcome: 'win' as const, columnsWon: 4, mode: 'ranked' as const, opponentLevel: 'expert' as const };
    expect(by('win1').gain(won)).toBe(1);
    expect(by('cols4').gain(won)).toBe(1);
    expect(by('cols8').gain(won)).toBe(4);
    expect(by('rankedWin').gain(won)).toBe(1);
    expect(by('beatExpert').gain(won)).toBe(1);
    expect(by('friend').gain({ ...base, mode: 'friendly' })).toBe(1);
    expect(by('sf').gain({ ...base, straightFlushMade: true })).toBe(1);
    expect(by('win1').gain({ ...won, forfeit: true })).toBe(0); // un forfait ne compte jamais comme une victoire
  });
  it('le jour civil suit l’heure de Paris', () => {
    expect(tbDayKey(Date.UTC(2026, 10, 10, 22, 30))).toBe('2026-11-10');
    expect(tbDayKey(Date.UTC(2026, 10, 10, 23, 30))).toBe('2026-11-11');
  });
});
