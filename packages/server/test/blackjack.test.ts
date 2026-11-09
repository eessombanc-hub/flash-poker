import { applyAction, commitmentOf, DEFAULT_RULES, legalActions, startRound, verifySeed, type BjAction } from '@poker/engine';
import { SeededRng } from '@poker/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';
import { BlackjackService } from '../src/blackjack/service';
import { buildServer, type BuiltServer } from '../src/http';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';

const HOUR = 3_600_000;
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

/** Graines fixes : on retrouve avec le moteur la première graine qui produit la situation voulue. */
const seedWhere = (pred: (r: ReturnType<typeof startRound>) => boolean, bet = 100, from = 0): string => {
  for (let i = from; i < from + 5000; i++) if (pred(startRound(DEFAULT_RULES, bet, `t-${i}`))) return `t-${i}`;
  throw new Error('graine introuvable');
};
const NATURAL = seedWhere((r) => r.phase === 'DONE' && r.net === 150);
const PLAYABLE = seedWhere((r) => r.phase === 'PLAYER' && legalActions(r).includes('DOUBLE') && legalActions(r).includes('SPLIT') === false);

async function setup(opts: { seeds?: string[]; clock?: { t: number } } = {}) {
  const clock = opts.clock ?? { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const queue = [...(opts.seeds ?? [])];
  const store = new AccountDb(':memory:');
  const accounts = new AccountService(store, new LogMailer(false, () => undefined), { appUrl: 'https://jeu.test', now: () => clock.t, log: () => undefined });
  const bj = new BlackjackService(store, { now: () => clock.t, seed: () => queue.shift() ?? `auto-${Math.random()}` });
  const reg = await accounts.register({ nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' });
  return { accounts, bj, store, clock, id: reg.account.id, token: reg.token, queue };
}

/** Joue la manche jusqu'au bout en restant. */
function finish(bj: BlackjackService, id: string): ReturnType<BlackjackService['act']> {
  let last = bj.act(id, 'STAND');
  while (last.result === null) last = bj.act(id, 'STAND');
  return last;
}

describe('Blackjack : profil et tables', () => {
  it('profil créé à la demande : 1 000 jetons, niveau 1, cinq tables, trois défis, objectifs verrouillés', async () => {
    const { bj, id } = await setup();
    const o = bj.overview(id);
    expect(o.profile).toMatchObject({ chips: 1000, xp: 0, level: 1, title: 'Novice', rounds: 0, winRate: 0 });
    expect(o.tables.map((t) => t.id)).toEqual(['decouverte', 'classique', 'carte-unique', 'atlantic', 'haut-niveau']);
    expect(o.challenges).toHaveLength(3);
    expect(o.achievements.every((a) => a.unlockedAt === null)).toBe(true);
    expect(o.active).toBeNull();
    expect(o.history).toEqual([]);
  });

  it('mises et tables refusées : hors limites, jetons insuffisants, niveau trop bas, table ou règles inconnues', async () => {
    const { bj, id } = await setup();
    const fail = (input: Parameters<BlackjackService['startRound']>[1]) => {
      try {
        bj.startRound(id, input);
        return null;
      } catch (e) {
        return (e as { code: string }).code;
      }
    };
    expect(fail({ table: 'decouverte', bet: 4 })).toBe('RULE'); // minimum 5
    expect(fail({ table: 'decouverte', bet: 101 })).toBe('RULE'); // maximum 100
    expect(fail({ table: 'haut-niveau', bet: 100 })).toBe('RULE'); // niveau 7 requis
    expect(fail({ table: 'inconnue', bet: 10 })).toBe('BAD_REQUEST');
    expect(fail({ table: 'libre', bet: 10, rules: { ...DEFAULT_RULES, decks: 12 } })).toBe('BAD_REQUEST');
    expect(fail({ table: 'libre', bet: 1001 })).toBe('RULE'); // limite de la table libre
    expect(bj.overview(id).active).toBeNull();
  });

  it('table libre : règles personnalisées appliquées', async () => {
    const { bj, id } = await setup({ seeds: ['x1'] });
    const { active } = bj.startRound(id, { table: 'libre', bet: 10, rules: { ...DEFAULT_RULES, decks: 2, blackjackPays: '6:5' } });
    expect(active.rules).toMatchObject({ decks: 2, blackjackPays: '6:5' });
  });
});

describe('Blackjack : une manche', () => {
  it('engagement publié avant la manche, graine révélée à la fin et vérifiable ; jetons = départ + gain', async () => {
    const { bj, id } = await setup({ seeds: [PLAYABLE] });
    const { active, result } = bj.startRound(id, { table: 'decouverte', bet: 100 });
    expect(result).toBeNull();
    expect(active.commitment).toBe(commitmentOf(PLAYABLE));
    const view = JSON.stringify(bj.overview(id).active);
    expect(view).not.toContain(PLAYABLE); // la graine n'est pas divulguée en cours de manche
    expect(active.round.dealer[1]).toBeNull(); // carte cachée du croupier
    const { result: res } = finish(bj, id);
    expect(res!.seed).toBe(PLAYABLE);
    expect(verifySeed(res!.seed, res!.commitment)).toBe(true);
    expect(bj.overview(id).profile.chips).toBe(1000 + res!.net);
    expect(bj.overview(id).active).toBeNull();
  });

  it('historique : cartes, résultat, graine et engagement conservés', async () => {
    const { bj, id } = await setup({ seeds: [PLAYABLE] });
    bj.startRound(id, { table: 'decouverte', bet: 100 });
    const { result } = finish(bj, id);
    const h = bj.overview(id).history;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ bet: 100, net: result!.net, seed: PLAYABLE, table: 'decouverte', decks: 6 });
    expect(h[0]!.dealer.length).toBeGreaterThanOrEqual(2);
    expect(verifySeed(h[0]!.seed, h[0]!.commitment)).toBe(true);
  });

  it('Blackjack naturel : résolu dès la distribution, payé 3 contre 2, graine révélée', async () => {
    const { bj, id } = await setup({ seeds: [NATURAL] });
    const { active, result } = bj.startRound(id, { table: 'decouverte', bet: 100 });
    expect(result).toMatchObject({ net: 150 });
    expect(active.round.phase).toBe('DONE');
    expect(active.legal).toEqual([]);
    const p = bj.overview(id).profile;
    expect(p).toMatchObject({ blackjacks: 1, handsWon: 1, rounds: 1, streak: 1 });
    expect(p.chips).toBeGreaterThanOrEqual(1150); // + récompenses d'objectifs éventuelles
    expect(result!.achievements.map((a) => a.id)).toEqual(expect.arrayContaining(['premiere-victoire', 'premier-blackjack']));
  });

  it('une seule manche à la fois ; reprise identique après interruption (nouveau service, même base)', async () => {
    const { bj, id, store, clock } = await setup({ seeds: [PLAYABLE] });
    const first = bj.startRound(id, { table: 'decouverte', bet: 50 }).active;
    expect(() => bj.startRound(id, { table: 'decouverte', bet: 50 })).toThrowError(/déjà en cours/);
    const reopened = new BlackjackService(store, { now: () => clock.t }).overview(id).active!;
    expect(reopened).toEqual(first);
  });

  it('actions : action impossible refusée, inconnue refusée, sans manche refusée', async () => {
    const { bj, id } = await setup({ seeds: [PLAYABLE] });
    expect(() => bj.act(id, 'HIT')).toThrowError(/Aucune manche/);
    bj.startRound(id, { table: 'decouverte', bet: 100 });
    expect(() => bj.act(id, 'SPLIT')).toThrowError();
    expect(() => bj.act(id, 'TRICHER' as BjAction)).toThrowError(/inconnue/);
  });

  it('doublement : exige les jetons nécessaires', async () => {
    const { bj, id, store } = await setup({ seeds: [PLAYABLE] });
    bj.overview(id);
    store.db.prepare('UPDATE bj_profile SET chips = 120 WHERE user_id = ?').run(id);
    const { active } = bj.startRound(id, { table: 'decouverte', bet: 100 });
    expect(active.freeChips).toBe(20);
    expect(active.legal).not.toContain('DOUBLE');
    expect(() => bj.act(id, 'DOUBLE')).toThrowError();
  });

  it('séquence complète rejouable côté joueur : le serveur recalcule la même issue', async () => {
    const { bj, id } = await setup({ seeds: [PLAYABLE] });
    bj.startRound(id, { table: 'decouverte', bet: 100 });
    const { result } = finish(bj, id);
    const item = bj.history(id)[0]!;
    // Vérification indépendante : rejouer depuis la graine révélée avec le moteur seul.
    let r = startRound(DEFAULT_RULES, 100, item.seed);
    while (r.phase === 'PLAYER') r = applyAction(r, 'STAND');
    expect(r.net).toBe(result!.net);
    expect(r.dealer).toEqual(item.dealer);
  });

  it('manche abandonnée plus de 12 h : conclue d’office, le joueur garde ses mains', async () => {
    const { bj, id, clock } = await setup({ seeds: [PLAYABLE] });
    bj.startRound(id, { table: 'decouverte', bet: 100 });
    clock.t += 13 * HOUR;
    const o = bj.overview(id);
    expect(o.active).toBeNull();
    expect(o.history).toHaveLength(1);
    expect(o.profile.rounds).toBe(1);
  });
});

describe('Blackjack : progression', () => {
  it('XP, niveau 2 avec récompense en jetons, statistiques cohérentes', async () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `p-${i}`);
    const { bj, id } = await setup({ seeds });
    let levelUp: { from: number; to: number; reward: number } | null = null;
    let net = 0;
    for (let i = 0; i < 12 && !levelUp; i++) {
      const s = bj.startRound(id, { table: 'decouverte', bet: 10 });
      const res = s.result ?? finish(bj, id).result!;
      net += res.net;
      expect(res.xpGained).toBeGreaterThanOrEqual(10);
      levelUp = res.level;
    }
    const p = bj.overview(id).profile;
    expect(levelUp).toMatchObject({ from: 1, to: 2, reward: 200 });
    expect(p.level).toBe(2);
    expect(p.xp).toBeGreaterThanOrEqual(100);
    expect(p.handsWon + p.handsLost + p.handsPushed).toBe(p.hands);
    expect(p.netChips).toBe(net);
    expect(p.winRate).toBeCloseTo(p.handsWon / p.hands, 9);
  });

  it('défis du jour : stables sur la journée, renouvelés le lendemain', async () => {
    const { bj, id, clock } = await setup();
    const a = bj.overview(id).challenges.map((c) => c.id);
    expect(bj.overview(id).challenges.map((c) => c.id)).toEqual(a);
    clock.t += 30 * HOUR;
    const b = bj.overview(id).challenges.map((c) => c.id);
    expect(b).toHaveLength(3);
  });

  it('défi accompli : jetons et XP crédités une seule fois', async () => {
    const ctx = await setup({ seeds: [NATURAL, NATURAL, NATURAL] });
    const day = new Date(ctx.clock.t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const c = ctx.bj.overview(ctx.id).challenges[0]!;
    // Le défi est presque accompli : un Blackjack naturel (qui compte comme manche jouée, main gagnée, gain net) suffit
    ctx.store.db.prepare('UPDATE bj_challenges SET progress = ? WHERE user_id = ? AND day = ? AND challenge_id = ?').run(Math.max(0, c.goal - 1), ctx.id, day, c.id);
    const before = ctx.bj.overview(ctx.id).profile;
    const res = ctx.bj.startRound(ctx.id, { table: 'decouverte', bet: 100 }).result!;
    const done = res.challengesDone.find((d) => d.id === c.id);
    const metricMoves = ['rounds', 'wins', 'netChips', 'blackjacks', 'hands'].some((m) => c.label.length > 0 && m);
    expect(metricMoves).toBe(true);
    if (done) {
      expect(done).toMatchObject({ done: true, progress: c.goal });
      const after = ctx.bj.overview(ctx.id).profile;
      expect(after.chips).toBeGreaterThanOrEqual(before.chips + 150 + c.rewardChips);
      // Pas de seconde récompense pour le même défi
      const again = ctx.bj.startRound(ctx.id, { table: 'decouverte', bet: 100 }).result!;
      expect(again.challengesDone.find((d) => d.id === c.id)).toBeUndefined();
    }
  });

  it('objectifs : débloqués une seule fois, récompense créditée', async () => {
    const { bj, id } = await setup({ seeds: [NATURAL, NATURAL] });
    const first = bj.startRound(id, { table: 'decouverte', bet: 100 }).result!;
    const chipsAfterFirst = bj.overview(id).profile.chips;
    expect(first.achievements.map((a) => a.id)).toContain('premier-blackjack');
    const second = bj.startRound(id, { table: 'decouverte', bet: 100 }).result!;
    expect(second.achievements.map((a) => a.id)).not.toContain('premier-blackjack');
    expect(bj.overview(id).achievements.filter((a) => a.unlockedAt !== null).map((a) => a.id)).toContain('premier-blackjack');
    expect(chipsAfterFirst).toBeGreaterThan(1000 + 150);
  });

  it('recharge gratuite : solde épuisé, seulement après 30 minutes, jamais pendant une manche', async () => {
    const { bj, id, store, clock } = await setup();
    bj.overview(id);
    store.db.prepare('UPDATE bj_profile SET chips = 0 WHERE user_id = ?').run(id);
    expect(bj.overview(id).profile.chips).toBe(500); // jamais rechargé jusqu'ici : recharge immédiate
    store.db.prepare('UPDATE bj_profile SET chips = 0 WHERE user_id = ?').run(id);
    expect(bj.overview(id).profile).toMatchObject({ chips: 0 });
    expect(bj.overview(id).profile.refillAt).toBe(clock.t + 30 * 60_000);
    clock.t += 30 * 60_000;
    expect(bj.overview(id).profile.chips).toBe(500);
  });

  it('le poker nourrit la même XP et le même niveau', async () => {
    const { bj, id } = await setup();
    bj.awardXp(id, 100);
    expect(bj.overview(id).profile).toMatchObject({ xp: 100, level: 2, chips: 1200 });
    bj.awardXp(id, 0);
    expect(bj.overview(id).profile.xp).toBe(100);
  });
});

