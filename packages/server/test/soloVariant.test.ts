import { describe, expect, it } from 'vitest';
import { SeededRng } from '@poker/engine';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const CFG = { name: 'Entraînement', maxPlayers: 6, targetPoints: 2, stakeChips: 0, nickname: 'Emeric', cpu: 2 };
const manager = () => new RoomManager({ rng: new SeededRng(4), scheduler: new ManualScheduler() });

describe('Entraînement : variante imposée', () => {
  it('la partie démarre directement dans la variante choisie', () => {
    const m = manager();
    const r = m.createRoom({ ...CFG, variant: 'MORPION' });
    const view = m.view(r.code, r.playerId);
    expect(view.status).toBe('RUNNING');
    expect(view.game?.phase).toBe('ROUND');
    expect(view.game?.round?.variant).toBe('MORPION');
  });
  it('6-3 : tétines et paris extérieurs transmis', () => {
    const m = manager();
    const r = m.createRoom({ ...CFG, variant: 'V6_3', teats: 2, sideBets: true });
    expect(m.view(r.code, r.playerId).game?.round?.variant).toBe('V6_3');
  });
  it('refus : variante inconnue, injouable à 6, ou hors entraînement', () => {
    const m = manager();
    expect(() => m.createRoom({ ...CFG, variant: 'POKER' as never })).toThrow();
    expect(() => m.createRoom({ ...CFG, cpu: 5, variant: 'LE10' })).toThrow();
    const { cpu: _c, ...humans } = CFG;
    expect(() => m.createRoom({ ...humans, variant: 'MORPION' })).toThrow();
  });
  it('sans variante : comportement inchangé (choix de variante)', () => {
    const m = manager();
    const r = m.createRoom(CFG);
    const v = m.view(r.code, r.playerId);
    expect(v.game?.phase).toBe('VARIANT_SELECTION');
  });
});
