import { SeededRng } from '@poker/engine';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { buildServer, type BuiltServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { closedWin } from './helpers';

const CLOSED_1 = { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' };
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function service(opts: { mail?: boolean; now?: () => number } = {}) {
  const mailer = new LogMailer(opts.mail ?? true, () => undefined);
  const accounts = new AccountService(new AccountDb(':memory:'), mailer, { appUrl: 'https://jeu.test', now: opts.now, log: () => undefined });
  return { accounts, mailer };
}

async function rejects(p: Promise<unknown> | (() => unknown), code: string): Promise<void> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`Erreur ${code} attendue`);
}

describe('comptes : inscription, connexion, sessions', () => {
  it('inscription puis connexion par pseudo ou par e-mail, sans distinction de casse', async () => {
    const { accounts } = service();
    const r = await accounts.register({ nickname: ' Emeric ', email: 'Emeric@Exemple.fr', password: 'motdepasse1' });
    expect(r.account).toMatchObject({ nickname: 'Emeric', email: 'emeric@exemple.fr', notifyEmail: true });
    expect(accounts.userBySession(r.token)?.id).toBe(r.account.id);
    expect((await accounts.login({ login: 'emeric', password: 'motdepasse1' })).account.id).toBe(r.account.id);
    expect((await accounts.login({ login: 'EMERIC@exemple.fr', password: 'motdepasse1' })).account.id).toBe(r.account.id);
  });

  it('refuse un pseudo ou un e-mail déjà pris, un mot de passe trop court, un mauvais mot de passe', async () => {
    const { accounts } = service();
    await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    await rejects(accounts.register({ nickname: 'ANA', email: 'b@x.fr', password: 'motdepasse1' }), 'NICKNAME_TAKEN');
    await rejects(accounts.register({ nickname: 'Bea', email: 'Ana@x.fr', password: 'motdepasse1' }), 'EMAIL_TAKEN');
    await rejects(accounts.register({ nickname: 'Bea', email: 'b@x.fr', password: 'court' }), 'BAD_REQUEST');
    await rejects(accounts.login({ login: 'Ana', password: 'mauvais-mdp' }), 'UNAUTHORIZED');
    await rejects(accounts.login({ login: 'Inconnu', password: 'motdepasse1' }), 'UNAUTHORIZED');
  });

  it('le mot de passe n’est jamais stocké en clair ; la session expire après 30 jours ; déconnexion', async () => {
    let t = 1_000;
    const { accounts } = service({ now: () => t });
    const r = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const row = accounts['store'].db.prepare('SELECT pass_hash FROM users').get() as { pass_hash: string };
    expect(row.pass_hash).toMatch(/^scrypt\$/);
    expect(row.pass_hash).not.toContain('motdepasse1');
    t += 29 * 86_400_000;
    expect(accounts.userBySession(r.token)).not.toBeNull();
    t += 2 * 86_400_000;
    expect(accounts.userBySession(r.token)).toBeNull();
    const s = await accounts.login({ login: 'Ana', password: 'motdepasse1' });
    accounts.logout(s.token);
    expect(accounts.userBySession(s.token)).toBeNull();
  });

  it('profil : pseudo, avatar, alertes ; changement de mot de passe (les autres appareils sont déconnectés)', async () => {
    const { accounts } = service();
    const a = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    expect(accounts.updateProfile(a.account.id, { nickname: 'Anaïs', avatar: 'renard', notifyEmail: false })).toMatchObject({ nickname: 'Anaïs', avatar: 'renard', notifyEmail: false });
    await rejects(() => accounts.updateProfile(a.account.id, { nickname: 'bea' }), 'NICKNAME_TAKEN');
    const other = await accounts.login({ login: 'Anaïs', password: 'motdepasse1' });
    await rejects(accounts.changePassword(a.account.id, { current: 'faux-faux', next: 'nouveau-mdp' }, a.token), 'UNAUTHORIZED');
    await accounts.changePassword(a.account.id, { current: 'motdepasse1', next: 'nouveau-mdp' }, a.token);
    expect(accounts.userBySession(a.token)).not.toBeNull();
    expect(accounts.userBySession(other.token)).toBeNull();
    expect((await accounts.login({ login: 'Anaïs', password: 'nouveau-mdp' })).account.id).toBe(a.account.id);
  });
});

