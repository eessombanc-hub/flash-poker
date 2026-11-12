import { describe, expect, it } from 'vitest';
import { closedWin, expectErr, makeManager, setup } from './helpers';

/** Partie de deux joueurs terminée en une manche (objectif 1 point). */
const finished = (cfg: Record<string, unknown> = {}) => {
  const env = setup(2, { 1: closedWin(1, 0) }, { targetPoints: 1, stakeChips: 100, name: 'Vendredi soir', maxPlayers: 4, private: true, ...cfg });
  env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
  env.act(0, { type: 'SELECT', cards: [] });
  env.act(0, { type: 'VALIDATE' });
  env.act(1, { type: 'SELECT', cards: [] });
  env.act(1, { type: 'VALIDATE' });
  expect(env.m.view(env.code, env.host.playerId).status).toBe('FINISHED');
  return env;
};

describe('revanche', () => {
  it('le premier joueur ouvre une table aux mêmes réglages et en devient l’hôte', () => {
    const env = finished();
    const other = env.order.find((id) => id !== env.host.playerId)!;
    const made = env.m.rematch(env.code, env.host.playerId);
    const v = env.m.view(made.code, made.playerId);
    expect(made.code).not.toBe(env.code);
    expect(v).toMatchObject({ status: 'WAITING', name: 'Vendredi soir', you: { role: 'HOST' }, config: { maxPlayers: 4, targetPoints: 1, stakeChips: 100, private: true } });
    expect(env.m.view(env.code, other).rematch).toBe(made.code); // les autres voient la revanche
  });
  it('les autres joueurs rejoignent la même table, sans en créer une seconde', () => {
    const env = finished();
    const other = env.order.find((id) => id !== env.host.playerId)!;
    const a = env.m.rematch(env.code, env.host.playerId);
    const b = env.m.rematch(env.code, other);
    expect(b.code).toBe(a.code);
    expect(env.m.view(a.code, a.playerId).players.map((p) => p.nickname).sort()).toEqual(['Host', 'J1']);
  });
  it('la variante imposée est conservée', () => {
    const { m, scheduler } = makeManager();
    const host = m.createRoom({ name: 'Table', maxPlayers: 2, targetPoints: 1, stakeChips: 0, nickname: 'Host', variant: 'CLOSED_1' });
    m.joinRoom(host.code, { nickname: 'J1' });
    m.startGame(host.code, host.playerId);
    for (let i = 0; i < 400 && m.view(host.code, host.playerId).status !== 'FINISHED'; i++) scheduler.advance(61_000);
    expect(m.view(host.code, host.playerId).status).toBe('FINISHED');
    const made = m.rematch(host.code, host.playerId);
    expect(m.view(made.code, made.playerId).config.variant).toBe('CLOSED_1');
  });
  it('refus : partie non terminée, étranger à la partie, entraînement contre le CPU', () => {
    const running = setup(2, {}, {});
    expectErr(() => running.m.rematch(running.code, running.host.playerId), 'WRONG_STATE');
    const env = finished();
    expectErr(() => env.m.rematch(env.code, 'inconnu'), 'FORBIDDEN');
    const { m } = makeManager();
    const t = m.createRoom({ name: 'Entraînement', maxPlayers: 4, targetPoints: 1, stakeChips: 0, nickname: 'Emeric', cpu: 2 });
    expectErr(() => m.rematch(t.code, t.playerId), 'WRONG_STATE');
  });
});
