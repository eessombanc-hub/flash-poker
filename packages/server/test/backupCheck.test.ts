import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { encryptSnapshot, snapshotDb } from '../src/backup';
import { formatReport, inspectEncrypted, inspectSnapshot } from '../src/backupCheck';

async function sample() {
  const store = new AccountDb(':memory:');
  const accounts = new AccountService(store, new LogMailer(false, () => undefined), { now: () => 1_700_000_000_000, log: () => undefined });
  await accounts.register({ nickname: 'Ana', email: 'ana@exemple.fr', password: 'tapis-vert-42' });
  return snapshotDb(store.db);
}

describe('contrôle d’une sauvegarde', () => {
  it('une sauvegarde saine est déclarée lisible, avec le décompte des comptes', async () => {
    const snap = await sample();
    const r = inspectEncrypted(encryptSnapshot(snap, 'phrase-longue'), 'phrase-longue');
    expect(r.ok).toBe(true);
    expect(r.integrity).toBe('ok');
    expect(r.opensWithCurrentCode).toBe(true);
    expect(r.tables.users).toBe(1);
    const text = formatReport(r);
    expect(text).toMatch(/RÉSULTAT : la sauvegarde est lisible/);
    expect(text).not.toMatch(/ana@exemple|tapis-vert/);
  });
  it('mauvaise phrase de passe, fichier altéré ou base étrangère : problème signalé sans exception', async () => {
    const snap = await sample();
    const enc = encryptSnapshot(snap, 'bonne');
    expect(inspectEncrypted(enc, 'mauvaise').ok).toBe(false);
    expect(inspectEncrypted(enc, 'mauvaise').problems[0]).toMatch(/phrase de passe/);
    const empty = snapshotDb(new AccountDb(':memory:').db);
    expect(inspectSnapshot(empty).problems[0]).toMatch(/aucun compte/);
    expect(inspectSnapshot(Buffer.from('ceci n’est pas une base')).ok).toBe(false);
  });
});
