import { describe, expect, it } from 'vitest';
import { closedWin, expectErr, makeManager, setup } from './helpers';

describe('spectateurs', () => {
  it('regarde une partie publique en cours, sans voir aucune carte cachée', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    const s = env.m.spectate(env.code, { nickname: 'Curieux' });
    env.m.connect(env.code, s.spectatorId);
    const view = env.m.view(env.code, s.spectatorId);
    expect(view.you.role).toBe('SPECTATOR');
    expect(view.players).toHaveLength(3);
    expect(view.players.every((p) => p.score !== null)).toBe(true);
    expect(view.config.targetPoints).toBe(5);
    // aucune main privée : le moteur n'a pas de « moi » pour un spectateur
    const txt = JSON.stringify(view.game?.round);
    const hidden = env.m._debug(env.code).game!.view(env.order[0]!).round;
    expect(JSON.stringify(hidden)).not.toBe(txt);
    const mine = JSON.stringify(env.m.view(env.code, env.order[0]!).game?.round);
    expect(mine).not.toBe(txt);
  });

  it('reçoit chaque mise à jour, et son arrivée est visible des joueurs', () => {
    const env = setup(2, { 1: closedWin(1, 0) });
    const s = env.m.spectate(env.code, { nickname: 'Curieux' });
    env.m.connect(env.code, s.spectatorId);
    expect(env.updates(s.spectatorId).length).toBeGreaterThan(0);
    const last = env.updates(env.order[0]!).at(-1)!;
    expect(last.view.spectators.map((x) => x.nickname)).toEqual(['Curieux']);
    const before = env.updates(s.spectatorId).length;
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    expect(env.updates(s.spectatorId).length).toBeGreaterThan(before);
  });

  it('ne peut ni jouer, ni démarrer, ni lancer d’objet, mais peut écrire dans le chat', () => {
    const env = setup(2, { 1: closedWin(1, 0) });
    const s = env.m.spectate(env.code, { nickname: 'Curieux' });
    env.m.connect(env.code, s.spectatorId);
    expectErr(() => env.m.command(env.code, s.spectatorId, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' }), 'FORBIDDEN');
    expectErr(() => env.m.excludePlayer(env.code, s.spectatorId, env.order[0]!), 'FORBIDDEN');
    expectErr(() => env.m.social(env.code, s.spectatorId, { kind: 'throw', item: 'tomato', to: env.order[0]! }), 'FORBIDDEN');
    env.m.social(env.code, s.spectatorId, { kind: 'chat', text: 'Bonne chance !' });
    const got = env.out.filter((o) => o.playerId === env.order[0] && o.message.type === 'social');
    expect(got).toHaveLength(1);
    // les joueurs écrivent aussi aux spectateurs
    env.m.social(env.code, env.order[1]!, { kind: 'chat', text: 'Merci' });
    expect(env.out.filter((o) => o.playerId === s.spectatorId && o.message.type === 'social')).toHaveLength(2);
  });

  it('le jeton de spectateur authentifie, et un mauvais jeton est refusé', () => {
    const env = setup(2);
    const s = env.m.spectate(env.code, { nickname: 'Curieux' });
    expect(env.m.authenticate(env.code, s.token)).toBe(s.spectatorId);
    expectErr(() => env.m.authenticate(env.code, 'x'.repeat(24)), 'UNAUTHORIZED');
  });

  it('refuse une salle privée, une partie non démarrée et un pseudo déjà pris', () => {
    const priv = setup(2, {}, { private: true });
    expectErr(() => priv.m.spectate(priv.code, { nickname: 'Curieux' }), 'FORBIDDEN');
    const { m } = makeManager();
    const r = m.createRoom({ name: 'T', maxPlayers: 3, targetPoints: 5, stakeChips: 0, nickname: 'H' });
    expectErr(() => m.spectate(r.code, { nickname: 'Curieux' }), 'WRONG_STATE');
    const env = setup(2);
    expectErr(() => env.m.spectate(env.code, { nickname: 'Host' }), 'NICKNAME_TAKEN');
  });

  it('plafonne le nombre de spectateurs', () => {
    const env = setup(2);
    for (let i = 0; i < 30; i++) env.m.spectate(env.code, { nickname: `S${i}` });
    expectErr(() => env.m.spectate(env.code, { nickname: 'Trop' }), 'ROOM_FULL');
  });

  it('la liste publique propose les parties en cours, même complètes, avec le nombre de spectateurs', () => {
    const env = setup(2, {}, { maxPlayers: 2 });
    let row = env.m.listOpen().find((r) => r.code === env.code)!;
    expect(row).toMatchObject({ status: 'RUNNING', seatsLeft: 0, spectators: 0 });
    const s = env.m.spectate(env.code, { nickname: 'Curieux' });
    env.m.connect(env.code, s.spectatorId);
    row = env.m.listOpen().find((r) => r.code === env.code)!;
    expect(row.spectators).toBe(1);
    env.m.disconnect(env.code, s.spectatorId);
    expect(env.m.listOpen().find((r) => r.code === env.code)!.spectators).toBe(0);
  });
});
