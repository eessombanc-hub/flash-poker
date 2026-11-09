import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

// Mots de passe : jamais conservés en clair. Empreinte scrypt (lente et coûteuse en mémoire, conçue pour
// résister aux attaques par force brute) avec un sel aléatoire propre à chaque compte.
const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
// Paramètres actuels (recommandation OWASP : N = 2^17 / r = 8 / p = 1 ou l'équivalent N = 2^16 avec p = 2).
// Les anciennes empreintes (N = 16384) restent valides : elles sont recalculées à la prochaine connexion réussie.
const PARAMS = { N: 65536, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const KEY_LEN = 32;

// Chaque calcul mobilise environ 64 Mo : on en limite le nombre simultané pour qu'un afflux de connexions
// (légitimes ou non) ne fasse pas dépasser la mémoire d'un petit hébergement.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function derive(password: string, salt: Buffer, len: number, n: number): Promise<Buffer> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await scrypt(password, salt, len, { ...PARAMS, N: n });
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LEN, PARAMS.N);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Comparaison en temps constant : la durée de la réponse ne renseigne pas sur le mot de passe. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const cost = Number(n);
  if (!Number.isInteger(cost) || cost < 1024 || cost > 1 << 17 || (cost & (cost - 1)) !== 0) return false;
  const key = await derive(password, Buffer.from(saltB64, 'base64'), expected.length, cost);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Vrai si l'empreinte a été calculée avec des paramètres plus faibles que les actuels. */
export function needsRehash(stored: string): boolean {
  const [algo, n] = stored.split('$');
  return algo !== 'scrypt' || Number(n) < PARAMS.N;
}

/** Empreinte factice aux paramètres actuels : une connexion sur un compte inexistant coûte autant de temps qu'une vraie. */
export const DUMMY_HASH = `scrypt$${PARAMS.N}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

/** Jeton aléatoire (session, réinitialisation) : seule son empreinte SHA-256 est conservée en base. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
