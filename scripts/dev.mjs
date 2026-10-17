// Lance le serveur (:3000) et l'interface (:5173) d'une seule commande : `npm run dev`.
// Option : `npm run dev:calme` allonge les minuteurs à 3 minutes (essai en solo, plusieurs fenêtres).
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const calme = process.argv.includes('--calme');
const env = { ...process.env, ...(calme ? { PHASE_SECONDS: '180' } : {}) };
const children = [];
let stopping = false;
const win = process.platform === 'win32';

function run(name, script, color) {
  const child = spawn('npm', ['run', script], { shell: true, env, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) out.write(tag + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n${name} s'est arrêté (code ${code}). Arrêt de l'ensemble : voir le message ci-dessus.`);
      stop(1);
    }
  });
  children.push(child);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      if (win) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']);
      else process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* déjà arrêté */
    }
  }
  setTimeout(() => process.exit(code), 600);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

async function ready(url) {
  for (let i = 0; i < 160 && !stopping; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

console.log('Démarrage du serveur et de l’interface…');
run('serveur', 'dev:server', '36');
run('interface', 'dev:web', '35');

const ok = (await ready('http://127.0.0.1:3000/health')) && (await ready('http://127.0.0.1:5173/'));
if (ok && !stopping) {
  const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n────────────────────────────────────────────');
  console.log('  ✔ Prêt. Ouvrez :  http://localhost:5173');
  for (const ip of lan) console.log(`    Depuis un autre appareil du même Wi-Fi :  http://${ip}:5173`);
  if (calme) console.log('  ⏱ Mode calme : minuteurs de 3 minutes (essai uniquement).');
  console.log('  Arrêter : Ctrl + C');
  console.log('────────────────────────────────────────────\n');
}
