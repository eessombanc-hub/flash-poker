import { SeededRng, TableauGame, TURN_MS, verifyTableauReveal, tableauCommitment } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { BlackjackService } from '../src/blackjack/service';
import { GRACE_MS, TableauService, type TbGameDto } from '../src/tableau/service';
import { buildServer } from '../src/http';
import { AccountService } from '../src/accounts/service';

const A = { userId: 'guest:' + 'a1'.repeat(16), nickname: 'Ana', avatar: null };
const B = { userId: 'guest:' + 'b2'.repeat(16), nickname: 'Ben', avatar: null };
const C = { userId: 'guest:' + 'c3'.repeat(16), nickname: 'Cléo', avatar: null };

function setup(over: { seed?: () => string } = {}) {
  const store = new AccountDb(':memory:');
  let t = 5_000_000;
  let n = 0;
  const bj = new BlackjackService(store, { now: () => t });
  const tb = new TableauService(store, bj, { now: () => t, seed: over.seed ?? (() => (++n).toString(16).padStart(64, '0')), rng: new SeededRng(11), aiSims: 12, aiBudgetMs: 2000 });
  return { store, bj, tb, tick: (ms: number) => (t += ms), now: () => t };
}
type Env = ReturnType<typeof setup>;

/** Joue toute la partie d'entraînement : le joueur joue colonne la plus à gauche, l'IA joue à l'horloge. */
function finishTraining(env: Env, code: string, who: { userId: string }): TbGameDto {
  let v = env.tb.get(code, who.userId);
  for (let i = 0; i < 400 && v.status === 'playing'; i++) {
    if (v.view!.turn === v.you) v = env.tb.place(code, who.userId, v.view!.legal[0]!);
    else {
      env.tick(5_000);
      v = env.tb.get(code, who.userId);
    }
  }
  return v;
}

