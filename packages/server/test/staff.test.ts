import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { FeedbackService } from '../src/accounts/feedback';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { StaffService } from '../src/accounts/staff';
import { buildServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

const ROOT = 'jeton-racine-de-test-1234';
const PWD = 'tapis-vert-42';

async function setup() {
  let t = 1_700_000_000_000;
  const now = () => t;
  const db = new AccountDb(':memory:');
  const mailer = new LogMailer(true, () => undefined);
  const accounts = new AccountService(db, mailer, { log: () => undefined, now });
  const staff = new StaffService(db, accounts, { adminToken: ROOT, now });
  const feedback = new FeedbackService(db, mailer);
  const server = await buildServer({ manager: new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: () => undefined, muteLeft: (id) => accounts.muteLeft(id) } }), accounts, feedback, staff, now, onError: () => undefined });
  cleanup.push(() => server.close());
  const api = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string | null, payload?: object) =>
    server.app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const user = async (nickname: string) => {
    const r = await accounts.register({ nickname, email: `${nickname.toLowerCase()}@x.fr`, password: PWD });
    return { id: r.account.id, token: r.token };
  };
  const setRole = (id: string, role: string) => db.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  return { api, user, setRole, accounts, staff, db, advance: (ms: number) => (t += ms), server };
}

describe('équipe du site : rôles et accès', () => {
  it('un joueur ordinaire est refusé, le jeton racine et les comptes de l’équipe sont admis', async () => {
    const { api, user, setRole } = await setup();
    const ana = await user('Ana');
    expect((await api('GET', '/staff/me', null)).statusCode).toBe(401);
    expect((await api('GET', '/staff/me', ana.token)).statusCode).toBe(403);
    setRole(ana.id, 'moderator');
    expect((await api('GET', '/staff/me', ana.token)).json()).toMatchObject({ role: 'moderator', root: false });
    expect((await api('GET', '/staff/me', ROOT)).json()).toMatchObject({ role: 'admin', root: true });
    expect((await api('GET', '/staff/me', 'jeton-faux-xxxxxxxxxxxx')).statusCode).toBe(401);
  });

  it('le propriétaire nomme les rôles ; un modérateur ne le peut pas ; /me expose le rôle', async () => {
    const { api, user, accounts } = await setup();
    const ana = await user('Ana');
    const bob = await user('Bob');
    expect((await api('POST', `/staff/users/${ana.id}/role`, ROOT, { role: 'moderator' })).statusCode).toBe(204);
    expect(accounts.userBySession(ana.token)?.role).toBe('moderator');
    expect((await api('POST', `/staff/users/${bob.id}/role`, ana.token, { role: 'moderator' })).statusCode).toBe(403);
    expect((await api('POST', `/staff/users/${bob.id}/role`, ROOT, { role: 'roi' })).statusCode).toBe(400);
    expect((await api('POST', `/staff/users/${ana.id}/role`, ROOT, { role: 'admin' })).statusCode).toBe(204);
    // un administrateur ne change ni son propre rôle ni celui d'un autre administrateur
    expect((await api('POST', `/staff/users/${ana.id}/role`, ana.token, { role: 'user' })).statusCode).toBe(403);
    const log = (await api('GET', '/staff/log', ROOT)).json().items as Array<{ action: string }>;
    expect(log.filter((l) => l.action === 'rôle')).toHaveLength(2);
  });

  it('la liste des joueurs cache les adresses e-mail aux modérateurs', async () => {
    const { api, user, setRole } = await setup();
    const mod = await user('Modo');
    setRole(mod.id, 'moderator');
    await user('Cleo');
    const asMod = (await api('GET', '/staff/users?q=cle', mod.token)).json().users[0];
    expect(asMod.nickname).toBe('Cleo');
    expect(asMod.email).toBeUndefined();
    const asRoot = (await api('GET', '/staff/users?q=cle', ROOT)).json().users[0];
    expect(asRoot.email).toBe('cleo@x.fr');
  });
});

