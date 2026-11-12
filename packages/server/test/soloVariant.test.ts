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
  it('refus : variante inconnue ou injouable à 6', () => {
    const m = manager();
    expect(() => m.createRoom({ ...CFG, variant: 'POKER' as never })).toThrow();
    expect(() => m.createRoom({ ...CFG, cpu: 5, variant: 'LE10' })).toThrow();
  });
  it('sans variante : comportement inchangé (choix de variante)', () => {
    const m = manager();
    const r = m.createRoom(CFG);
    const v = m.view(r.code, r.playerId);
    expect(v.game?.phase).toBe('VARIANT_SELECTION');
  });
});

describe('Table entre amis : variante imposée', () => {
  const HUMANS = { name: 'Vendredi soir', maxPlayers: 4, targetPoints: 2, stakeChips: 0, nickname: 'Emeric' };
  it('la variante figure dans la salle d’attente et dans la liste publique', () => {
    const m = manager();
    const r = m.createRoom({ ...HUMANS, variant: 'MORPION' });
    const v = m.view(r.code, r.playerId);
    expect(v.status).toBe('WAITING');
    expect(v.config.variant).toBe('MORPION');
    expect(m.listOpen()[0]).toMatchObject({ code: r.code, variant: 'MORPION' });
  });
  it('au départ, toutes les manches se jouent dans cette variante, sans étape de choix', () => {
    const m = manager();
    const r = m.createRoom({ ...HUMANS, variant: 'AVIATION' });
    const j = m.joinRoom(r.code, { nickname: 'Karim' });
    m.startGame(r.code, r.playerId);
    const view = m.view(r.code, j.playerId);
    expect(view.game?.phase).toBe('ROUND');
    expect(view.game?.round?.variant).toBe('AVIATION');
  });
  it('6-3 : tétines et paris extérieurs conservés dans la configuration', () => {
    const m = manager();
    const r = m.createRoom({ ...HUMANS, variant: 'V6_3', teats: 2, sideBets: true });
    expect(m.view(r.code, r.playerId).config).toMatchObject({ variant: 'V6_3', teats: 2, sideBets: true });
  });
  it('refus : une variante injouable à 6 sur une table de 6, mais acceptée jusqu’à 5', () => {
    const m = manager();
    expect(() => m.createRoom({ ...HUMANS, maxPlayers: 6, variant: 'LE10' })).toThrow();
    expect(() => m.createRoom({ ...HUMANS, maxPlayers: 5, variant: 'LE10' })).not.toThrow();
  });
  it('sans variante : la salle n’en annonce aucune et le choix reste à la table', () => {
    const m = manager();
    const r = m.createRoom(HUMANS);
    expect(m.view(r.code, r.playerId).config.variant).toBeUndefined();
    const j = m.joinRoom(r.code, { nickname: 'Karim' });
    m.startGame(r.code, r.playerId);
    expect(m.view(r.code, j.playerId).game?.phase).toBe('VARIANT_SELECTION');
  });
});
