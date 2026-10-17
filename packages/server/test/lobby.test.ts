import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';
import { closedWin, expectErr, makeManager, setup } from './helpers';

const CFG = { name: 'Table', maxPlayers: 4, targetPoints: 5, stakeCents: 2000, nickname: 'Host' };

describe('création de room', () => {
  it('code POKER-XXXX sans caractères ambigus ; l\'hôte est créé ; le lobby s\'affiche', () => {
    const { m } = makeManager();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = m.createRoom({ ...CFG, nickname: `H${i}` });
      expect(r.code).toMatch(/^POKER-[2-9ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/); // ni 0, O, 1, I
      codes.add(r.code);
    }
    expect(codes.size).toBe(50); // codes uniques
    const r = m.createRoom(CFG);
    const v = m.view(r.code, r.playerId);
    expect(v).toMatchObject({
      status: 'WAITING',
      name: 'Table',
      hostId: r.playerId,
      seatsLeft: 3,
      you: { role: 'HOST' },
      config: { maxPlayers: 4, targetPoints: 5, stakeCents: 2000, potCents: 2000 },
      game: null,
      deadline: null,
    });
    expect(v.players).toHaveLength(1);
  });

  it('paramètres validés : objectif 1 à 5, mise 0 à 10 000 €, 2 à 6 joueurs, pseudo et avatar sûrs', () => {
    const { m } = makeManager();
    const bad = (patch: Record<string, unknown>) => expectErr(() => m.createRoom({ ...CFG, ...patch }), 'BAD_REQUEST');
    bad({ targetPoints: 6 });
    bad({ targetPoints: 0 });
    bad({ targetPoints: 2.5 });
    bad({ stakeCents: 1_000_001 });
    bad({ stakeCents: -1 });
    bad({ maxPlayers: 1 });
    bad({ maxPlayers: 7 });
    bad({ name: '   ' });
    bad({ nickname: '' });
    bad({ nickname: 'x'.repeat(21) });
    bad({ nickname: '<script>alert(1)</script>' });
    bad({ avatar: 'https://evil.example/x.png' });
    bad({ maxPlayers: '4' });
    expectErr(() => m.createRoom(null), 'BAD_REQUEST');
    expect(() => m.createRoom({ ...CFG, targetPoints: 5, stakeCents: 1_000_000, maxPlayers: 6, avatar: 'lion_2' })).not.toThrow();
    expect(() => m.createRoom({ ...CFG, targetPoints: 1, stakeCents: 0, maxPlayers: 2, nickname: '  Élodie-Rose  ' })).not.toThrow();
  });
});

describe('rejoindre une room', () => {
  it('code insensible à la casse ; pseudo unique ; places limitées ; code inconnu', () => {
    const { m } = makeManager();
    const r = m.createRoom({ ...CFG, maxPlayers: 3 });
    const a = m.joinRoom(` ${r.code.toLowerCase()} `, { nickname: 'Alice' });
    expect(a.playerId).toBeTruthy();
    expectErr(() => m.joinRoom(r.code, { nickname: 'alice' }), 'NICKNAME_TAKEN');
    expectErr(() => m.joinRoom(r.code, { nickname: 'HOST' }), 'NICKNAME_TAKEN');
    m.joinRoom(r.code, { nickname: 'Bob' });
    expectErr(() => m.joinRoom(r.code, { nickname: 'Carl' }), 'ROOM_FULL');
    expectErr(() => m.joinRoom('POKER-ZZZZ', { nickname: 'X' }), 'ROOM_NOT_FOUND');
    expectErr(() => m.joinRoom(r.code, { nickname: '' }), 'BAD_REQUEST');
    expect(m.view(r.code, r.playerId).seatsLeft).toBe(0);
  });

  it('chaque arrivée est diffusée à tous avec la même version', () => {
    const { m, out } = makeManager();
    const h = m.createRoom(CFG);
    const a = m.joinRoom(h.code, { nickname: 'Alice' });
    const last = out.filter((o) => o.message.type === 'update').slice(-2);
    expect(last.map((o) => o.playerId).sort()).toEqual([h.playerId, a.playerId].sort());
    expect(new Set(last.map((o) => (o.message as { version: number }).version)).size).toBe(1);
  });

  it('quitter le lobby ; l\'hôte ne le quitte pas ; l\'hôte peut retirer un joueur (qui en est informé)', () => {
    const { m, out } = makeManager();
    const h = m.createRoom(CFG);
    const a = m.joinRoom(h.code, { nickname: 'Alice' });
    const b = m.joinRoom(h.code, { nickname: 'Bob' });
    m.leaveLobby(h.code, a.playerId);
    expect(m.view(h.code, h.playerId).players.map((p) => p.nickname)).toEqual(['Host', 'Bob']);
    expectErr(() => m.leaveLobby(h.code, h.playerId), 'FORBIDDEN');
    expectErr(() => m.excludePlayer(h.code, b.playerId, h.playerId), 'FORBIDDEN'); // non-hôte
    expectErr(() => m.excludePlayer(h.code, h.playerId, h.playerId), 'BAD_REQUEST'); // pas soi-même
    m.excludePlayer(h.code, h.playerId, b.playerId);
    expect(out.some((o) => o.playerId === b.playerId && o.message.type === 'kicked')).toBe(true);
    expectErr(() => m.view(h.code, b.playerId), 'FORBIDDEN');
    expectErr(() => m.authenticate(h.code, b.token), 'UNAUTHORIZED'); // son jeton ne vaut plus rien
    expect(m.view(h.code, h.playerId).seatsLeft).toBe(3);
  });
});

