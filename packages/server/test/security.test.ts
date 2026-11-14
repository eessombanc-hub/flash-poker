import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from '../src/accounts/password';
import { AccountService } from '../src/accounts/service';
import { buildServer, type BuiltServer } from '../src/http';
import { clientIp, maskEmail, resolveTrustProxy } from '../src/netSecurity';
import { RateLimiter } from '../src/rateLimiter';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function start(extra: Partial<Parameters<typeof buildServer>[0]> = {}) {
  const db = new AccountDb(':memory:');
  const accounts = new AccountService(db, new LogMailer(false, () => undefined), { log: () => undefined });
  const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) } });
  const server: BuiltServer = await buildServer({ manager, accounts, onError: () => undefined, httpRateLimit: { max: 100, windowMs: 60_000 }, ...extra });
  cleanup.push(() => server.close());
  const inj = (method: 'GET' | 'POST' | 'DELETE', url: string, opts: { token?: string; payload?: unknown; ip?: string; xff?: string } = {}) =>
    server.app.inject({ method, url, payload: opts.payload as never, remoteAddress: opts.ip, headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.xff ? { 'x-forwarded-for': opts.xff } : {}) } });
  return { server, accounts, db, inj };
}

describe('sécurité : limiteur de débit', () => {
  it('purge les clés inactives et plafonne le nombre de clés suivies', () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t, 50);
    for (let i = 0; i < 50; i++) expect(rl.hit(`ip${i}`)).toBe(true);
    expect(rl.hit('nouvelle')).toBe(false); // table saturée : refus plutôt que croissance sans limite
    t = 5000;
    expect(rl.hit('nouvelle')).toBe(true); // les anciennes clés ont été purgées
    expect(rl.size).toBe(1);
  });
  it('allows() ne consomme rien et clear() oublie la clé', () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    expect(rl.allows('a')).toBe(true);
    rl.hit('a');
    expect(rl.allows('a')).toBe(false);
    rl.clear('a');
    expect(rl.allows('a')).toBe(true);
  });
});

describe('sécurité : adresse IP derrière un relais', () => {
  it('lit l’adresse du client selon le nombre de relais de confiance, sans se laisser tromper par un en-tête forgé', () => {
    expect(clientIp({ 'x-forwarded-for': '9.9.9.9' }, '10.0.0.1', 0)).toBe('10.0.0.1');
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.1', 1)).toBe('1.2.3.4');
    // Le client ajoute un faux 6.6.6.6 : le relais, lui, ajoute la vraie adresse à la fin.
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, '10.0.0.1', 1)).toBe('1.2.3.4');
    expect(clientIp({}, '10.0.0.1', 1)).toBe('10.0.0.1');
  });
  it('TRUST_PROXY : explicite, sinon 1 sur Render, sinon 0', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'abc' })).toBe(0);
    expect(resolveTrustProxy({ RENDER: 'true' })).toBe(1);
    expect(resolveTrustProxy({})).toBe(0);
  });
  it('avec trustProxy, deux clients derrière le même relais ont chacun leur limite', async () => {
    const { inj } = await start({ trustProxy: 1, httpRateLimit: { max: 2, windowMs: 60_000 } });
    const get = (xff: string) => inj('GET', '/rooms', { ip: '10.0.0.1', xff }).then((r) => r.statusCode);
    expect([await get('1.1.1.1'), await get('1.1.1.1'), await get('1.1.1.1')]).toEqual([200, 200, 429]);
    expect(await get('2.2.2.2')).toBe(200);
  });
  it('sans trustProxy, l’en-tête X-Forwarded-For est ignoré (non falsifiable)', async () => {
    const { inj } = await start({ httpRateLimit: { max: 2, windowMs: 60_000 } });
    const codes = [];
    for (const xff of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) codes.push((await inj('GET', '/rooms', { ip: '10.0.0.1', xff })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
  });
  it('masque les adresses e-mail dans les journaux', () => {
    expect(maskEmail('emeric@exemple.fr')).toBe('em***@exemple.fr');
    expect(maskEmail('x')).toBe('***');
  });
});

describe('sécurité : en-têtes HTTP', () => {
  it('envoie CSP, HSTS, anti-framing et nosniff sur les réponses de l’API comme sur les erreurs', async () => {
    const { inj } = await start();
    for (const url of ['/health', '/introuvable']) {
      const h = (await inj('GET', url)).headers;
      expect(String(h['content-security-policy'])).toContain("frame-ancestors 'self'");
      expect(String(h['content-security-policy'])).toContain("script-src 'self'");
      expect(String(h['content-security-policy'])).toContain("object-src 'none'");
      expect(h['strict-transport-security']).toMatch(/max-age=\d+/);
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['x-frame-options']).toBe('SAMEORIGIN');
      expect(h['referrer-policy']).toBeTruthy();
      expect(h['permissions-policy']).toContain('camera=()');
    }
  });
  it('la route de diagnostic /_ip n’existe que si on l’active', async () => {
    expect((await (await start()).inj('GET', '/_ip')).statusCode).toBe(404);
    const s = await start({ trustProxy: 1, debugIp: true });
    expect((await s.inj('GET', '/_ip', { ip: '10.0.0.1', xff: '8.8.8.8' })).json()).toMatchObject({ ip: '8.8.8.8' });
  });
});