describe('Tableau — entraînement contre l’IA', () => {
  it('création : partie en cours, engagement publié, rien de caché', () => {
    const env = setup();
    const v = env.tb.create(A, { mode: 'training', level: 'expert' });
    expect(v.code).toMatch(/^TB-[A-Z2-9]{4}$/);
    expect(v.status).toBe('playing');
    expect(v.players[1]).toMatchObject({ kind: 'cpu', level: 'expert' });
    expect(v.commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(v.reveal).toBeNull();
    expect(v.result).toBeNull();
    const json = JSON.stringify(v);
    expect(json).not.toContain('"seed"');
  });

  it('partie complète contre le robot : 20 coups chacun, résultat, graine révélée et vérifiable', () => {
    const env = setup();
    const c = env.tb.create(A, { mode: 'training', level: 'intermediate' });
    const v = finishTraining(env, c.code, A);
    expect(v.status).toBe('finished');
    expect(v.view!.placed).toEqual([20, 20]);
    expect(v.result!.score[0] + v.result!.score[1] + v.result!.ties).toBe(5);
    expect(v.winner).toBe(v.result!.winner);
    expect(verifyTableauReveal(v.reveal!)).toBe(true);
    expect(v.reveal!.commitment).toBe(c.commitment);
    expect(tableauCommitment(v.reveal!.seed)).toBe(c.commitment);
    // les cinq colonnes de chacun sont complètes
    for (const side of v.view!.columns) expect(side.every((col) => col.length === 5)).toBe(true);
  });

  it('chaque niveau d’IA mène une partie à son terme', () => {
    for (const level of ['beginner', 'intermediate', 'expert'] as const) {
      const env = setup();
      const c = env.tb.create(A, { mode: 'training', level });
      expect(finishTraining(env, c.code, A).status).toBe('finished');
    }
  });

  it('l’IA joue avec un délai de réflexion, pas instantanément', () => {
    const env = setup();
    let c = env.tb.create(A, { mode: 'training', level: 'beginner' });
    // trouve une graine où l'IA commence : sinon on joue un coup
    if (c.view!.turn === c.you) c = env.tb.place(c.code, A.userId, 0);
    expect(c.view!.turn).not.toBe(c.you);
    const placed = c.view!.placed.reduce((x, y) => x + y, 0);
    expect(env.tb.get(c.code, A.userId).view!.placed.reduce((x, y) => x + y, 0)).toBe(placed);
    env.tick(5_000);
    expect(env.tb.get(c.code, A.userId).view!.turn).toBe(c.you);
  });

  it('la vue ne révèle ni le paquet de l’IA ni la carte qu’elle va piocher', () => {
    const env = setup();
    const c = env.tb.create(A, { mode: 'training', level: 'expert' });
    const row = env.store.db.prepare('SELECT data FROM tb_game WHERE code = ?').get(c.code) as { data: string };
    const game = new TableauGame((JSON.parse(row.data) as { seed: string }).seed);
    const json = JSON.stringify(env.tb.get(c.code, A.userId));
    for (const card of game.deal.deck[1]!) expect(json.includes(`"${card}"`)).toBe(false);
    for (const card of game.deal.deck[0]!.slice(1)) expect(json.includes(`"${card}"`)).toBe(false);
  });

  it('hors tour, colonne invalide ou pleine : refusé', () => {
    const env = setup();
    let c = env.tb.create(A, { mode: 'training', level: 'beginner' });
    if (c.view!.turn !== c.you) {
      expect(() => env.tb.place(c.code, A.userId, 0)).toThrow();
      env.tick(5_000);
      c = env.tb.get(c.code, A.userId);
    }
    expect(() => env.tb.place(c.code, A.userId, 7)).toThrow();
    expect(() => env.tb.place(c.code, B.userId, 0)).toThrow(/participez/);
  });

  it('colonne pleine refusée et inchangée', () => {
    const env = setup();
    let v = env.tb.create(A, { mode: 'training', level: 'beginner' });
    for (let i = 0; i < 400 && v.view!.columns[v.you]![0]!.length < 5; i++) {
      if (v.view!.turn === v.you) v = env.tb.place(v.code, A.userId, 0);
      else {
        env.tick(5_000);
        v = env.tb.get(v.code, A.userId);
      }
    }
    while (v.view!.turn !== v.you) {
      env.tick(5_000);
      v = env.tb.get(v.code, A.userId);
    }
    expect(v.view!.legal).not.toContain(0);
    expect(() => env.tb.place(v.code, A.userId, 0)).toThrow(/complète/);
    expect(env.tb.get(v.code, A.userId).view!.columns[v.you]![0]).toHaveLength(5);
  });

  it('délai de 30 s dépassé : placement automatique (première colonne libre), partie qui continue', () => {
    const env = setup();
    let v = env.tb.create(A, { mode: 'training', level: 'beginner' });
    while (v.view!.turn !== v.you) {
      env.tick(5_000);
      v = env.tb.get(v.code, A.userId);
    }
    const before = v.view!.placed[v.you];
    expect(v.deadline).toBeGreaterThan(env.now());
    expect(v.deadline! - env.now()).toBeLessThanOrEqual(TURN_MS);
    env.tick(TURN_MS + GRACE_MS + 10);
    const after = env.tb.get(v.code, A.userId);
    expect(after.view!.placed[v.you]).toBe(before! + 1);
    expect(after.lastMove === null).toBe(false);
  });

  it('entraînement : après 3 délais manqués la partie est mise en pause puis reprend au retour du joueur', () => {
    const env = setup();
    let v = env.tb.create(A, { mode: 'training', level: 'beginner' });
    env.tick(10 * 60_000);
    v = env.tb.get(v.code, A.userId);
    expect(v.status).toBe('playing');
    expect(v.paused).toBe(true);
    const placed = v.view!.placed;
    env.tick(60 * 60_000);
    // retour : la pause est levée sur une requête, et le joueur dispose d'un délai complet
    const back = env.tb.get(v.code, A.userId);
    expect(back.paused).toBe(false);
    expect(back.view!.placed).toEqual(placed);
  });

  it('reprise : après redémarrage du service, la partie est rejouée à l’identique', () => {
    const env = setup();
    let v = env.tb.create(A, { mode: 'training', level: 'intermediate' });
    for (let i = 0; i < 8; i++) {
      if (v.view!.turn === v.you) v = env.tb.place(v.code, A.userId, v.view!.legal.at(-1)!);
      else {
        env.tick(5_000);
        v = env.tb.get(v.code, A.userId);
      }
    }
    const fresh = new TableauService(env.store, env.bj, { now: env.now, rng: new SeededRng(3) });
    const r = fresh.get(v.code, A.userId);
    expect(r.view!.columns).toEqual(v.view!.columns);
    expect(r.view!.yourCard).toBe(v.view!.yourCard);
    expect(fresh.activeCode(A.userId)).toMatchObject({ code: v.code, mode: 'training' });
  });

  it('une seule partie en cours : une nouvelle partie d’entraînement remplace l’ancienne', () => {
    const env = setup();
    const a = env.tb.create(A, { mode: 'training', level: 'beginner' });
    const b = env.tb.create(A, { mode: 'training', level: 'expert' });
    expect(b.code).not.toBe(a.code);
    expect(() => env.tb.get(a.code, A.userId)).toThrow();
    expect(env.tb.activeCode(A.userId)!.code).toBe(b.code);
  });

  it('conseil pédagogique et abandon', () => {
    const env = setup();
    let v = env.tb.create(A, { mode: 'training', level: 'beginner' });
    while (v.view!.turn !== v.you) {
      env.tick(5_000);
      v = env.tb.get(v.code, A.userId);
    }
    const adv = env.tb.advice(v.code, A.userId);
    expect(v.view!.legal).toContain(adv.col);
    expect(adv.text.length).toBeGreaterThan(10);
    expect(env.tb.leave(v.code, A.userId)).toEqual({ left: true, forfeit: false });
    expect(env.tb.activeCode(A.userId)).toBeNull();
  });

  it('l’XP est créditée une seule fois aux comptes (pas aux invités)', () => {
    const env = setup();
    const c = env.tb.create(A, { mode: 'training', level: 'beginner' });
    finishTraining(env, c.code, A);
    env.tb.get(c.code, A.userId);
    env.tb.get(c.code, A.userId);
    // invités : aucune ligne de profil créée par l'XP du Tableau
    expect(env.store.db.prepare('SELECT COUNT(*) AS n FROM bj_profile WHERE user_id = ?').get(A.userId)).toMatchObject({ n: 0 });
  });
});

describe('Tableau — partie amicale (code d’invitation)', () => {
  function started(env: Env) {
    const c = env.tb.create(A, { mode: 'friendly' });
    const j = env.tb.join(c.code, B);
    return { code: c.code, j };
  }
  /** Fait jouer `who` selon `pick`, l'autre joueur à tour de rôle ; renvoie les deux dernières vues. */
  function playBoth(env: Env, code: string, pick: (v: TbGameDto) => number) {
    let a = env.tb.get(code, A.userId);
    let b = env.tb.get(code, B.userId);
    for (let i = 0; i < 100 && a.status === 'playing'; i++) {
      const mover = a.view!.turn === a.you ? A : B;
      const v = mover === A ? a : b;
      const out = env.tb.place(code, mover.userId, pick(v));
      if (mover === A) a = out;
      else b = out;
      a = env.tb.get(code, A.userId);
      b = env.tb.get(code, B.userId);
    }
    return { a, b };
  }

  it('création en attente, l’ami rejoint avec le code, la partie démarre', () => {
    const env = setup();
    const c = env.tb.create(A, { mode: 'friendly' });
    expect(c.status).toBe('waiting');
    expect(c.view).toBeNull();
    expect(c.players[1]).toBeNull();
    const j = env.tb.join(c.code.toLowerCase(), B);
    expect(j.status).toBe('playing');
    expect(j.you).toBe(1);
    expect(j.players.map((p) => p!.nickname)).toEqual(['Ana', 'Ben']);
    expect(env.tb.get(c.code, A.userId).status).toBe('playing');
  });

  it('un troisième joueur est refusé ; code inconnu ; soi-même est idempotent', () => {
    const env = setup();
    const { code } = started(env);
    expect(() => env.tb.join(code, C)).toThrow(/n’accepte plus/);
    expect(() => env.tb.join('TB-ZZZZ', C)).toThrow(/introuvable/);
    expect(env.tb.join(code, A).you).toBe(0);
    expect(() => env.tb.get(code, C.userId)).toThrow(/participez/);
  });

  it('partie complète entre deux joueurs, alternance respectée, vues symétriques et cartes cachées', () => {
    const env = setup();
    const { code } = started(env);
    const a0 = env.tb.get(code, A.userId);
    const b0 = env.tb.get(code, B.userId);
    expect(a0.view!.turn).toBe(b0.view!.turn);
    // chacun ne voit que sa propre carte
    expect(a0.view!.yourCard === null).not.toBe(b0.view!.yourCard === null);
    // hors tour : refusé
    const waiting = a0.view!.turn === 0 ? B : A;
    expect(() => env.tb.place(code, waiting.userId, 0)).toThrow(/tour/);
    const { a, b } = playBoth(env, code, (v) => v.view!.legal[0]!);
    expect(a.status).toBe('finished');
    expect(b.status).toBe('finished');
    expect(a.result).toEqual(b.result);
    expect(a.view!.columns).toEqual(b.view!.columns);
    expect(a.winner).toBe(b.winner);
    expect(verifyTableauReveal(a.reveal!)).toBe(true);
    expect(a.view!.placed).toEqual([20, 20]);
  });

  it('synchronisation : la version et le dernier coup progressent à chaque placement', () => {
    const env = setup();
    const { code } = started(env);
    let v = env.tb.get(code, A.userId);
    const mover = v.view!.turn === 0 ? A : B;
    const other = mover === A ? B : A;
    const before = v.version;
    env.tb.place(code, mover.userId, 2);
    v = env.tb.get(code, other.userId);
    expect(v.version).toBeGreaterThan(before);
    expect(v.lastMove).toMatchObject({ seat: v.you === 0 ? 1 : 0, col: 2, auto: false });
  });

  it('délai dépassé : placement automatique, puis abandon après 3 absences consécutives', () => {
    const env = setup();
    const { code } = started(env);
    let v = env.tb.get(code, A.userId);
    const first = v.view!.turn!;
    env.tick(TURN_MS + GRACE_MS + 1);
    v = env.tb.get(code, A.userId);
    expect(v.lastMove!.auto).toBe(true);
    expect(v.lastMove!.seat).toBe(first);
    expect(v.lastMove!.col).toBe(0);
    // plus personne ne joue : chaque joueur laisse passer 3 tours -> le premier à atteindre 3 perd par forfait
    env.tick(10 * 60_000);
    v = env.tb.get(code, A.userId);
    expect(v.status).toBe('finished');
    expect(v.forfeit).not.toBeNull();
    expect(v.winner).toBe(v.forfeit === 0 ? 1 : 0);
    expect(v.result).toBeNull();
  });

  it('un coup joué remet à zéro le compteur d’absences', () => {
    const env = setup();
    const { code } = started(env);
    let v = env.tb.get(code, A.userId);
    const first = v.view!.turn!;
    const U = (s: number) => (s === 0 ? A : B);
    env.tick(TURN_MS + GRACE_MS + 1); // 1 absence du premier joueur (auto)
    v = env.tb.get(code, U(first).userId);
    // le second joue normalement, puis le premier joue à son tour
    env.tb.place(code, U(1 - first).userId, 0);
    v = env.tb.get(code, U(first).userId);
    expect(v.view!.turn).toBe(first);
    env.tb.place(code, U(first).userId, v.view!.legal[0]!);
    expect(env.tb.get(code, A.userId).status).toBe('playing');
  });

  it('abandon volontaire d’une partie en cours : forfait, victoire de l’adversaire', () => {
    const env = setup();
    const { code } = started(env);
    expect(env.tb.leave(code, A.userId)).toEqual({ left: true, forfeit: true });
    const v = env.tb.get(code, B.userId);
    expect(v.status).toBe('finished');
    expect(v.winner).toBe(1);
    const h = env.tb.history(B.userId);
    expect(h[0]).toMatchObject({ outcome: 'win', forfeit: true, mode: 'friendly', opponent: 'Ana' });
    expect(env.tb.history(A.userId)[0]!.outcome).toBe('loss');
  });

  it('quitter pendant l’attente supprime la partie ; une partie en cours bloque une autre création', () => {
    const env = setup();
    const w = env.tb.create(A, { mode: 'friendly' });
    env.tb.leave(w.code, A.userId);
    expect(() => env.tb.get(w.code, A.userId)).toThrow();
    const { code } = started(env);
    expect(() => env.tb.create(A, { mode: 'friendly' })).toThrow(/déjà en cours/);
    expect(env.tb.activeCode(B.userId)!.code).toBe(code);
  });

  it('reprise côté amical après redémarrage et historique après la fin', () => {
    const env = setup();
    const { code } = started(env);
    playBoth(env, code, (v) => v.view!.legal.at(-1)!);
    const fresh = new TableauService(env.store, env.bj, { now: env.now });
    const v = fresh.get(code, B.userId);
    expect(v.status).toBe('finished');
    expect(fresh.activeCode(A.userId)).toBeNull();
    const h = fresh.history(A.userId);
    expect(h).toHaveLength(1);
    expect(h[0]!.score[0] + h[0]!.score[1]).toBeLessThanOrEqual(5);
    // les deux historiques sont cohérents
    const hb = fresh.history(B.userId)[0]!;
    expect(h[0]!.outcome === 'win' ? hb.outcome : h[0]!.outcome === 'loss' ? hb.outcome : 'draw').toBe(h[0]!.outcome === 'win' ? 'loss' : h[0]!.outcome === 'loss' ? 'win' : 'draw');
  });

  it('les conseils sont réservés à l’entraînement', () => {
    const env = setup();
    const { code } = started(env);
    expect(() => env.tb.advice(code, A.userId)).toThrow(/Entraînement/);
  });
});

describe('Tableau — HTTP', () => {
  it('routes : identité requise, création, état, placement, adversaire invité, historique', async () => {
    const { LogMailer } = await import('../src/accounts/mailer');
    const { RoomManager } = await import('../src/roomManager');
    const { ManualScheduler } = await import('../src/scheduler');
    const store = new AccountDb(':memory:');
    const accounts = new AccountService(store, new LogMailer(false, () => undefined), { appUrl: 'https://jeu.test', log: () => undefined });
    const blackjack = new BlackjackService(store);
    const tableau = new TableauService(store, blackjack, { aiSims: 8, rng: new SeededRng(5) });
    const manager = new RoomManager({ rng: new SeededRng(7), scheduler: new ManualScheduler(), accounts: { isReservedNickname: () => false, onGameFinished: () => undefined } });
    const server = await buildServer({ manager, accounts, blackjack, tableau, onError: () => undefined });
    try {
      const inj = (method: 'GET' | 'POST', url: string, guest?: string, payload?: unknown) => server.app.inject({ method, url, payload: payload as object, headers: guest ? { 'x-bj-guest': guest } : {} });
      const ga = 'aa'.repeat(16);
      const gb = 'bb'.repeat(16);
      expect((await inj('POST', '/tableau/games', undefined, { mode: 'training' })).statusCode).toBe(400);
      expect((await inj('POST', '/tableau/games', ga, { mode: 'ranked' })).statusCode).toBe(400);
      const created = await inj('POST', '/tableau/games', ga, { mode: 'friendly', nickname: 'Ana' });
      expect(created.statusCode).toBe(201);
      const g = created.json() as TbGameDto;
      expect(g.status).toBe('waiting');
      expect((await inj('GET', `/tableau/games/${g.code}`, gb)).statusCode).toBe(403);
      const joined = await inj('POST', `/tableau/games/${g.code}/join`, gb, { nickname: 'Ben' });
      expect(joined.json()).toMatchObject({ status: 'playing', you: 1 });
      const state = (await inj('GET', `/tableau/games/${g.code}`, ga)).json() as TbGameDto;
      const mover = state.view!.turn === 0 ? ga : gb;
      const other = mover === ga ? gb : ga;
      expect((await inj('POST', `/tableau/games/${g.code}/place`, other, { col: 0 })).statusCode).toBe(422);
      expect((await inj('POST', `/tableau/games/${g.code}/place`, mover, { col: 9 })).statusCode).toBe(400);
      const placed = await inj('POST', `/tableau/games/${g.code}/place`, mover, { col: 3 });
      expect(placed.statusCode).toBe(200);
      expect((placed.json() as TbGameDto).lastMove).toMatchObject({ col: 3, auto: false });
      expect(((await inj('GET', '/me/tableau/active', ga)).json() as { active: { code: string } }).active.code).toBe(g.code);
      expect((await inj('POST', `/tableau/games/${g.code}/leave`, ga)).json()).toMatchObject({ forfeit: true });
      const hist = (await inj('GET', '/me/tableau/history', gb)).json() as { history: { outcome: string }[] };
      expect(hist.history[0]!.outcome).toBe('win');
    } finally {
      await server.close();
    }
  });
});