describe('comptes : mot de passe oublié', () => {
  it('envoie un lien à usage unique, valable une heure ; rien n’indique si l’adresse existe', async () => {
    let t = 1_000;
    const { accounts, mailer } = service({ now: () => t });
    const a = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    await accounts.forgot({ email: 'personne@x.fr' });
    expect(mailer.sent).toHaveLength(0);
    await accounts.forgot({ email: 'ANA@x.fr' });
    expect(mailer.sent).toHaveLength(1);
    const token = decodeURIComponent(/reinitialiser=([^\s"&]+)/.exec(mailer.sent[0]!.text)![1]!);
    expect(mailer.sent[0]!.text).toContain('https://jeu.test/?reinitialiser=');
    const r = await accounts.reset({ token, password: 'nouveau-mdp' });
    expect(r.account.id).toBe(a.account.id);
    expect(accounts.userBySession(a.token)).toBeNull(); // anciennes sessions fermées
    await rejects(accounts.reset({ token, password: 'encore-un' }), 'UNAUTHORIZED'); // usage unique
    await accounts.forgot({ email: 'ana@x.fr' });
    const token2 = decodeURIComponent(/reinitialiser=([^\s"&]+)/.exec(mailer.sent[1]!.text)![1]!);
    t += 3_600_001;
    await rejects(accounts.reset({ token: token2, password: 'encore-un' }), 'UNAUTHORIZED'); // expiré
  });

  it('indisponible tant que l’envoi d’e-mails n’est pas configuré', async () => {
    const { accounts } = service({ mail: false });
    await rejects(accounts.forgot({ email: 'ana@x.fr' }), 'UNAVAILABLE');
  });
});

describe('comptes : parties terminées, historique, statistiques, bankroll, manches favorites', () => {
  async function finishedGame(cfg: { stakeChips?: number } = {}) {
    const { accounts } = service();
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const scheduler = new ManualScheduler();
    const m = new RoomManager({
      rng: new SeededRng(7),
      scheduler,
      gameHooks: { stackedDeck: (r) => (r === 1 ? closedWin(2, 0) : undefined) },
      accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) },
    });
    const host = m.createRoom({ name: 'Mardi soir', maxPlayers: 2, targetPoints: 1, stakeChips: cfg.stakeChips ?? 2000, nickname: 'ignoré' }, ana.account);
    const guest = m.joinRoom(host.code, { nickname: 'Invité' });
    m.connect(host.code, host.playerId);
    m.connect(host.code, guest.playerId);
    m.startGame(host.code, host.playerId);
    const order = m._debug(host.code).game!.players();
    m.command(host.code, order[0]!, CLOSED_1);
    scheduler.advance(60_000);
    const winner = m.view(host.code, host.playerId).game!.outcome!.winner;
    return { accounts, m, ana, host, guest, winner, code: host.code };
  }

  it('le pseudo d’un compte est réservé : un invité ne peut pas le prendre', async () => {
    const { m } = await finishedGame();
    const room = m.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 1, stakeChips: 0, nickname: 'Hôte' });
    await rejects(() => m.joinRoom(room.code, { nickname: 'ana' }), 'NICKNAME_RESERVED');
  });

  it('archive la partie : historique, statistiques par variante et bilan (gains − mises)', async () => {
    const { accounts, ana, host, winner } = await finishedGame();
    const won = winner === host.playerId;
    const games = accounts.games(ana.account.id);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ name: 'Mardi soir', won, netChips: won ? 2000 : -2000, rounds: 1, opponents: ['Invité'] });
    const stats = accounts.stats(ana.account.id);
    expect(stats).toMatchObject({ games: 1, gamesWon: won ? 1 : 0 });
    expect(stats.variants).toEqual([{ variant: 'CLOSED_1', played: 1, won: won ? 1 : 0, points: won ? 1 : 0 }]);
    const b = accounts.bankroll(ana.account.id);
    expect(b).toMatchObject({ totalChips: won ? 2000 : -2000, games: 1 });
    expect(b.series[0]).toMatchObject({ name: 'Mardi soir', cumulativeChips: b.totalChips });
  });

  it('manches favorites : réservées aux participants de la partie', async () => {
    const { accounts, ana } = await finishedGame();
    const id = accounts.games(ana.account.id)[0]!.id;
    accounts.addFavoriteRound(ana.account.id, id, 1);
    accounts.addFavoriteRound(ana.account.id, id, 1); // sans doublon
    expect(accounts.favoriteRounds(ana.account.id)).toHaveLength(1);
    expect(accounts.game(ana.account.id, id).favoriteRounds).toEqual([1]);
    await rejects(() => accounts.addFavoriteRound(ana.account.id, id, 9), 'NOT_FOUND');
    const bea = await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    await rejects(() => accounts.game(bea.account.id, id), 'NOT_FOUND');
    accounts.removeFavoriteRound(ana.account.id, id, 1);
    expect(accounts.favoriteRounds(ana.account.id)).toHaveLength(0);
  });

  it('une partie annulée n’est pas archivée', async () => {
    const { accounts } = service();
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const m = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: (g) => accounts.recordGame(g) } });
    const room = m.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 1, stakeChips: 0, nickname: 'x' }, ana.account);
    m.cancelRoom(room.code, room.playerId);
    expect(accounts.games(ana.account.id)).toHaveLength(0);
  });
});

