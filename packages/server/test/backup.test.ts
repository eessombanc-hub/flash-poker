import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { decryptSnapshot, encryptSnapshot, GithubBackup, resolveBackup, restoreIfNeeded, snapshotDb, type BackupConfig } from '../src/backup';

const CFG: BackupConfig = { repo: 'moi/donnees', token: 'ghp_secret', passphrase: 'phrase-de-passe-longue', path: 'comptes.db.enc', intervalMs: 60_000 };
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'fp-bk-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Faux GitHub : un seul fichier, versionné par sha, avec les statuts utiles (404, 409, 500). */
function fakeGithub(opts: { failRead?: boolean; conflictOnce?: boolean } = {}) {
  let blob: Buffer | null = null;
  let version = 0;
  let conflict = opts.conflictOnce ?? false;
  const calls: string[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(method);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ghp_secret');
    if (method === 'GET') {
      if (opts.failRead) return new Response('boom', { status: 500 });
      if (!blob) return new Response('{}', { status: 404 });
      if (headers.accept.includes('raw')) return new Response(new Uint8Array(blob));
      return new Response(JSON.stringify({ sha: `v${version}` }));
    }
    if (conflict) {
      conflict = false;
      return new Response('{}', { status: 409 });
    }
    const body = JSON.parse(init!.body as string) as { content: string; sha?: string };
    if (blob && body.sha !== `v${version}`) return new Response('{}', { status: 409 });
    blob = Buffer.from(body.content, 'base64');
    version++;
    return new Response(JSON.stringify({ content: { sha: `v${version}` } }), { status: 201 });
  }) as unknown as typeof fetch;
  return { fn, calls, get blob() { return blob; }, set blob(b: Buffer | null) { blob = b; version++; } };
}

describe('chiffrement des instantanés', () => {
  it('aller-retour fidèle ; phrase de passe fausse ou contenu altéré refusés', () => {
    const plain = Buffer.from('comptes '.repeat(500));
    const enc = encryptSnapshot(plain, 'secret-1');
    expect(enc.includes(Buffer.from('comptes'))).toBe(false);
    expect(decryptSnapshot(enc, 'secret-1').equals(plain)).toBe(true);
    expect(() => decryptSnapshot(enc, 'autre')).toThrow(/phrase de passe/);
    const bad = Buffer.from(enc);
    bad[bad.length - 1]! ^= 1;
    expect(() => decryptSnapshot(bad, 'secret-1')).toThrow();
  });
});

describe('configuration', () => {
  it('inactive sans les trois variables, refuse un dépôt mal écrit, borne l’intervalle', () => {
    expect(resolveBackup({})).toBeNull();
    expect(resolveBackup({ BACKUP_GITHUB_REPO: 'a/b', BACKUP_GITHUB_TOKEN: 't' })).toBeNull();
    expect(() => resolveBackup({ BACKUP_GITHUB_REPO: 'pasbon', BACKUP_GITHUB_TOKEN: 't', BACKUP_PASSPHRASE: 'p' })).toThrow();
    expect(resolveBackup({ BACKUP_GITHUB_REPO: 'a/b', BACKUP_GITHUB_TOKEN: 't', BACKUP_PASSPHRASE: 'p', BACKUP_INTERVAL_SECONDS: '1' })!.intervalMs).toBe(15_000);
  });
});

describe('sauvegarde et restauration', () => {
  it('une base sauvegardée est restaurée à l’identique sur un disque vierge', async () => {
    const gh = fakeGithub();
    const a = join(tmp(), 'comptes.db');
    const log = () => undefined;
    const b1 = await restoreIfNeeded(CFG, a, gh.fn, log);
    expect(b1!.pushEnabled).toBe(true); // 404 : démarrage neuf autorisé
    const store = new AccountDb(a);
    store.db.prepare("INSERT INTO users (id, nickname, email, pass_hash, avatar, notify_email, created_at) VALUES ('u1','Ana','a@x.fr','h',NULL,1,1)").run();
    expect(await b1!.push(snapshotDb(store.db))).toBe(true);
    expect(await b1!.push(snapshotDb(store.db))).toBe(false); // inchangé : pas de nouvel envoi
    store.close();

    const fresh = join(tmp(), 'sub', 'comptes.db'); // disque effacé par un redéploiement
    const b2 = await restoreIfNeeded(CFG, fresh, gh.fn, log);
    expect(existsSync(fresh)).toBe(true);
    expect(b2!.pushEnabled).toBe(true);
    const back = new AccountDb(fresh);
    expect((back.db.prepare('SELECT nickname FROM users').get() as { nickname: string }).nickname).toBe('Ana');
    back.close();
    expect(readFileSync(fresh).length).toBeGreaterThan(1000);
  });

  it('sûreté : lecture impossible ou mauvaise phrase de passe, aucun envoi ni fichier vide', async () => {
    const gh = fakeGithub({ failRead: true });
    const path = join(tmp(), 'comptes.db');
    const b = await restoreIfNeeded(CFG, path, gh.fn, () => undefined);
    expect(b!.pushEnabled).toBe(false);
    expect(await b!.push(Buffer.from('base vide'))).toBe(false);
    expect(gh.calls.includes('PUT')).toBe(false);
    expect(existsSync(path)).toBe(false);

    const ok = fakeGithub();
    ok.blob = encryptSnapshot(Buffer.from('x'), 'une-autre-phrase');
    const b2 = await restoreIfNeeded(CFG, join(tmp(), 'c.db'), ok.fn, () => undefined);
    expect(b2!.pushEnabled).toBe(false);
  }, 20_000);

  it('un conflit de version (409) est retenté une fois avec le sha à jour', async () => {
    const gh = fakeGithub({ conflictOnce: true });
    const b = new GithubBackup(CFG, gh.fn, () => undefined);
    b.pushEnabled = true;
    expect(await b.push(Buffer.from('v1'))).toBe(true);
    expect(gh.blob).not.toBeNull();
  });
});
