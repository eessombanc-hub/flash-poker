import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { GameManager } from '../src/game/gameManager';
import { RuleError, VARIANT_IDS } from '../src/variants';
import { names } from './helpers';

const solo = (variant: (typeof VARIANT_IDS)[number], n = 3, extra = {}) => new GameManager({ players: names(n), targetPoints: 2, stakeChips: 0, fixedVariant: variant, ...extra }, new SeededRng(5));

describe('Entraînement solo : variante imposée', () => {
  for (const v of VARIANT_IDS) {
    it(`${v} : chaque manche démarre sans étape de choix`, () => {
      const g = solo(v);
      expect(g.availableVariants()).toEqual([v]);
      g.apply({ type: 'TIMEOUT' }); // première manche
      let seen = 0;
      for (let i = 0; i < 400 && g.phase() !== 'GAME_OVER'; i++) {
        expect(g.phase()).toBe('ROUND');
        expect(g.currentRound!.variant).toBe(v);
        const no = g.roundNo;
        g.apply({ type: 'TIMEOUT' });
        if (g.roundNo !== no) seen++;
      }
      expect(seen).toBeGreaterThanOrEqual(1);
    });
  }

  it('6-3 : tétines et paris extérieurs imposés se retrouvent à chaque manche', () => {
    const g = solo('V6_3', 3, { fixedOptions: { teats: 2, sideBets: true } });
    const events = g.apply({ type: 'TIMEOUT' });
    const chosen = events.find((e) => e.type === 'VARIANT_CHOSEN') as unknown as { data: { teats?: number; sideBets?: boolean } } | undefined;
    expect(chosen?.data.teats).toBe(2);
    expect(chosen?.data.sideBets).toBe(true);
  });

  it('la variante imposée survit à une sauvegarde / restauration', () => {
    const g = solo('MORPION');
    g.apply({ type: 'TIMEOUT' });
    const r = GameManager.restore(JSON.parse(JSON.stringify(g.snapshot())), new SeededRng(9));
    expect(r.availableVariants()).toEqual(['MORPION']);
  });

  it('refuse une variante injouable à cette taille de table', () => {
    expect(() => solo('LE10', 6)).toThrow(RuleError);
    expect(() => solo('CLOSED_2', 6)).toThrow(RuleError);
    expect(() => solo('LE10', 5)).not.toThrow();
  });
});