describe('comptes : joueurs favoris et présence', () => {
  it('prévient dans l’application si l’abonné est en ligne, sinon par e-mail, une fois par jour au plus', async () => {
    let t = Date.UTC(2026, 10, 6, 10);
    const { accounts, mailer } = service({ now: () => t });
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const bea = await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    expect(accounts.search(ana.account.id, 'be').map((u) => u.nickname)).toEqual(['Bea']);
    accounts.addFavorite(ana.account.id, { nickname: 'bea' });
    await rejects(() => accounts.addFavorite(ana.account.id, { nickname: 'Ana' }), 'BAD_REQUEST');
    const seen: string[] = [];
    accounts.onFavoriteOnline((follower, who) => seen.push(`${follower}<-${who.nickname}`));

    const flush = () => new Promise((r) => setTimeout(r, 5));
    // Ana hors ligne : e-mail
    let off = accounts.connect(bea.account.id);
    await flush();
    expect(mailer.sent.map((m) => m.to)).toEqual(['ana@x.fr']);
    expect(mailer.sent[0]!.subject).toContain('Bea');
    off();
    // Même jour : pas de second e-mail
    off = accounts.connect(bea.account.id);
    await flush();
    off();
    expect(mailer.sent).toHaveLength(1);
    // Ana en ligne : notification dans l'application, pas d'e-mail
    const anaOff = accounts.connect(ana.account.id);
    off = accounts.connect(bea.account.id);
    await flush();
    expect(seen).toEqual([`${ana.account.id}<-Bea`]);
    expect(accounts.favorites(ana.account.id)).toMatchObject([{ nickname: 'Bea', online: true }]);
    off();
    anaOff();
    // Alertes e-mail désactivées : rien le lendemain
    t += 86_400_000;
    accounts.updateProfile(ana.account.id, { notifyEmail: false });
    off = accounts.connect(bea.account.id);
    await flush();
    off();
    expect(mailer.sent).toHaveLength(1);
  });
});

