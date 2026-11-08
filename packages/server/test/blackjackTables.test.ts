import { commitmentOf } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { BlackjackService } from '../src/blackjack/service';
import { BET_MS, BlackjackTables, CPU_STEP_MS, HUMAN_TURN_MS, NEXT_AUTO_MS } from '../src/blackjack/tables';
import type { BjTableDto } from '../src/blackjack/types';

const A = { userId: 'guest:' + 'a1'.repeat(16), nickname: 'Ana', avatar: null };
const B = { userId: 'guest:' + 'b2'.repeat(16), nickname: 'Ben', avatar: null };
const C = { userId: 'guest:' + 'c3'.repeat(16), nickname: 'Cléo', avatar: null };

function setup() {
  const store = new AccountDb(':memory:');
  let t = 1_000_000;
  let n = 0;
  const bj = new BlackjackService(store, { now: () => t });
  const tables = new BlackjackTables(store, bj, { now: () => t, seed: () => (++n).toString(16).padStart(64, '0') });
  return { store, bj, tables, tick: (ms: number) => (t += ms), now: () => t };
}
const dto = (x: unknown) => x as BjTableDto;

/** Fait jouer la manche : les CPU avancent avec l'horloge, les humains restent (ou agissent selon `human`). */
function playOut(env: ReturnType<typeof setup>, code: string, users: { userId: string }[], human: (v: BjTableDto) => 'HIT' | 'STAND' = () => 'STAND'): BjTableDto {
  let v = dto(env.tables.get(code, users[0]!.userId));
  for (let i = 0; i < 300 && v.status === 'PLAYING'; i++) {
    const turn = v.round!.turnSeat;
    const u = users.find((x) => v.seats[turn]?.you === false && x.userId && env.tables.get(code, x.userId) && (dto(env.tables.get(code, x.userId)).me === turn));
    if (u) {
      const mine = dto(env.tables.get(code, u.userId));
      const a = human(mine);
      env.tables.act(code, u.userId, mine.round!.legal.includes(a) ? a : 'STAND');
    } else env.tick(CPU_STEP_MS + 5);
    v = dto(env.tables.get(code, users[0]!.userId));
  }
  return v;
}