describe('sécurité : mots de passe', () => {
  it('les nouvelles empreintes utilisent les paramètres actuels ; les anciennes restent valides et sont signalées', async () => {
    const fresh = await hashPassword('tapis-vert-42');
    expect(fresh.startsWith('scrypt$65536$')).toBe(true);
    expect(needsRehash(fresh)).toBe(false);
    expect(await verifyPassword('tapis-vert-42', fresh)).toBe(true);
    expect(await verifyPassword('autre', fresh)).toBe(false);
    expect(DUMMY_HASH.startsWith('scrypt$65536$')).toBe(true);
    // Empreinte d’ancienne génération (N = 16384), produite avec le même algorithme.
    const { scryptSync, randomBytes } = await import('node:crypto');
    const salt = randomBytes(16);
    const old = `scrypt$16384$${salt.toString('base64')}$${scryptSync('tapis-vert-42', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    expect(needsRehash(old)).toBe(true);
    expect(await verifyPassword('tapis-vert-42', old)).toBe(true);
    expect(await verifyPassword('tapis-vert-42', 'scrypt$3$AA==$AA==')).toBe(false); // coût aberrant refusé
  });
  it('une ancienne empreinte est remplacée par une empreinte actuelle à la connexion', async () => {
    const { accounts, db } = await start();
    const { account } = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
    const { scryptSync, randomBytes } = await import('node:crypto');
    const salt = randomBytes(16);
    const old = `scrypt$16384$${salt.toString('base64')}$${scryptSync('tapis-vert-42', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    db.db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(old, account.id);
    await accounts.login({ login: 'ana', password: 'tapis-vert-42' });
    const stored = (db.db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(account.id) as { pass_hash: string }).pass_hash;
    expect(stored.startsWith('scrypt$65536$')).toBe(true);
    expect((await accounts.login({ login: 'ana', password: 'tapis-vert-42' })).account.id).toBe(account.id);
  });
  it('refuse les mots de passe triviaux', async () => {
    const { accounts } = await start();
    for (const password of ['password123', '12345678', 'aaaaaaaaaa', 'AZERTYUIOP']) {
      await expect(accounts.register({ nickname: 'Bob', email: 'b@x.fr', password })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
  });
  it('bloque un compte visé par des essais répartis sur plusieurs adresses, sans gêner les autres', async () => {
    const { accounts, inj } = await start({ authRateLimit: { max: 1000, windowMs: 60_000 } });
    await accounts.register({ nickname: 'Cible', email: 'c@x.fr', password: 'tapis-vert-42' });
    await accounts.register({ nickname: 'Autre', email: 'a@x.fr', password: 'tapis-vert-42' });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await inj('POST', '/auth/login', { ip: `10.0.0.${i}`, payload: { login: 'cible', password: 'faux-faux-faux' } })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    expect((await inj('POST', '/auth/login', { ip: '10.9.9.9', payload: { login: 'cible', password: 'tapis-vert-42' } })).statusCode).toBe(429);
    expect((await inj('POST', '/auth/login', { ip: '10.9.9.9', payload: { login: 'autre', password: 'tapis-vert-42' } })).statusCode).toBe(200);
  });
});

describe('sécurité : données personnelles', () => {
  it('exporte les données du compte, uniquement les siennes', async () => {
    const { accounts, inj } = await start();
    const a = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
    await accounts.register({ nickname: 'Bob', email: 'bob@x.fr', password: 'tapis-vert-42' });
    expect((await inj('GET', '/me/export')).statusCode).toBe(401);
    const r = await inj('GET', '/me/export', { token: a.token });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['content-disposition'])).toContain('attachment');
    const body = r.json();
    expect(body.account).toMatchObject({ nickname: 'Ana', email: 'ana@x.fr' });
    expect(JSON.stringify(body)).not.toContain('bob@x.fr');
    expect(JSON.stringify(body)).not.toContain('pass_hash');
    expect(JSON.stringify(body)).not.toContain('scrypt$');
  });
  it('supprime le compte après vérification du mot de passe, avec ses sessions et ses liens', async () => {
    const { accounts, db, inj } = await start();
    const a = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
    const b = await accounts.register({ nickname: 'Bob', email: 'bob@x.fr', password: 'tapis-vert-42' });
    accounts.addFavorite(a.account.id, { nickname: 'Bob' });
    expect((await inj('DELETE', '/me', { token: a.token, payload: { password: 'faux-faux-faux' } })).statusCode).toBe(401);
    expect(accounts.account(a.account.id)).not.toBeNull();
    expect((await inj('DELETE', '/me', { token: a.token, payload: { password: 'tapis-vert-42' } })).statusCode).toBe(200);
    expect(accounts.account(a.account.id)).toBeNull();
    expect(accounts.userBySession(a.token)).toBeNull();
    expect((await inj('POST', '/auth/login', { payload: { login: 'ana', password: 'tapis-vert-42' } })).statusCode).toBe(401);
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM fav_players').get()).toMatchObject({ n: 0 });
    expect(accounts.account(b.account.id)).not.toBeNull(); // les autres comptes ne sont pas touchés
    // L’adresse et le pseudo sont de nouveau disponibles.
    await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
  });
});

describe('sécurité : plafonds de charge', () => {
  it('refuse de créer une table au-delà du plafond global', () => {
    const m = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), maxRooms: 2 });
    const mk = () => m.createRoom({ name: 'T', maxPlayers: 2, targetPoints: 5, stakeChips: 0, nickname: 'H' });
    mk();
    mk();
    expect(mk).toThrowError(/sollicité/);
  });
});