describe('modération des chats', () => {
  it('le silence interdit d’écrire dans le salon, puis expire ; il peut être levé', async () => {
    const { api, user, setRole, advance, server } = await setup();
    const mod = await user('Modo');
    setRole(mod.id, 'moderator');
    const bob = await user('Bob');
    const say = (text: string) => server.app.inject({ method: 'POST', url: '/chat', payload: { text }, headers: { authorization: `Bearer ${bob.token}` } });
    expect((await say('Bonjour à tous')).statusCode).toBe(201);
    expect((await api('POST', `/staff/users/${bob.id}/mute`, mod.token, { minutes: 10, reason: 'insultes' })).statusCode).toBe(204);
    const refused = await say('Encore un message');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toMatch(/silence/);
    advance(11 * 60_000);
    expect((await say('Je reviens poliment')).statusCode).toBe(201);
    await api('POST', `/staff/users/${bob.id}/mute`, mod.token, { minutes: 60 });
    expect((await api('DELETE', `/staff/users/${bob.id}/mute`, mod.token)).statusCode).toBe(204);
    expect((await say('Libre de nouveau')).statusCode).toBe(201);
    expect((await api('POST', `/staff/users/${bob.id}/mute`, mod.token, { minutes: 0 })).statusCode).toBe(400);
  });

  it('un modérateur ne sanctionne ni un égal, ni un supérieur, ni lui-même', async () => {
    const { api, user, setRole } = await setup();
    const m1 = await user('Modo1');
    const m2 = await user('Modo2');
    const adm = await user('Chef');
    setRole(m1.id, 'moderator'); setRole(m2.id, 'moderator'); setRole(adm.id, 'admin');
    for (const id of [m2.id, adm.id, m1.id]) expect((await api('POST', `/staff/users/${id}/mute`, m1.token, { minutes: 5 })).statusCode).toBe(403);
    expect((await api('POST', `/staff/users/${m2.id}/mute`, adm.token, { minutes: 5 })).statusCode).toBe(204);
  });

  it('supprime un message du salon et le consigne ; la liste modération donne l’auteur, pas la liste publique', async () => {
    const { api, user, setRole, server } = await setup();
    const mod = await user('Modo');
    setRole(mod.id, 'moderator');
    const bob = await user('Bob');
    await server.app.inject({ method: 'POST', url: '/chat', payload: { text: 'message gênant' }, headers: { authorization: `Bearer ${bob.token}` } });
    const pub = (await server.app.inject({ method: 'GET', url: '/chat' })).json().messages[0];
    expect(pub.authorId).toBeUndefined();
    const staffList = (await api('GET', '/staff/chat', mod.token)).json().messages;
    expect(staffList[0].authorId).toBe(bob.id);
    expect((await api('DELETE', `/staff/chat/${pub.id}`, mod.token)).statusCode).toBe(204);
    expect((await server.app.inject({ method: 'GET', url: '/chat' })).json().messages).toHaveLength(0);
    expect((await api('DELETE', `/staff/chat/${pub.id}`, mod.token)).statusCode).toBe(404);
    expect((await api('GET', '/staff/log', ROOT)).json().items[0]).toMatchObject({ action: 'message supprimé', target: 'Bob' });
  });
});

describe('suspension, annonce, statistiques', () => {
  it('une suspension ferme les sessions et refuse la connexion jusqu’à sa levée ; réservée aux administrateurs', async () => {
    const { api, user, setRole, accounts } = await setup();
    const mod = await user('Modo');
    setRole(mod.id, 'moderator');
    const bob = await user('Bob');
    expect((await api('POST', `/staff/users/${bob.id}/ban`, mod.token, { reason: 'x' })).statusCode).toBe(403);
    expect((await api('POST', `/staff/users/${bob.id}/ban`, ROOT, { reason: 'triche' })).statusCode).toBe(204);
    expect(accounts.userBySession(bob.token)).toBeNull();
    await expect(accounts.login({ login: 'Bob', password: PWD })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await api('DELETE', `/staff/users/${bob.id}/ban`, ROOT)).statusCode).toBe(204);
    await expect(accounts.login({ login: 'Bob', password: PWD })).resolves.toBeTruthy();
  });

  it('annonce publique modifiable par les administrateurs seulement ; statistiques', async () => {
    const { api, user, setRole, server } = await setup();
    const mod = await user('Modo');
    setRole(mod.id, 'moderator');
    expect((await server.app.inject({ method: 'GET', url: '/announcement' })).json()).toEqual({ text: null });
    expect((await api('POST', '/staff/announcement', mod.token, { text: 'x' })).statusCode).toBe(403);
    expect((await api('POST', '/staff/announcement', ROOT, { text: '  Maintenance   ce soir à 22 h.  ' })).json()).toEqual({ text: 'Maintenance ce soir à 22 h.' });
    expect((await server.app.inject({ method: 'GET', url: '/announcement' })).json()).toEqual({ text: 'Maintenance ce soir à 22 h.' });
    await api('POST', '/staff/announcement', ROOT, { text: '' });
    expect((await server.app.inject({ method: 'GET', url: '/announcement' })).json()).toEqual({ text: null });
    expect((await api('GET', '/staff/stats', mod.token)).statusCode).toBe(403);
    expect((await api('GET', '/staff/stats', ROOT)).json()).toMatchObject({ accounts: 1, staff: 1, mutes: 0, bans: 0 });
  });

  it('dix essais avec un mauvais jeton bloquent un temps les tentatives suivantes', async () => {
    const { api } = await setup();
    for (let i = 0; i < 10; i++) await api('GET', '/staff/me', 'mauvais-jeton-xxxxxxxx');
    expect((await api('GET', '/staff/me', ROOT)).statusCode).toBe(429);
  });
});
