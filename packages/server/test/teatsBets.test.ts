import { describe, expect, it } from 'vitest';
import { SeededRng } from '@poker/engine';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { InMemoryRoomStore } from '../src/store';
import { expectErr, makeManager } from './helpers';

const CFG = { name: 'Entraînement', maxPlayers: 6, targetPoints: 2, stakeChips: 200, nickname: 'Emeric', cpu: 2 };
const FAST = { bots: { minDelayMs: 0, maxDelayMs: 0 } };

/** Une table d'entraînement où l'hôte choisit la variante (les positions sont tirées au sort). */
function hostChooses(m: ReturnType<typeof makeManager>['m']) {
  for (let i = 0; i < 60; i++) {
    const r = m.createRoom({ ...CFG, nickname: `H${i}` });
    const v = m.view(r.code, r.playerId);
    if (v.game!.chooser === r.playerId) return r;
  }
  throw new Error('aucune table où l\'hôte choisit');
}

describe('6-3 : tétines et paris extérieurs par le serveur', () => {
  it('le joueur qui choisit le 6-3 fixe les tétines et les paris ; la phase de paris s\'ouvre', () => {
    const { m } = makeManager({}, FAST);
    const r = hostChooses(m);
    m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'V6_3', teats: 2, sideBets: true });
    const v = m.view(r.code, r.playerId);
    expect(v.game!.round!.phase).toBe('BETS');
    expect((v.game!.round!.info as { teats: number }).teats).toBe(2);
    expect((v.game!.round!.info as { budget: number }).budget).toBe(800);
    expect(v.game!.wallets[r.playerId]).toBe(800);
  });

  it('refuse des options invalides (hors 6-3, trop de tétines, pari mal formé)', () => {
    const { m } = makeManager({}, FAST);
    const r = hostChooses(m);
    expectErr(() => m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'V6_3', teats: 3 }), 'BAD_REQUEST');
    expectErr(() => m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'AVIATION', teats: 1 }), 'RULE');
    m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'V6_3', sideBets: true });
    expectErr(() => m.command(r.code, r.playerId, { type: 'BET', bets: [{ line: 4, amount: 10 }] }), 'BAD_REQUEST');
    expectErr(() => m.command(r.code, r.playerId, { type: 'BET', bets: [{ line: 1, amount: 0.5 }] }), 'BAD_REQUEST');
    expectErr(() => m.command(r.code, r.playerId, { type: 'BET', bets: [{ line: 1, amount: 801 }] }), 'RULE', 'INSUFFICIENT_CHIPS');
  });

  it('les CPU valident « aucun pari » : la partie avance, les cartes sont distribuées, un pari seul n\'est pas engagé', () => {
    const scheduler = new ManualScheduler();
    const { m } = makeManager({}, { scheduler, ...FAST });
    const r = hostChooses(m);
    m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'V6_3', teats: 1, sideBets: true });
    m.command(r.code, r.playerId, { type: 'BET', bets: [{ line: 2, amount: 100 }] });
    m.command(r.code, r.playerId, { type: 'VALIDATE' });
    scheduler.advance(2000);
    const v = m.view(r.code, r.playerId);
    expect(v.game!.round!.phase).toBe('LINE_1');
    expect((v.game!.round!.info as { pools: unknown[] }).pools).toEqual([]);
    expect(v.game!.round!.cards.board).toHaveLength(16);
    expect(v.game!.wallets[r.playerId]).toBe(800); // pari non accordé : mise jamais engagée
  });

  it('sauvegarde et reprise : une manche avec tétines et paris est retrouvée à l\'identique', () => {
    const { m } = makeManager({}, FAST);
    const r = hostChooses(m);
    m.command(r.code, r.playerId, { type: 'CHOOSE_VARIANT', variant: 'V6_3', teats: 2, sideBets: true });
    m.command(r.code, r.playerId, { type: 'BET', bets: [{ line: 1, amount: 50 }] });
    const snap = JSON.parse(JSON.stringify(m.snapshotRoom(r.code)));
    const before = JSON.stringify(m.view(r.code, r.playerId).game);
    const m2 = new RoomManager({ rng: new SeededRng(9), scheduler: new ManualScheduler(), store: new InMemoryRoomStore(), bots: { minDelayMs: 0, maxDelayMs: 0 } });
    m2.restoreRoom(snap);
    expect(JSON.stringify(m2.view(r.code, r.playerId).game)).toBe(before);
  });
});