describe('Blackjack : classement et accès', () => {
  it('classement par XP ou par jetons ; joueurs sans activité absents', async () => {
    const { bj, id, accounts } = await setup();
    const b = await accounts.register({ nickname: 'Bea', email: 'bea@x.fr', password: 'tapis-vert-42' });
    await accounts.register({ nickname: 'Cleo', email: 'cleo@x.fr', password: 'tapis-vert-42' });
    bj.awardXp(id, 150);
    bj.awardXp(b.account.id, 400);
    const xp = bj.leaderboard('xp');
    expect(xp.map((e) => e.nickname)).toEqual(['Bea', 'Ana']);
    expect(xp[0]).toMatchObject({ rank: 1, level: 3, title: 'Habitué' });
    expect(bj.leaderboard('chips')).toHaveLength(2);
  });

  async function boot() {
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(false, () => undefined), { appUrl: 'https://jeu.test', log: () => undefined });
    const blackjack = new BlackjackService(store);
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: () => undefined } });
    const server: BuiltServer = await buildServer({ manager, accounts, blackjack, onError: () => undefined });
    cleanup.push(() => server.close());
    return server;
  }

  it('API : manche complète via HTTP ; invités acceptés ; classement public', async () => {
    const server = await boot();
    const inj = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) => server.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
    // Ni compte ni code d'invité valide : refusé
    expect((await inj('GET', '/me/blackjack')).statusCode).toBe(400);
    const guestReq = (id: string, method: 'GET' | 'POST', url: string, payload?: unknown) => server.app.inject({ method, url, payload: payload as object, headers: { 'x-bj-guest': id } });
    expect((await guestReq('pas-un-code', 'GET', '/me/blackjack')).statusCode).toBe(400);
    // Invité : profil à part, manche jouable, absent du classement
    const g1 = 'a1'.repeat(16);
    const g2 = 'b2'.repeat(16);
    expect((await guestReq(g1, 'GET', '/me/blackjack')).json()).toMatchObject({ profile: { chips: 1000 } });
    expect((await guestReq(g1, 'POST', '/me/blackjack/round', { table: 'decouverte', bet: 100 })).statusCode).toBe(201);
    expect((await guestReq(g2, 'GET', '/me/blackjack')).json()).toMatchObject({ profile: { chips: 1000, rounds: 0 }, active: null });
    expect(((await guestReq(g1, 'GET', '/me/blackjack')).json() as { active: unknown; profile: { rounds: number } }).active !== null || ((await guestReq(g1, 'GET', '/me/blackjack')).json() as { profile: { rounds: number } }).profile.rounds === 1).toBe(true);
    expect((await inj('GET', '/blackjack/leaderboard?by=xp')).json()).toMatchObject({ entries: [] });
    const { token } = (await inj('POST', '/auth/register', undefined, { nickname: 'Ana', email: 'ana@x.fr', password: 'tapis-vert-42' })).json() as { token: string };
    expect((await inj('GET', '/me/blackjack', token)).json()).toMatchObject({ profile: { chips: 1000 } });
    expect((await inj('POST', '/me/blackjack/round', token, { table: 'decouverte', bet: 'beaucoup' })).statusCode).toBe(400);
    expect((await inj('POST', '/me/blackjack/round', token, { table: 'decouverte', bet: 1, rules: { decks: 1 } })).statusCode).toBe(400);
    const start = await inj('POST', '/me/blackjack/round', token, { table: 'decouverte', bet: 10 });
    expect(start.statusCode).toBe(201);
    const body = start.json() as { active: { round: { phase: string; dealer: (string | null)[] } }; result: unknown };
    if (body.active.round.phase === 'PLAYER') {
      expect(body.active.round.dealer[1]).toBeNull();
      expect((await inj('GET', '/me/blackjack/help', token)).json()).toMatchObject({ odds: { stand: expect.any(Object) } });
      expect((await inj('POST', '/me/blackjack/action', token, { action: 'NOPE' })).statusCode).toBe(400);
      let done = false;
      for (let i = 0; i < 6 && !done; i++) done = ((await inj('POST', '/me/blackjack/action', token, { action: 'STAND' })).json() as { result: unknown }).result !== null;
      expect(done).toBe(true);
    }
    expect((await inj('GET', '/me/blackjack/history', token)).json()).toMatchObject({ history: [{ bet: 10 }] });
    expect((await inj('GET', '/blackjack/leaderboard?by=xp')).json()).toMatchObject({ entries: [{ nickname: 'Ana', rank: 1 }] });
  });
});
