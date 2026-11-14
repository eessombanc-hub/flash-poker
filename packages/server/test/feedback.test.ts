import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { FeedbackService } from '../src/accounts/feedback';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { buildServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

const TOKEN = 'jeton-admin-de-test-1234';

async function setup(adminToken: string | null = TOKEN, to?: string) {
  const db = new AccountDb(':memory:');
  const mailer = new LogMailer(true, () => undefined);
  const accounts = new AccountService(db, mailer, { log: () => undefined });
  const feedback = new FeedbackService(db, mailer, { to });
  const server = await buildServer({ manager: new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() }), accounts, feedback, adminToken: adminToken ?? undefined, onError: () => undefined });
  cleanup.push(() => server.close());
  const send = (payload: unknown, headers: Record<string, string> = {}) => server.app.inject({ method: 'POST', url: '/feedback', payload: payload as object, headers });
  const admin = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string | null = TOKEN, payload?: object) =>
    server.app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { accounts, mailer, send, admin, db };
}

const OK = { kind: 'bug', message: 'Le bouton Relancer ne répond plus au tour 3.', where: 'table', version: '1.0' };

describe('« Un bug ? »', () => {
  it('enregistre un message, nettoie les champs et refuse les entrées invalides', async () => {
    const { send, admin } = await setup();
    const r = await send({ ...OK, message: `  Le bouton\u0007   Relancer\r\n\r\n\r\n\r\nne répond plus.  `, contact: 'ana@x.fr' });
    expect(r.statusCode).toBe(201);
    const item = (await admin('GET', '/admin/feedback')).json().items[0];
    expect(item).toMatchObject({ kind: 'bug', contact: 'ana@x.fr', nickname: null, status: 'open' });
    expect(item.message).toBe('Le bouton Relancer\n\nne répond plus.');
    expect(item.context).toContain('écran table');

    expect((await send({ ...OK, kind: 'autre' })).statusCode).toBe(400);
    expect((await send({ ...OK, message: 'court' })).statusCode).toBe(400);
    expect((await send({ ...OK, contact: 'pas-un-mail' })).statusCode).toBe(400);
    expect((await send({ ...OK, message: 'x'.repeat(5000) })).statusCode).toBe(201);
    const long = (await admin('GET', '/admin/feedback')).json().items.find((i: { message: string }) => i.message.startsWith('xxx'));
    expect(long.message.length).toBe(2000);
  });

  it('relie le message au compte connecté et le retire avec le compte', async () => {
    const { accounts, send, admin, db } = await setup();
    const reg = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
    await send(OK, { authorization: `Bearer ${reg.token}` });
    expect((await admin('GET', '/admin/feedback')).json().items[0].nickname).toBe('Ana');
    db.db.prepare('DELETE FROM users WHERE id = ?').run(reg.account.id);
    expect((await admin('GET', '/admin/feedback')).json().items).toHaveLength(0);
  });

  it('limite à 5 envois par heure et par adresse', async () => {
    const { send } = await setup();
    for (let i = 0; i < 5; i++) expect((await send(OK)).statusCode).toBe(201);
    expect((await send(OK)).statusCode).toBe(429);
  });

  it('prévient par e-mail quand FEEDBACK_TO est renseigné', async () => {
    const { send, mailer } = await setup(TOKEN, 'moi@x.fr');
    await send({ ...OK, message: 'Un <b>problème</b> sérieux ici' });
    await new Promise((r) => setTimeout(r, 10));
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('moi@x.fr');
    expect(mailer.sent[0]!.html).toContain('&lt;b&gt;');
  });

  it('administration : jeton exigé, marquage traité, suppression, blocage après échecs', async () => {
    const { send, admin } = await setup();
    await send(OK);
    expect((await admin('GET', '/admin/feedback', null)).statusCode).toBe(401);
    expect((await admin('GET', '/admin/feedback', 'mauvais-jeton-xxxxxxxx')).statusCode).toBe(401);
    const id = (await admin('GET', '/admin/feedback')).json().items[0].id as string;
    expect((await admin('POST', `/admin/feedback/${id}`, TOKEN, { status: 'done' })).statusCode).toBe(204);
    expect((await admin('GET', '/admin/feedback?status=open')).json().items).toHaveLength(0);
    expect((await admin('GET', '/admin/feedback?status=done')).json().items).toHaveLength(1);
    expect((await admin('POST', `/admin/feedback/${id}`, TOKEN, { status: 'x' })).statusCode).toBe(400);
    expect((await admin('DELETE', `/admin/feedback/${id}`)).statusCode).toBe(204);
    expect((await admin('DELETE', `/admin/feedback/${id}`)).statusCode).toBe(404);
    for (let i = 0; i < 10; i++) await admin('GET', '/admin/feedback', 'mauvais-jeton-xxxxxxxx');
    expect((await admin('GET', '/admin/feedback')).statusCode).toBe(429);
  });

  it('sans jeton (ou jeton trop court), les routes d’administration n’existent pas', async () => {
    for (const t of [null, 'court']) {
      const { admin } = await setup(t);
      expect((await admin('GET', '/admin/feedback', t ?? 'x')).statusCode).toBe(404);
    }
  });
});