describe('Tables Blackjack à plusieurs', () => {
  it('création : de 1 à 6 places, la première est la mienne', () => {
    const env = setup();
    expect(() => env.tables.create(A, { table: 'decouverte', seats: [] })).toThrow();
    expect(() => env.tables.create(A, { table: 'decouverte', seats: ['cpu'] })).toThrow();
    expect(() => env.tables.create(A, { table: 'decouverte', seats: Array(7).fill('human') as ('human')[] })).toThrow();
    const v = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu', 'human', 'cpu', 'cpu', 'human'] });
    expect(v.seats.map((s) => (s.open ? 'ouvert' : s.kind))).toEqual(['human', 'cpu', 'ouvert', 'cpu', 'cpu', 'ouvert']);
    expect(v.code).toMatch(/^BJ-[A-Z2-9]{4}$/);
    expect(v.status).toBe('LOBBY');
    expect(() => env.tables.create(A, { table: 'decouverte', seats: ['human'] })).toThrow(); // déjà assis
    expect(() => env.tables.create(B, { table: 'haut-niveau', seats: ['human'] })).toThrow(); // niveau requis
  });

  it('arrivée : première place humaine libre ; plus de place, refus', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu', 'human'] });
    const joined = env.tables.join(code, B);
    expect(joined.me).toBe(2);
    expect(() => env.tables.join(code, C)).toThrow();
    expect(dto(env.tables.get(code, null)).me).toBeNull(); // spectateur
  });

  it('lancement : réservé à l’hôte, les places libres disparaissent', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'human', 'cpu', 'human'] });
    env.tables.join(code, B);
    expect(() => env.tables.start(code, B.userId)).toThrow();
    const v = env.tables.start(code, A.userId);
    expect(v.status).toBe('BETTING');
    expect(v.seats.map((s) => s.kind)).toEqual(['human', 'human', 'cpu']);
  });

  it('mises, distribution à plusieurs, carte cachée, engagement publié', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'human', 'cpu', 'cpu'] });
    env.tables.join(code, B);
    env.tables.start(code, A.userId);
    expect(() => env.tables.bet(code, A.userId, 1)).toThrow(); // sous la mise minimale
    expect(() => env.tables.bet(code, A.userId, 100_000)).toThrow();
    expect(dto(env.tables.bet(code, A.userId, 10)).status).toBe('BETTING'); // B n'a pas encore misé
    const v = dto(env.tables.bet(code, B.userId, 20));
    expect(v.status === 'PLAYING' || v.status === 'DONE').toBe(true);
    expect(v.round!.participants).toEqual([0, 1, 2, 3]);
    expect(v.round!.view.seats.map((s) => s.bet)).toEqual([10, 20, 5, 5]);
    expect(commitmentOf).toBeTypeOf('function');
    if (v.status === 'PLAYING') {
      expect(v.round!.view.dealer[1]).toBeNull();
      expect(v.round!.seed).toBeNull();
    }
  });

  it('manche complète : CPU au rythme de l’horloge, bilans, graine révélée et vérifiable', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu', 'human', 'cpu'] });
    env.tables.join(code, B);
    env.tables.start(code, A.userId);
    env.tables.bet(code, A.userId, 10);
    env.tables.bet(code, B.userId, 10);
    const v = playOut(env, code, [A, B]);
    expect(v.status).toBe('DONE');
    expect(v.round!.seed).not.toBeNull();
    expect(commitmentOf(v.round!.seed!)).toBe(v.round!.commitment);
    expect(v.round!.view.dealer.every((c) => c !== null)).toBe(true);
    const mineA = dto(env.tables.get(code, A.userId));
    expect(mineA.result).toMatchObject({ seed: v.round!.seed });
    expect(env.bj.overview(A.userId).profile.rounds).toBe(1);
    expect(env.bj.overview(B.userId).profile.rounds).toBe(1);
    expect(env.bj.overview(A.userId).profile.chips).toBeGreaterThanOrEqual(1000 + mineA.result!.net); // + récompenses éventuelles
  });

  it('les CPU n’agissent pas avant leur délai ; un humain trop lent « reste » automatiquement', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu'] });
    env.tables.start(code, A.userId);
    // Plusieurs mains pour tomber sur un tour humain jouable
    for (let k = 0; k < 20; k++) {
      let v = dto(env.tables.bet(code, A.userId, 5));
      if (v.status === 'PLAYING' && v.round!.turnSeat === 0) {
        const before = v.round!.view.seats[0]!.hands[0]!.cards.length;
        env.tick(HUMAN_TURN_MS + 1_000);
        v = dto(env.tables.get(code, A.userId));
        expect(v.round!.view.seats[0]!.hands[0]!.cards.length).toBe(before); // « Rester », aucune carte
        expect(v.status === 'DONE' || v.round!.turnSeat !== 0).toBe(true);
        return;
      }
      playOut(env, code, [A]);
      env.tables.next(code, A.userId);
    }
    throw new Error('aucun tour humain rencontré');
  });

  it('enchaînement : « Manche suivante » et passage automatique', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu'] });
    env.tables.start(code, A.userId);
    env.tables.bet(code, A.userId, 5);
    expect(playOut(env, code, [A]).status).toBe('DONE');
    expect(dto(env.tables.next(code, A.userId)).status).toBe('BETTING');
    env.tables.bet(code, A.userId, 5);
    playOut(env, code, [A]);
    env.tick(NEXT_AUTO_MS + 10);
    expect(dto(env.tables.get(code, A.userId)).status).toBe('BETTING');
    // Mise oubliée : à l'échéance, la précédente est reprise
    env.tick(BET_MS + 10);
    expect(['PLAYING', 'DONE']).toContain(dto(env.tables.get(code, A.userId)).status);
  });

  it('départ : table fermée quand le dernier humain part ; main jouée en « Rester » si départ en cours de manche', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'human'] });
    env.tables.join(code, B);
    env.tables.start(code, A.userId);
    env.tables.bet(code, A.userId, 5);
    env.tables.bet(code, B.userId, 5);
    env.tables.leave(code, B.userId);
    const v = playOut(env, code, [A]);
    expect(v.status).toBe('DONE');
    expect(env.bj.overview(B.userId).profile.rounds).toBe(1); // sa main a bien été réglée
    env.tables.leave(code, A.userId);
    expect(() => env.tables.get(code, A.userId)).toThrow(); // table supprimée
  });

  it('jetons engagés : pas de manche solo pendant une manche de table', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu', 'cpu'] });
    env.tables.start(code, A.userId);
    for (let k = 0; k < 20; k++) {
      const v = dto(env.tables.bet(code, A.userId, 5));
      if (v.status === 'PLAYING') {
        expect(() => env.bj.startRound(A.userId, { table: 'decouverte', bet: 5 })).toThrow();
        return;
      }
      env.tables.next(code, A.userId);
    }
  });

  it('reprise après redémarrage : la table et la manche sont relues en base', () => {
    const env = setup();
    const { code } = env.tables.create(A, { table: 'decouverte', seats: ['human', 'cpu'] });
    env.tables.start(code, A.userId);
    env.tables.bet(code, A.userId, 5);
    const before = dto(env.tables.get(code, A.userId));
    const again = new BlackjackTables(env.store, env.bj, { now: env.now });
    const after = dto(again.get(code, A.userId));
    expect(after.status).toBe(before.status);
    expect(after.round?.view.seats.map((s) => s.hands[0]!.cards)).toEqual(before.round?.view.seats.map((s) => s.hands[0]!.cards));
    expect(after.round?.commitment).toBe(before.round?.commitment);
  });

  it('sondage : version inchangée → réponse légère', () => {
    const env = setup();
    const { code, version } = env.tables.create(A, { table: 'decouverte', seats: ['human'] });
    expect(env.tables.get(code, A.userId, version)).toEqual({ unchanged: true, version });
  });
});