describe('démarrage et annulation', () => {
  it('l\'hôte démarre dès 2 joueurs ; positions tirées ; paramètres verrouillés', () => {
    const { m } = makeManager();
    const h = m.createRoom(CFG);
    expectErr(() => m.startGame(h.code, h.playerId), 'WRONG_STATE'); // seul
    const a = m.joinRoom(h.code, { nickname: 'Alice' });
    expectErr(() => m.startGame(h.code, a.playerId), 'FORBIDDEN'); // pas l'hôte
    m.startGame(h.code, h.playerId);
    const v = m.view(h.code, h.playerId);
    expect(v.status).toBe('RUNNING');
    expect(v.players.map((p) => p.position).sort()).toEqual(['UTG', 'UTG+1']);
    expect(v.game).toMatchObject({ phase: 'VARIANT_SELECTION', roundNo: 1, targetPoints: 5, maxPlayers: 4 });
    expectErr(() => m.startGame(h.code, h.playerId), 'WRONG_STATE');
    expectErr(() => m.cancelRoom(h.code, h.playerId), 'WRONG_STATE'); // plus annulable
  });

  it('annulation avant démarrage : la room est fermée, plus personne ne peut la rejoindre ni la démarrer', () => {
    const { m } = makeManager();
    const h = m.createRoom(CFG);
    const a = m.joinRoom(h.code, { nickname: 'Alice' });
    expectErr(() => m.cancelRoom(h.code, a.playerId), 'FORBIDDEN');
    m.cancelRoom(h.code, h.playerId);
    expect(m.view(h.code, a.playerId).status).toBe('CANCELLED');
    expectErr(() => m.joinRoom(h.code, { nickname: 'Bob' }), 'WRONG_STATE');
    expectErr(() => m.startGame(h.code, h.playerId), 'WRONG_STATE');
  });

  it('les positions sont stables pendant toute la partie', () => {
    const env = setup(3, { 1: closedWin(3, 0), 2: closedWin(3, 1) });
    const positions = () => env.m.view(env.code, env.host.playerId).players.map((p) => `${p.id}:${p.position}`).sort();
    const before = positions();
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    env.scheduler.advance(60_000);
    expect(positions()).toEqual(before);
  });
});

describe('limitation de débit', () => {
  it('fenêtre glissante : au plus N tentatives par clé, la fenêtre se libère avec le temps', () => {
    let t = 0;
    const rl = new RateLimiter(3, 1000, () => t);
    expect([rl.hit('ip1'), rl.hit('ip1'), rl.hit('ip1'), rl.hit('ip1')]).toEqual([true, true, true, false]);
    expect(rl.hit('ip2')).toBe(true); // autre clé indépendante
    t = 1001;
    expect(rl.hit('ip1')).toBe(true);
  });
});
