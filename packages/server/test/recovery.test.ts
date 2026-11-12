import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { buildServer, originAllowed, parseOrigins } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const svc = () => new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { log: () => undefined });
const PWD = 'tapis-vert-42';

describe('code de secours (sans service e-mail)', () => {
  it('l’inscription délivre un code ; il remplace le mot de passe, ouvre une session et se renouvelle', async () => {
    const a = svc();
    const r = await a.register({ nickname: 'Ana', email: 'ana@x.fr', password: PWD });
    expect(r.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const row = a['store'].db.prepare('SELECT code_hash FROM recovery_codes').get() as { code_hash: string };
    expect(row.code_hash).not.toContain(r.recoveryCode.replace(/-/g, ''));

    // saisie tolérante : minuscules, espaces, tirets absents
    const typed = r.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const back = await a.resetWithCode({ login: 'ANA', code: typed, password: 'nouveau-mdp-77' });
    expect(back.account.id).toBe(r.account.id);
    expect(back.recoveryCode).not.toBe(r.recoveryCode);
    expect(a.userBySession(r.token)).toBeNull(); // anciennes sessions fermées
    expect(a.userBySession(back.token)?.id).toBe(r.account.id);
    await a.login({ login: 'ana@x.fr', password: 'nouveau-mdp-77' });
    await expect(a.login({ login: 'Ana', password: PWD })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // usage unique
    await expect(a.resetWithCode({ login: 'Ana', code: r.recoveryCode, password: 'encore-un-autre-9' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('compte inconnu, code faux ou compte sans code : même refus', async () => {
    const a = svc();
    const r = await a.register({ nickname: 'Ana', email: 'ana@x.fr', password: PWD });
    for (const login of ['Nobody', 'Ana']) {
      await expect(a.resetWithCode({ login, code: 'AAAA-BBBB-CCCC', password: 'nouveau-mdp-77' })).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Compte ou code de secours incorrect' });
    }
    a['store'].db.prepare('DELETE FROM recovery_codes').run();
    expect(a.hasRecoveryCode(r.account.id)).toBe(false);
    await expect(a.resetWithCode({ login: 'Ana', code: r.recoveryCode, password: 'nouveau-mdp-77' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('un compte existant génère son code avec son mot de passe ; l’ancien code est révoqué', async () => {
    const a = svc();
    const r = await a.register({ nickname: 'Ana', email: 'ana@x.fr', password: PWD });
    a['store'].db.prepare('DELETE FROM recovery_codes').run();
    await expect(a.regenerateRecoveryCode(r.account.id, { password: 'faux-mdp-000' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const n1 = await a.regenerateRecoveryCode(r.account.id, { password: PWD });
    const n2 = await a.regenerateRecoveryCode(r.account.id, { password: PWD });
    expect(a.hasRecoveryCode(r.account.id)).toBe(true);
    await expect(a.resetWithCode({ login: 'Ana', code: n1.recoveryCode, password: 'nouveau-mdp-77' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await a.resetWithCode({ login: 'Ana', code: n2.recoveryCode, password: 'nouveau-mdp-77' });
  });

  it('route : au bout de 5 échecs sur un compte, même le bon code est refusé un temps', async () => {
    const a = svc();
    const reg = await a.register({ nickname: 'Ana', email: 'ana@x.fr', password: PWD });
    const server = await buildServer({ manager: new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() }), accounts: a, onError: () => undefined });
    cleanup.push(() => server.close());
    const post = (code: string) => server.app.inject({ method: 'POST', url: '/auth/recover', payload: { login: 'Ana', code, password: 'nouveau-mdp-77' } });
    expect((await server.app.inject({ method: 'GET', url: '/auth/config' })).json()).toEqual({ passwordRecovery: false, recoveryCode: true });
    for (let i = 0; i < 5; i++) expect((await post('AAAA-BBBB-CCCC')).statusCode).toBe(401);
    expect((await post(reg.recoveryCode)).statusCode).toBe(429);
  });
});

describe('CORS multi-origines', () => {
  it('liste, espaces, barre finale, variante www', () => {
    const list = parseOrigins(' https://flash-poker.fr/ , https://autre.app ,');
    expect(list).toEqual(['https://flash-poker.fr', 'https://autre.app']);
    expect(originAllowed(list, 'https://flash-poker.fr')).toBe(true);
    expect(originAllowed(list, 'https://www.flash-poker.fr')).toBe(true);
    expect(originAllowed(list, 'https://autre.app')).toBe(true);
    expect(originAllowed(list, 'https://evil.example')).toBe(false);
    expect(originAllowed(list, 'https://flash-poker.fr.evil.example')).toBe(false);
  });

  it('l’origine du navigateur est reprise si elle est permise, sinon aucun en-tête d’autorisation', async () => {
    const server = await buildServer({ manager: new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() }), accounts: svc(), onError: () => undefined, corsOrigin: 'https://flash-poker.fr, https://beta.exemple.app' });
    cleanup.push(() => server.close());
    const get = (origin: string) => server.app.inject({ method: 'OPTIONS', url: '/auth/login', headers: { origin } });
    expect((await get('https://www.flash-poker.fr')).headers['access-control-allow-origin']).toBe('https://www.flash-poker.fr');
    expect((await get('https://beta.exemple.app')).headers['access-control-allow-origin']).toBe('https://beta.exemple.app');
    expect((await get('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
});