describe('comptes : invitations', () => {
  it('lien personnel : l’invité s’inscrit, les deux deviennent favoris l’un de l’autre', async () => {
    const { accounts } = service();
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const code = accounts.invites(ana.account.id).code;
    expect(accounts.invites(ana.account.id).code).toBe(code); // toujours le même lien
    expect(accounts.inviteInfo(code).inviter).toMatchObject({ nickname: 'Ana' });
    const bea = await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1', invite: code });
    expect(accounts.invites(ana.account.id).joined.map((u) => u.nickname)).toEqual(['Bea']);
    expect(accounts.favorites(ana.account.id).map((f) => f.nickname)).toEqual(['Bea']);
    expect(accounts.favorites(bea.account.id).map((f) => f.nickname)).toEqual(['Ana']);
    // Un code inconnu n'empêche pas l'inscription
    await accounts.register({ nickname: 'Cid', email: 'cid@x.fr', password: 'motdepasse1', invite: 'inconnu123' });
    await rejects(() => accounts.inviteInfo('inconnu123'), 'NOT_FOUND');
  });

  it('par e-mail : lien d’inscription, suivi « en attente » puis « inscrit », garde-fous', async () => {
    let t = 1_000_000;
    const { accounts, mailer } = service({ now: () => t });
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    const o = await accounts.inviteByEmail(ana.account.id, { email: 'Zoe@X.fr' });
    expect(o.sent).toEqual([{ email: 'zoe@x.fr', sentAt: t, joinedAs: null }]);
    expect(o.remainingToday).toBe(9);
    const m = mailer.sent.at(-1)!;
    expect(m.to).toBe('zoe@x.fr');
    expect(m.subject).toBe('Ana vous invite à jouer sur Flash Poker');
    const code = decodeURIComponent(/invitation=([^\s"&]+)/.exec(m.text)![1]!);
    await rejects(accounts.inviteByEmail(ana.account.id, { email: 'zoe@x.fr' }), 'BAD_REQUEST'); // déjà invitée cette semaine
    await rejects(accounts.inviteByEmail(ana.account.id, { email: 'bea@x.fr' }), 'EMAIL_TAKEN'); // déjà inscrite
    await rejects(accounts.inviteByEmail(ana.account.id, { email: 'ana@x.fr' }), 'BAD_REQUEST'); // soi-même
    await accounts.register({ nickname: 'Zoé', email: 'zoe@x.fr', password: 'motdepasse1', invite: code });
    expect(accounts.invites(ana.account.id).sent[0]).toMatchObject({ joinedAs: 'Zoé' });
    // 10 par jour au plus
    for (let i = 0; i < 9; i++) await accounts.inviteByEmail(ana.account.id, { email: `ami${i}@x.fr` });
    await rejects(accounts.inviteByEmail(ana.account.id, { email: 'encore@x.fr' }), 'RATE_LIMITED');
    t += 86_400_001;
    expect((await accounts.inviteByEmail(ana.account.id, { email: 'encore@x.fr' })).remainingToday).toBe(9);
  });

  it('sans e-mail configuré : seul le lien est proposé', async () => {
    const { accounts } = service({ mail: false });
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    expect(accounts.invites(ana.account.id).mailEnabled).toBe(false);
    await rejects(accounts.inviteByEmail(ana.account.id, { email: 'zoe@x.fr' }), 'UNAVAILABLE');
  });
});

describe('jetons', () => {
  const H = 3 * 3_600_000;
  it('100 jetons à l’inscription ; sous 100, remontée à 100 toutes les 3 heures ; au-dessus, rien', async () => {
    let t = 1_000_000;
    const { accounts } = service({ now: () => t });
    const ana = (await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' })).account.id;
    const w = accounts.wallet;
    expect(w.view(ana)).toMatchObject({ chips: 100, nextRefillAt: null });
    t += 1000;
    w.debit(ana, 60, 'Mise');
    expect(w.view(ana)).toMatchObject({ chips: 40, nextRefillAt: t + H });
    t += H - 1;
    expect(w.view(ana).chips).toBe(40);
    t += 1;
    expect(w.view(ana).chips).toBe(100); // remonté à 100, pas +100
    w.credit(ana, 50, 'Gain');
    t += 2 * H;
    expect(w.view(ana).chips).toBe(150); // au-dessus de 100 : rien
    w.debit(ana, 140, 'Mise');
    expect(w.view(ana).chips).toBe(10);
    t += H;
    expect(w.view(ana).chips).toBe(100);
    expect(w.ledger(ana).map((e) => [e.delta, e.balance])).toEqual([[90, 100], [-140, 10], [50, 150], [60, 100], [-60, 40], [100, 100]]);
    await rejects(() => w.debit(ana, 500, 'Mise'), 'INSUFFICIENT_CHIPS');
    expect(w.view(ana).chips).toBe(100);
  });

  it('table avec mise : compte exigé, mise retenue à l’arrivée, rendue au départ, cagnotte versée au gagnant', async () => {
    const { accounts } = service();
    const ana = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' });
    const bea = await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    const scheduler = new ManualScheduler();
    const m = new RoomManager({
      rng: new SeededRng(7),
      scheduler,
      gameHooks: { stackedDeck: (r) => (r === 1 ? closedWin(2, 0) : undefined) },
      accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g), debit: (i, a, r) => accounts.wallet.debit(i, a, r), credit: (i, a, r) => accounts.wallet.credit(i, a, r) },
    });
    const chips = (id: string) => accounts.wallet.view(id).chips;
    const room = m.createRoom({ name: 'Mardi', maxPlayers: 2, targetPoints: 1, stakeChips: 30, nickname: 'x' }, ana.account);
    expect(chips(ana.account.id)).toBe(70);
    await rejects(() => m.joinRoom(room.code, { nickname: 'Invité' }), 'ACCOUNT_REQUIRED');
    await rejects(() => m.createRoom({ name: 'Grosse', maxPlayers: 2, targetPoints: 1, stakeChips: 500, nickname: 'x' }, bea.account), 'INSUFFICIENT_CHIPS');
    expect(chips(bea.account.id)).toBe(100);
    let b = m.joinRoom(room.code, { nickname: 'y' }, bea.account);
    expect(chips(bea.account.id)).toBe(70);
    m.leaveLobby(room.code, b.playerId);
    expect(chips(bea.account.id)).toBe(100);
    b = m.joinRoom(room.code, { nickname: 'y' }, bea.account);
    m.connect(room.code, room.playerId);
    m.connect(room.code, b.playerId);
    m.startGame(room.code, room.playerId);
    const order = m._debug(room.code).game!.players();
    m.command(room.code, order[0]!, CLOSED_1);
    scheduler.advance(60_000);
    const winner = m.view(room.code, room.playerId).game!.outcome!.winner;
    const [w, l] = winner === room.playerId ? [ana, bea] : [bea, ana];
    expect(chips(w.account.id)).toBe(130);
    expect(chips(l.account.id)).toBe(70);
    // Table sans mise : ouverte aux invités, aucun jeton en jeu
    const free = m.createRoom({ name: 'Amicale', maxPlayers: 3, targetPoints: 1, stakeChips: 0, nickname: 'x' }, ana.account);
    expect(() => m.joinRoom(free.code, { nickname: 'Invité' })).not.toThrow();
    // Annulation : chacun récupère sa mise
    const c = m.createRoom({ name: 'Annulée', maxPlayers: 3, targetPoints: 1, stakeChips: 20, nickname: 'x' }, w.account);
    m.joinRoom(c.code, { nickname: 'y' }, l.account);
    m.cancelRoom(c.code, c.playerId);
    expect([chips(w.account.id), chips(l.account.id)]).toEqual([130, 70]);
  });

  it('boutique : offre de bienvenue unique, achat réservé aux majeurs, plafond de 50 € sur 7 jours, crédit idempotent', async () => {
    let t = 1_000_000;
    const { accounts } = service({ now: () => t });
    const ana = (await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1' })).account.id;
    const w = accounts.wallet;
    expect(w.shop(ana).offers.map((o) => o.id)).toContain('bienvenue');
    await rejects(() => w.checkPurchase(ana, 'pile', false), 'FORBIDDEN');
    expect(w.grantPurchase(ana, 'bienvenue', 'pay_1')).toBe(true);
    expect(w.grantPurchase(ana, 'bienvenue', 'pay_1')).toBe(false); // même paiement confirmé deux fois
    expect(w.view(ana).chips).toBe(1_100);
    expect(w.shop(ana).offers.map((o) => o.id)).not.toContain('bienvenue');
    await rejects(() => w.checkPurchase(ana, 'bienvenue', true), 'BAD_REQUEST');
    w.grantPurchase(ana, 'mallette', 'pay_2'); // 19,99 €
    w.grantPurchase(ana, 'mallette', 'pay_3'); // 39,98 € + 0,99 €
    await rejects(() => w.checkPurchase(ana, 'coffret', true), 'RATE_LIMITED'); // 9,99 € dépasserait 50 €
    expect(w.checkPurchase(ana, 'pile', true).chips).toBe(500);
    t += 7 * 24 * 3_600_000 + 1;
    expect(w.checkPurchase(ana, 'coffret', true).chips).toBe(3_000);
  });
});

describe('comptes : routes HTTP et socket de présence', () => {
  async function start() {
    const { accounts } = service();
    const scheduler = new ManualScheduler();
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler, accounts: { isReservedNickname: (n) => accounts.isReservedNickname(n), onGameFinished: (g) => accounts.recordGame(g) } });
    const server: BuiltServer = await buildServer({ manager, accounts, onError: () => undefined, httpRateLimit: { max: 100, windowMs: 60_000 } });
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    cleanup.push(() => server.close());
    const addr = server.app.server.address();
    const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    return { server, url, manager };
  }

  it('inscription, /me, création de salle connectée (pseudo du compte), favoris, déconnexion', async () => {
    const { server, manager } = await start();
    const inj = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: unknown) =>
      server.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

    const reg = await inj('POST', '/auth/register', undefined, { nickname: 'Ana', email: 'ana@x.fr', password: 'motdepasse1', avatar: 'renard' });
    expect(reg.statusCode).toBe(201);
    const { token } = reg.json() as { token: string };
    expect((await inj('GET', '/me')).statusCode).toBe(401);
    expect((await inj('GET', '/me', token)).json()).toMatchObject({ nickname: 'Ana', avatar: 'renard' });
    expect((await inj('GET', '/auth/config')).json()).toEqual({ passwordRecovery: true });

    const room = (await inj('POST', '/rooms', token, { name: 'T', maxPlayers: 3, targetPoints: 1, stakeChips: 0, nickname: 'Autre' })).json() as { code: string; playerId: string };
    expect(manager.view(room.code, room.playerId).players[0]).toMatchObject({ nickname: 'Ana', avatar: 'renard', registered: true });
    expect((await inj('POST', `/rooms/${room.code}/join`, undefined, { nickname: 'ANA' })).json()).toMatchObject({ error: { code: 'NICKNAME_RESERVED' } });

    await inj('POST', '/auth/register', undefined, { nickname: 'Bea', email: 'bea@x.fr', password: 'motdepasse1' });
    expect((await inj('GET', '/users?q=Be', token)).json()).toMatchObject({ users: [{ nickname: 'Bea' }] });
    expect((await inj('POST', '/me/favorites', token, { nickname: 'Bea' })).statusCode).toBe(201);
    expect((await inj('GET', '/me/favorites', token)).json()).toMatchObject({ favorites: [{ nickname: 'Bea', online: false }] });
    expect((await inj('PATCH', '/me', token, { nickname: 'Anaïs' })).json()).toMatchObject({ nickname: 'Anaïs' });
    expect((await inj('GET', '/me/stats', token)).json()).toMatchObject({ games: 0, variants: [] });
    expect((await inj('GET', '/me/bankroll', token)).json()).toMatchObject({ totalChips: 0, series: [] });

    const inv = (await inj('GET', '/me/invites', token)).json() as { code: string };
    expect((await inj('GET', `/invites/${inv.code}`)).json()).toMatchObject({ inviter: { nickname: 'Anaïs' } });
    expect((await inj('POST', '/me/invites', token, { email: 'zoe@x.fr' })).statusCode).toBe(201);
    expect((await inj('GET', '/invites/zzzzzzzz')).statusCode).toBe(404);

    await inj('POST', '/auth/logout', token);
    expect((await inj('GET', '/me', token)).statusCode).toBe(401);
  });

  it('limite les tentatives de connexion par adresse', async () => {
    const { accounts } = service();
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler() });
    const server = await buildServer({ manager, accounts, onError: () => undefined, authRateLimit: { max: 3, windowMs: 60_000 } });
    cleanup.push(() => server.close());
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await server.app.inject({ method: 'POST', url: '/auth/login', payload: { login: 'x', password: 'y' } })).statusCode);
    expect(codes).toEqual([401, 401, 401, 429]);
  });

  it('socket de présence : un favori qui se connecte est signalé en direct', async () => {
    const { server, url } = await start();
    const reg = async (nickname: string) =>
      ((await server.app.inject({ method: 'POST', url: '/auth/register', payload: { nickname, email: `${nickname}@x.fr`, password: 'motdepasse1' } })).json() as { token: string }).token;
    const ana = await reg('Ana');
    const bea = await reg('Bea');
    await server.app.inject({ method: 'POST', url: '/me/favorites', payload: { nickname: 'Bea' }, headers: { authorization: `Bearer ${ana}` } });

    const open = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(`${url}/compte`, { auth: { token }, transports: ['websocket'], forceNew: true });
        cleanup.push(() => void s.close());
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const anaSocket = await open(ana);
    const got = new Promise<unknown>((resolve) => anaSocket.on('favori:en-ligne', resolve));
    await new Promise((r) => setTimeout(r, 30));
    await open(bea);
    expect(await got).toMatchObject({ nickname: 'Bea' });

    const bad = connect(`${url}/compte`, { auth: { token: 'faux' }, transports: ['websocket'], forceNew: true });
    cleanup.push(() => void bad.close());
    expect(await new Promise((resolve) => bad.on('fatal', resolve))).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
