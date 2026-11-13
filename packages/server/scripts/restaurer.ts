/**
 * Test de restauration d'une sauvegarde de la base des comptes, sur votre poste, sans toucher au site en ligne.
 *
 *   npm run restaurer -w packages/server -- C:\chemin\comptes.db.enc
 *
 * La phrase de passe est demandée à l'écran (saisie masquée) ; elle n'est jamais écrite sur le disque ni affichée.
 * Sans chemin, la sauvegarde est lue sur GitHub avec BACKUP_GITHUB_REPO, BACKUP_GITHUB_TOKEN et BACKUP_PASSPHRASE
 * posées dans votre session de terminal.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { formatReport, inspectEncrypted } from '../src/backupCheck';
import { GithubBackup, resolveBackup } from '../src/backup';

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main(): Promise<number> {
  const file = process.argv[2];
  let blob: Uint8Array;
  let passphrase = process.env.BACKUP_PASSPHRASE ?? '';
  if (file) {
    blob = readFileSync(file);
    console.log(`Fichier lu : ${file} (${Math.round(blob.length / 1024)} Ko)`);
  } else {
    const cfg = resolveBackup(process.env);
    if (!cfg) {
      console.error('Indiquez le chemin du fichier chiffré, ou posez BACKUP_GITHUB_REPO, BACKUP_GITHUB_TOKEN et BACKUP_PASSPHRASE dans ce terminal.');
      return 2;
    }
    const gh = new GithubBackup(cfg, fetch, () => undefined);
    const plain = await gh.fetchLatest();
    if (!plain) {
      console.error('Aucune sauvegarde n’existe encore dans ce dépôt.');
      return 1;
    }
    // fetchLatest a déjà déchiffré : on contrôle directement l'instantané.
    const { inspectSnapshot } = await import('../src/backupCheck');
    const report = inspectSnapshot(plain);
    console.log(formatReport(report));
    return report.ok ? 0 : 1;
  }
  if (!passphrase) passphrase = await askHidden('Phrase de passe de sauvegarde : ');
  const report = inspectEncrypted(blob, passphrase);
  console.log(formatReport(report));
  return report.ok ? 0 : 1;
}

process.exit(await main().catch((e: Error) => { console.error(`Échec : ${e.message}`); return 1; }));
