import { describe, expect, it } from 'vitest';
import { variantProgress, type RoundFact } from '../src/accounts/progress';

const mk = (pattern: string, players = 2): RoundFact[] => [...pattern].map((c) => ({ won: c === 'W', players }));

describe('progression par variante', () => {
  it('aucune manche : débutant, aucun rendement', () => {
    const p = variantProgress([]);
    expect(p).toMatchObject({ level: 'beginner', skill: null, streak: 0, bestStreak: 0, recent: [], progress: 0 });
    expect(p.next).toMatchObject({ level: 'initiate', rounds: 5 });
  });

  it('le volume seul donne « initié », jamais plus', () => {
    const p = variantProgress(mk('N'.repeat(60)));
    expect(p.level).toBe('initiate');
    expect(p.skill).toBe(0);
  });

  it('confirmé : 15 manches ET au moins le rendement du hasard', () => {
    // 15 manches à 2 joueurs : 7,5 victoires attendues ; 8 victoires = rendement 1,07
    expect(variantProgress(mk('WWWWWWWWNNNNNNN')).level).toBe('confirmed');
    // 7 victoires = 0,93 : sous le hasard, on reste initié
    expect(variantProgress(mk('WWWWWWWNNNNNNNN')).level).toBe('initiate');
  });

  it('l’attendu dépend du nombre de joueurs : gagner à 6 vaut plus qu’à 2', () => {
    const six = variantProgress(mk('WNNNNNNNNNNNNNW', 6)); // 2 victoires sur 15 manches à 6
    expect(six.expectedWins).toBe(2.5);
    expect(six.skill).toBe(0.8);
    const sixGood = variantProgress(mk('WWWNNNNNNNNNNNN', 6)); // 3 victoires : 1,2
    expect(sixGood.level).toBe('confirmed');
  });

  it('expert et maître exigent volume et rendement', () => {
    expect(variantProgress(mk('W'.repeat(25) + 'N'.repeat(15))).level).toBe('expert'); // 40 manches, 25/20 = 1,25
    expect(variantProgress(mk('W'.repeat(70) + 'N'.repeat(30))).level).toBe('master'); // 100 manches, 70/50 = 1,4
    expect(variantProgress(mk('W'.repeat(62) + 'N'.repeat(38))).level).toBe('expert'); // 100 manches mais 1,24 : pas assez pour maître
    expect(variantProgress(mk('W'.repeat(55) + 'N'.repeat(45))).level).toBe('confirmed'); // 1,10 : pas assez pour expert
  });

  it('séries et forme récente', () => {
    const p = variantProgress(mk('WWWNWWNWWWWW'));
    expect(p.streak).toBe(5);
    expect(p.bestStreak).toBe(5);
    expect(p.recent).toHaveLength(10);
    expect(p.recent.at(-1)).toBe('W');
    expect(variantProgress(mk('WWWWN')).streak).toBe(0);
  });

  it('avancement vers le palier suivant : le plus lent des deux critères', () => {
    // 10 manches sur 15 requises = 0,67 ; rendement 1,2 > 1 : avancement limité par le volume
    const p = variantProgress(mk('WWWWWWNNNN'));
    expect(p.level).toBe('initiate');
    expect(p.progress).toBe(0.67);
  });
});
