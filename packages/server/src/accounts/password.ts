import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

// Mots de passe : jamais conservés en clair. Empreinte scrypt (lente et coûteuse en mémoire, conçue pour
// résister aux attaques par force brute) avec un sel aléatoire propre à chaque compte.
const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Comparaison en temps constant : la durée de la réponse ne renseigne pas sur le mot de passe. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...PARAMS, N: Number(n) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Jeton aléatoire (session, réinitialisation) : seule son empreinte SHA-256 est conservée en base. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
