import { describe, expect, it } from 'vitest';
import type { SocialMessage } from '../src/protocol';
import { expectErr, makeManager, setup } from './helpers';

const socialOf = (out: { playerId: string; message: { type: string } }[], to: string) =>
  out.filter((o) => o.playerId === to && o.message.type === 'social').map((o) => o.message as unknown as SocialMessage);

describe('chat et objets', () => {
  it('un message est nettoyé, borné, et diffusé à tous les joueurs sans toucher à la version de la partie', () => {
    const env = setup(3);
    const [a, b, c] = env.order as [string, string, string];
    const before = env.m.view(env.code, a).version;
    env.m.social(env.code, a, { kind: 'chat', text: '  Bien\u0000 joué‮   à tous  ' });
    for (const id of [a, b, c]) expect(socialOf(env.out, id).map((m) => [m.from, m.kind, m.text])).toEqual([[a, 'chat', 'Bien joué à tous']]);
    expect(env.m.view(env.code, a).version).toBe(before);
  });

  it('refuse un texte vide, trop long, ou un objet inconnu ; l’expéditeur ne vient jamais du message', () => {
    const env = setup(2);
    const [a, b] = env.order as [string, string];
    expectErr(() => env.m.social(env.code, a, { kind: 'chat', text: '   ' }), 'BAD_REQUEST');
    expectErr(() => env.m.social(env.code, a, { kind: 'chat', text: 'x'.repeat(141) }), 'BAD_REQUEST');
    expectErr(() => env.m.social(env.code, a, { kind: 'throw', item: 'grenade', to: b }), 'BAD_REQUEST');
    env.m.social(env.code, a, { kind: 'chat', text: 'salut', from: b });
    expect(socialOf(env.out, b)[0]!.from).toBe(a);
  });

  it('un objet vise un autre joueur de la salle, jamais soi-même ni un inconnu', () => {
    const env = setup(3);
    const [a, b] = env.order as [string, string];
    expectErr(() => env.m.social(env.code, a, { kind: 'throw', item: 'tomato', to: a }), 'BAD_REQUEST');
    expectErr(() => env.m.social(env.code, a, { kind: 'throw', item: 'tomato', to: 'inconnu' }), 'FORBIDDEN');
    env.m.social(env.code, a, { kind: 'throw', item: 'tomato', to: b });
    const got = socialOf(env.out, env.order[2]!);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: 'throw', item: 'tomato', from: a, to: b });
  });

  it('plafonds anti-spam : 5 messages par 10 s, un objet toutes les 2 s, 15 par minute', () => {
    const env = setup(2);
    const [a, b] = env.order as [string, string];
    for (let i = 0; i < 5; i++) env.m.social(env.code, a, { kind: 'chat', text: `m${i}` });
    expectErr(() => env.m.social(env.code, a, { kind: 'chat', text: 'trop' }), 'RATE_LIMITED');
    env.scheduler.advance(10_001);
    env.m.social(env.code, a, { kind: 'chat', text: 'de nouveau' });

    env.m.social(env.code, b, { kind: 'throw', item: 'pie', to: a });
    expectErr(() => env.m.social(env.code, b, { kind: 'throw', item: 'pie', to: a }), 'RATE_LIMITED');
    for (let i = 0; i < 14; i++) {
      env.scheduler.advance(2_100);
      env.m.social(env.code, b, { kind: 'throw', item: 'kiss', to: a });
    }
    env.scheduler.advance(2_100);
    expectErr(() => env.m.social(env.code, b, { kind: 'throw', item: 'kiss', to: a }), 'RATE_LIMITED');
  });

  it('un compte réduit au silence ne peut plus écrire à la table, mais peut toujours lancer des objets', () => {
    let muted = true;
    const m = makeManager({}, { accounts: { isReservedNickname: () => false, onGameFinished: () => undefined, muteLeft: (id) => (id === 'acc1' && muted ? 600 : 0) } });
    const host = m.m.createRoom({ name: 'T', maxPlayers: 6, targetPoints: 5, stakeChips: 0, nickname: 'Ana' }, { id: 'acc1', nickname: 'Ana', avatar: null });
    const j = m.m.joinRoom(host.code, { nickname: 'Bob' });
    for (const id of [host.playerId, j.playerId]) m.m.connect(host.code, id);
    m.m.startGame(host.code, host.playerId);
    expectErr(() => m.m.social(host.code, host.playerId, { kind: 'chat', text: 'bonjour' }), 'FORBIDDEN');
    m.m.social(host.code, host.playerId, { kind: 'throw', item: 'tomato', to: j.playerId });
    m.m.social(host.code, j.playerId, { kind: 'chat', text: 'moi je peux' });
    muted = false;
    m.m.social(host.code, host.playerId, { kind: 'chat', text: 'bonjour' });
  });
});