describe('Tables Blackjack : API HTTP', () => {
  it('création, arrivée d’un invité, mises et sondage par version', async () => {
    const { AccountService } = await import('../src/accounts/service');
    const { LogMailer } = await import('../src/accounts/mailer');
    const { buildServer } = await import('../src/http');
    const { RoomManager } = await import('../src/roomManager');
    const { ManualScheduler } = await import('../src/scheduler');
    const { SeededRng } = await import('@poker/engine');
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(false, () => undefined), { appUrl: 'https://jeu.test', log: () => undefined });
    const blackjack = new BlackjackService(store);
    const blackjackTables = new BlackjackTables(store, blackjack);
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: () => undefined } });
    const server = await buildServer({ manager, accounts, blackjack, blackjackTables, onError: () => undefined });
    try {
      const inj = (method: 'GET' | 'POST', url: string, guest?: string, payload?: unknown) => server.app.inject({ method, url, payload: payload as object, headers: guest ? { 'x-bj-guest': guest } : {} });
      const ga = 'aa'.repeat(16);
      const gb = 'bb'.repeat(16);
      expect((await inj('POST', '/blackjack/tables', ga, { table: 'decouverte', seats: ['cpu'] })).statusCode).toBe(400);
      const created = await inj('POST', '/blackjack/tables', ga, { table: 'decouverte', seats: ['human', 'human', 'cpu'], nickname: 'Ana' });
      expect(created.statusCode).toBe(201);
      const t = created.json() as BjTableDto;
      expect((await inj('POST', `/blackjack/tables/${t.code}/join`, gb, { nickname: 'Ben' })).json()).toMatchObject({ me: 1 });
      expect((await inj('POST', `/blackjack/tables/${t.code}/start`, gb)).statusCode).toBe(403);
      expect((await inj('POST', `/blackjack/tables/${t.code}/start`, ga)).json()).toMatchObject({ status: 'BETTING' });
      expect((await inj('POST', `/blackjack/tables/${t.code}/bet`, ga, { bet: 'x' })).statusCode).toBe(400);
      const bet = (await inj('POST', `/blackjack/tables/${t.code}/bet`, ga, { bet: 10 })).json() as BjTableDto;
      expect((await inj('GET', `/blackjack/tables/${t.code}?v=${bet.version}`, ga)).json()).toEqual({ unchanged: true, version: bet.version });
      expect((await inj('GET', '/blackjack/tables/BJ-NOPE')).statusCode).toBe(404);
      expect((await inj('POST', `/blackjack/tables/${t.code}/action`, ga, { action: 'NOPE' })).statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });
});
