import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { AVATAR_IMAGE_ID, AVATAR_IMAGE_MAX_BYTES, jpegSize, validAvatarJpeg } from '../src/accounts/avatarImage';
import { buildServer, type BuiltServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

/** JPEG minimal : SOI, un segment APP0, un SOF0 aux dimensions voulues, SOS, EOI. Suffit pour la lecture d'en-tête. */
function jpeg(width: number, height: number, padding = 0): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00];
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from(app0), Buffer.from(sof), Buffer.from(sos), Buffer.alloc(padding, 0x11), Buffer.from([0xff, 0xd9])]);
}

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

async function start() {
  const accounts = new AccountService(new AccountDb(':memory:'), { mailer: new LogMailer(), now: () => Date.now(), publicUrl: 'http://x', rng: new SeededRng(3) } as never);
  const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) } });
  const server: BuiltServer = await buildServer({ manager, accounts, onError: () => undefined, httpRateLimit: { max: 100, windowMs: 60_000 } });
  cleanup.push(() => server.close());
  const register = async (nickname: string) => ((await server.app.inject({ method: 'POST', url: '/auth/register', payload: { nickname, email: `${nickname}@x.fr`, password: 'tapis-vert-42' } })).json() as { token: string }).token;
  const send = (token: string | undefined, body: Buffer, type = 'image/jpeg') =>
    server.app.inject({ method: 'POST', url: '/me/avatar-image', payload: body, headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { server, accounts, manager, register, send };
}

describe('photo de profil : lecture du JPEG', () => {
  it('lit les dimensions et refuse les fichiers qui n’en sont pas', () => {
    expect(jpegSize(jpeg(128, 96))).toEqual({ width: 128, height: 96 });
    expect(jpegSize(Buffer.from('GIF89a'))).toBeNull();
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(jpegSize(jpeg(128, 128).subarray(0, 40))).toBeNull(); // tronqué : pas de marqueur de fin
  });

  it('n’accepte que des dimensions et un poids raisonnables', () => {
    expect(validAvatarJpeg(jpeg(128, 128))).toBe(true);
    expect(validAvatarJpeg(jpeg(16, 16))).toBe(false);
    expect(validAvatarJpeg(jpeg(4000, 4000))).toBe(false); // léger en octets, énorme en pixels
    expect(validAvatarJpeg(jpeg(128, 128, AVATAR_IMAGE_MAX_BYTES))).toBe(false);
    expect(validAvatarJpeg(Buffer.alloc(0))).toBe(false);
  });
});

describe('photo de profil : routes', () => {
  it('envoi, avatar du compte, lecture publique et cache long', async () => {
    const { server, register, send } = await start();
    const token = await register('Ana');
    const res = await send(token, jpeg(128, 128, 200));
    expect(res.statusCode).toBe(200);
    const { avatar } = res.json() as { avatar: string };
    expect(avatar).toMatch(AVATAR_IMAGE_ID);

    const me = await server.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect((me.json() as { avatar: string }).avatar).toBe(avatar);

    const img = await server.app.inject({ method: 'GET', url: `/avatars/${avatar}.jpg` }); // sans jeton : les autres joueurs la voient
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.rawPayload.equals(jpeg(128, 128, 200))).toBe(true);
  });

  it('refuse sans compte, un autre format, une image invalide ou trop lourde', async () => {
    const { register, send } = await start();
    const token = await register('Ana');
    expect((await send(undefined, jpeg(128, 128))).statusCode).toBe(401);
    expect((await send(token, Buffer.from('pas une image'), 'image/png')).statusCode).toBeGreaterThanOrEqual(400);
    const bad = await send(token, Buffer.from('pas une image'));
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'BAD_REQUEST', ruleCode: 'AVATAR_IMAGE' } });
    expect((await send(token, jpeg(5000, 5000))).statusCode).toBe(400);
    expect((await send(token, jpeg(128, 128, AVATAR_IMAGE_MAX_BYTES + 1))).statusCode).toBeGreaterThanOrEqual(400);
  });

  it('une photo introuvable ou mal formée donne 404, jamais le contenu de la page d’accueil', async () => {
    const { server } = await start();
    for (const url of ['/avatars/i0123456789abcdef.jpg', '/avatars/n-importe-quoi.jpg', '/avatars/i0123456789abcdef']) {
      expect((await server.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('une nouvelle photo remplace l’ancienne ; choisir un préréglage la supprime', async () => {
    const { server, accounts, register, send } = await start();
    const token = await register('Ana');
    const a = ((await send(token, jpeg(128, 128, 10))).json() as { avatar: string }).avatar;
    const b = ((await send(token, jpeg(128, 128, 20))).json() as { avatar: string }).avatar;
    expect(a).not.toBe(b);
    expect(accounts.avatarImage(a)).toBeNull();
    expect(accounts.avatarImage(b)).not.toBeNull();
    const patch = await server.app.inject({ method: 'PATCH', url: '/me', payload: { avatar: 'or' }, headers: { authorization: `Bearer ${token}` } });
    expect(patch.statusCode).toBe(200);
    expect(accounts.avatarImage(b)).toBeNull();
  });

  it('on ne peut pas prendre la photo d’un autre compte, ni en s’inscrivant, ni en invité', async () => {
    const { server, manager, register, send } = await start();
    const ana = await register('Ana');
    const photo = ((await send(ana, jpeg(128, 128))).json() as { avatar: string }).avatar;

    const bea = await register('Bea');
    const steal = await server.app.inject({ method: 'PATCH', url: '/me', payload: { avatar: photo }, headers: { authorization: `Bearer ${bea}` } });
    expect(steal.statusCode).toBe(400);

    const reg = await server.app.inject({ method: 'POST', url: '/auth/register', payload: { nickname: 'Cleo', email: 'cleo@x.fr', password: 'tapis-vert-42', avatar: photo } });
    expect((reg.json() as { account: { avatar: string | null } }).account.avatar).toBeNull();

    const room = (await server.app.inject({ method: 'POST', url: '/rooms', payload: { name: 'T', maxPlayers: 3, targetPoints: 1, stakeChips: 0, nickname: 'Invité', avatar: photo } })).json() as { code: string; playerId: string };
    expect(manager.view(room.code, room.playerId).players[0]!.avatar).toBeNull();
  });

  it('la suppression du compte efface aussi la photo', async () => {
    const { accounts, server, register, send } = await start();
    const token = await register('Ana');
    const photo = ((await send(token, jpeg(128, 128))).json() as { avatar: string }).avatar;
    const del = await server.app.inject({ method: 'DELETE', url: '/me', payload: { password: 'tapis-vert-42' }, headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBeLessThan(300);
    expect(accounts.avatarImage(photo)).toBeNull();
  });
});
