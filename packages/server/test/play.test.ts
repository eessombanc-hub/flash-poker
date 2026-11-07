import { SeededRng } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import type { UpdateMessage } from '../src/protocol';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import {
  aviationStack, closedWin, codesIn, dealStack, expectErr, H63, LOSERS, makeManager, setup, stack63, WIN,
} from './helpers';

const CLOSED_1 = { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' };
const gv = (env: ReturnType<typeof setup>, idx = 0) => env.m.view(env.code, env.order[idx]!).game!;

describe('sécurité : jetons et identité', () => {
  it('le jeton authentifie ; un mauvais jeton ou une room inconnue sont indiscernables ; jamais de jeton dans les messages', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    for (const id of env.order) expect(env.m.authenticate(env.code, env.tokens[id]!)).toBe(id);
    expectErr(() => env.m.authenticate(env.code, 'nimporte-quoi-du-tout-1234'), 'UNAUTHORIZED');
    expectErr(() => env.m.authenticate('POKER-ZZZZ', env.tokens[env.order[0]!]!), 'UNAUTHORIZED');
    env.act(0, CLOSED_1);
    const dump = JSON.stringify(env.out) + JSON.stringify(env.m.snapshotRoom(env.code));
    for (const token of Object.values(env.tokens)) expect(dump).not.toContain(token); // seule l'empreinte est conservée
    expect(dump).toContain('tokenHash');
    const snap = env.m.snapshotRoom(env.code);
    for (const pl of snap.players) expect(Object.keys(pl).sort()).toEqual(['accountId', 'assistanceApproved', 'avatar', 'held', 'id', 'lastSeenAt', 'nickname', 'state', 'tokenHash']);
  });

  it('l\'identité vient du jeton, jamais du message : un client ne peut pas agir au nom d\'un autre', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    // le message prétend venir du chooser (player: order[0]) mais l'auteur authentifié est order[1]
    expectErr(
      () => env.m.command(env.code, env.order[1]!, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1', player: env.order[0] }),
      'RULE',
      'NOT_YOUR_TURN',
    );
    expect(gv(env).phase).toBe('VARIANT_SELECTION');
  });

  it('les commandes réservées au serveur sont refusées : TIMEOUT, arrivée, exclusion, échéance d\'assurance', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    for (const cmd of [
      { type: 'TIMEOUT' },
      { type: 'INSURANCE_TIMEOUT' },
      { type: 'ADD_PLAYER', player: 'x' },
      { type: 'EXCLUDE_PLAYER', player: env.order[1] },
      { type: 'ROUND', command: { type: 'TIMEOUT' } },
      { type: 'CHOOSE_VARIANT', variant: 'POKER' },
      { type: 'SELECT', cards: ['Zz'] },
      { type: 'SELECT', cards: ['As', 'Ad', 'Ac', 'Ah'] },
      {},
      null,
    ]) expectErr(() => env.act(0, cmd), 'BAD_REQUEST');
    expect(gv(env).phase).toBe('VARIANT_SELECTION'); // rien n'a bougé
  });

  it('les refus de règles remontent avec leur code, sans effet sur l\'état', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    const version = env.m.view(env.code, env.order[0]!).version;
    expectErr(() => env.act(1, CLOSED_1), 'RULE', 'NOT_YOUR_TURN');
    expectErr(() => env.act(0, { type: 'VALIDATE' }), 'RULE', 'WRONG_PHASE');
    expectErr(() => env.act(0, { type: 'PROPOSE_INSURANCE', partner: env.order[1], insuranceType: 'SPLIT_50_50' }), 'RULE', 'INSURANCE_NOT_ELIGIBLE');
    expect(env.m.view(env.code, env.order[0]!).version).toBe(version);
  });
});

describe('partie synchronisée et secrète', () => {
  it('tous reçoivent la même version au même moment ; chacun sa vue ; événements privés au seul destinataire', () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_2' }); // 2 changes : rien n'est montré après le premier
    const versions = env.order.map((id) => env.updates(id).at(-1)!.version);
    expect(new Set(versions).size).toBe(1);
    env.act(0, { type: 'SELECT', cards: [LOSERS[0]![0]!] }); // le joueur en position 0 changera 1 carte
    env.scheduler.advance(60_000); // échéance : brouillon appliqué, phase CHANGE_2
    expect(gv(env).round!.phase).toBe('CHANGE_2');
    const changed = env.out.filter((o) => (o.message as UpdateMessage).events?.some((e) => e.type === 'CHANGE_APPLIED'));
    expect(changed.map((o) => o.playerId)).toEqual([env.order[0]]); // envoyé à lui seul
    const ev = (changed[0]!.message as UpdateMessage).events.find((e) => e.type === 'CHANGE_APPLIED')!;
    expect(ev).toMatchObject({ visibility: 'PLAYER', audience: env.order[0] });
    const received = (ev.data.received as string[])[0]!;
    for (const id of env.order.slice(1)) {
      expect(env.updates(id).some((u) => codesIn(u).has(received))).toBe(false);
    }
  });

  it('aucune carte cachée adverse dans aucun message avant le showdown ; toutes visibles ensuite', () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, CLOSED_1);
    const hands = [LOSERS[0]!, WIN, LOSERS[1]!]; // par position
    env.scheduler.advance(59_999);
    for (let me = 0; me < 3; me++) {
      const seen = new Set<string>();
      for (const u of env.updates(env.order[me]!)) codesIn(u).forEach((c) => seen.add(c));
      for (let other = 0; other < 3; other++) {
        if (other !== me) for (const c of hands[other]!) expect(seen.has(c), `${c} vu par la position ${me}`).toBe(false);
      }
    }
    env.scheduler.advance(1); // échéance : 0 change pour tous → showdown public
    const all = codesIn(env.updates(env.order[2]!).at(-1));
    for (const c of [...hands[0]!, ...hands[1]!, ...hands[2]!]) expect(all.has(c)).toBe(true);
    expect(gv(env).history[0]!.award).toMatchObject({ kind: 'POINTS', winner: env.order[1], points: 1 });
  });

  it('un spectateur en file d\'attente ne voit aucune main privée', () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, CLOSED_1);
    const j = env.m.joinRoom(env.code, { nickname: 'Curieux' });
    const v = env.m.view(env.code, j.playerId);
    expect(v.you.role).toBe('QUEUED');
    const seen = codesIn(v);
    for (const c of [...WIN, ...LOSERS[0]!, ...LOSERS[1]!]) expect(seen.has(c)).toBe(false);
    expectErr(() => env.m.command(env.code, j.playerId, CLOSED_1), 'FORBIDDEN');
  });
});

describe('minuteurs de 60 s', () => {
  it('choix de variante : à l\'échéance, une variante disponible est tirée au hasard', () => {
    const env = setup(3);
    const t0 = env.scheduler.now();
    expect(env.m.view(env.code, env.order[1]!).deadline).toMatchObject({ at: t0 + 60_000, kind: 'VARIANT' });
    env.scheduler.advance(59_999);
    expect(gv(env).phase).toBe('VARIANT_SELECTION');
    env.scheduler.advance(1);
    expect(gv(env).phase).toBe('ROUND');
    const ev = env.updates(env.order[0]!).flatMap((u) => u.events).find((e) => e.type === 'VARIANT_CHOSEN')!;
    expect(ev.data).toMatchObject({ auto: true, chooser: env.order[0] });
  });

  it('une action ne relance pas le minuteur ; une nouvelle phase le relance ; l\'ancienne échéance ne déclenche rien', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_2' });
    const t0 = env.scheduler.now();
    expect(env.m._debug(env.code).deadlineAt).toBe(t0 + 60_000);
    env.scheduler.advance(5_000);
    env.act(1, { type: 'SELECT', cards: [] }); // simple brouillon : même phase, même échéance
    expect(env.m._debug(env.code).deadlineAt).toBe(t0 + 60_000);
    for (const i of [0, 1, 2]) env.act(i, { type: 'VALIDATE' }); // tous validés à t0 + 5 s : change 2 commence
    expect(gv(env).round!.phase).toBe('CHANGE_2');
    expect(env.m._debug(env.code).deadlineAt).toBe(t0 + 65_000);
    env.scheduler.advance(55_000); // t0 + 60 s : l'ancienne échéance ne doit RIEN déclencher
    expect(gv(env).round!.phase).toBe('CHANGE_2');
    env.scheduler.advance(5_000); // t0 + 65 s : échéance du change 2
    expect(gv(env).history).toHaveLength(1);
  });

  it('avertissement neutre à 10 s de l\'échéance, aux seuls joueurs dont la sélection est incomplète', () => {
    const env = setup(3, { 1: stack63() });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'V6_3' });
    env.act(0, { type: 'SELECT', cards: [H63[0]![2]!] }); // une seule carte désignée
    env.scheduler.advance(49_999);
    expect(env.out.some((o) => (o.message as UpdateMessage).events?.some((e) => e.type === 'WARNING'))).toBe(false);
    env.scheduler.advance(1); // 50 s écoulées = 10 s restantes
    const warned = env.out.filter((o) => (o.message as UpdateMessage).events?.some((e) => e.type === 'WARNING'));
    expect(warned.map((o) => o.playerId)).toEqual([env.order[0]]);
    const w = (warned[0]!.message as UpdateMessage).events.find((e) => e.type === 'WARNING')!;
    expect(w).toMatchObject({ visibility: 'PLAYER', audience: env.order[0], data: { secondsLeft: 10 } });
    expect(JSON.stringify(w)).not.toMatch(/meilleure|best/i); // neutre : aucune aide
  });

  it('assurance : la proposition expire en 60 s (= refus), puis le minuteur du chooser repart', () => {
    const env = setup(4, { 1: closedWin(4, 0), 2: closedWin(4, 1) }, { targetPoints: 2 });
    for (let r = 0; r < 2; r++) {
      env.act(r, CLOSED_1); // chooser : position r
      env.scheduler.advance(60_000); // échéance : 0 change, showdown
    }
    expect(gv(env).insurance.eligible.sort()).toEqual([env.order[0], env.order[1]].sort());
    env.act(0, { type: 'PROPOSE_INSURANCE', partner: env.order[1], insuranceType: 'SPLIT_50_50' });
    expect(env.m.view(env.code, env.order[2]!).deadline).toMatchObject({ kind: 'INSURANCE' });
    env.scheduler.advance(60_000);
    const ev = env.updates(env.order[2]!).flatMap((u) => u.events);
    expect(ev.some((e) => e.type === 'INSURANCE_EXPIRED')).toBe(true);
    expect(env.m.view(env.code, env.order[2]!).deadline).toMatchObject({ kind: 'VARIANT' });
    expect(gv(env).insurance.pending).toBeNull();
  });

  it('fin de partie : plus aucun minuteur, plus aucune commande', () => {
    const env = setup(2, { 1: closedWin(2, 0) }, { targetPoints: 1 });
    env.act(0, CLOSED_1);
    env.scheduler.advance(60_000);
    const v = env.m.view(env.code, env.order[1]!);
    expect(v.status).toBe('FINISHED');
    expect(v.deadline).toBeNull();
    expect(v.game!.outcome).toMatchObject({ winner: env.order[0], victoryType: 'SCORE' });
    expect(v.game!.outcome!.settlement.payouts[env.order[0]!]).toBe(4000);
    expect(env.scheduler.pending()).toBe(0);
    expectErr(() => env.act(1, CLOSED_1), 'WRONG_STATE');
    expectErr(() => env.m.joinRoom(env.code, { nickname: 'Tard' }), 'WRONG_STATE');
  });
});

describe('déconnexion et reconnexion', () => {
  it('la connexion est diffusée ; les minuteurs continuent : le joueur absent est foldé à l\'échéance', () => {
    const env = setup(3, { 1: aviationStack() });
    env.act(0, { type: 'CHOOSE_VARIANT', variant: 'AVIATION' });
    const absent = env.order[2]!;
    env.m.disconnect(env.code, absent);
    expect(env.m.view(env.code, env.order[0]!).players.find((p) => p.id === absent)!.connected).toBe(false);
    env.act(0, { type: 'SELECT', cards: ['2c'] });
    env.act(0, { type: 'VALIDATE' });
    env.act(1, { type: 'SELECT', cards: ['4c'] });
    env.act(1, { type: 'VALIDATE' });
    env.scheduler.advance(60_000); // l'absent n'a rien fait
    expect(gv(env).round!.info.status).toMatchObject({ [absent]: 'FOLDED' });
    env.m.disconnect(env.code, absent); // idempotent
  });

  it('la reconnexion restaure tout : siège, cartes, échéance exacte', () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, CLOSED_1);
    const p = env.order[2]!;
    const before = env.m.view(env.code, p);
    env.m.disconnect(env.code, p);
    env.scheduler.advance(12_000);
    expect(env.m.authenticate(env.code, env.tokens[p]!)).toBe(p);
    env.m.connect(env.code, p);
    const after = env.m.view(env.code, p);
    expect(after.deadline).toEqual(before.deadline); // pas de repart à 60 s : l'échéance est la même
    expect(after.game!.round!.cards.hands[p]).toEqual(before.game!.round!.cards.hands[p]);
    expect(after.players.find((x) => x.id === p)).toMatchObject({ connected: true, position: before.players.find((x) => x.id === p)!.position });
    expect(env.updates(p).at(-1)!.view.serverTime).toBe(env.scheduler.now());
  });
});

describe('arrivée en cours de partie', () => {
  it('file d\'attente pendant la manche ; assis entre deux manches, à la dernière position, cagnotte augmentée', () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, CLOSED_1);
    const j = env.m.joinRoom(env.code, { nickname: 'Retard' });
    env.m.connect(env.code, j.playerId);
    let v = env.m.view(env.code, env.order[0]!);
    expect(v.players.find((p) => p.id === j.playerId)).toMatchObject({ state: 'QUEUED', position: null });
    expect(v.config.potChips).toBe(6000);
    env.scheduler.advance(60_000); // la manche se termine : il est assis
    v = env.m.view(env.code, env.order[0]!);
    expect(v.players.find((p) => p.id === j.playerId)).toMatchObject({ state: 'SEATED', position: 'UTG+3', score: 0 });
    expect(v.config.potChips).toBe(8000);
    expect(env.updates(env.order[0]!).flatMap((u) => u.events).some((e) => e.type === 'PLAYER_ADDED')).toBe(true);
    expect(env.m.view(env.code, j.playerId).you.role).toBe('PLAYER');
    env.m.command(env.code, env.order[1]!, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' }); // il est intégré à la rotation
  });

  it('entre deux manches il est assis immédiatement ; les places comptent aussi les exclus et la file', () => {
    const env = setup(3, {}, { maxPlayers: 4 });
    const j = env.m.joinRoom(env.code, { nickname: 'Direct' });
    expect(env.m.view(env.code, j.playerId).players.find((p) => p.id === j.playerId)!.state).toBe('SEATED');
    expectErr(() => env.m.joinRoom(env.code, { nickname: 'Trop' }), 'ROOM_FULL');
    const target = env.order.find((id) => id !== env.host.playerId)!;
    env.m.excludePlayer(env.code, env.host.playerId, target); // l'exclu garde son siège : la table reste complète
    expectErr(() => env.m.joinRoom(env.code, { nickname: 'Encore' }), 'ROOM_FULL');
  });
});

describe('exclusion par l\'hôte en cours de partie', () => {
  it('le joueur exclu garde son siège ; ses minuteurs sont résolus instantanément ; il ne peut plus agir', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    env.act(0, CLOSED_1);
    const target = env.order.find((id) => id !== env.host.playerId && id !== env.order[0])!;
    const present = env.order.filter((id) => id !== target);
    for (const id of present) env.m.command(env.code, id, { type: 'VALIDATE' }); // il ne manque plus que l'exclu
    expect(gv(env).round!.phase).toBe('CHANGE_1');
    env.m.excludePlayer(env.code, env.host.playerId, target); // → 0 change pour lui, la manche se termine tout de suite
    const v = env.m.view(env.code, env.host.playerId);
    expect(v.game!.history).toHaveLength(1);
    expect(v.players.find((p) => p.id === target)).toMatchObject({ excluded: true, state: 'SEATED' });
    expect(v.config.potChips).toBe(6000); // sa mise reste dans la cagnotte
    expectErr(() => env.m.command(env.code, target, CLOSED_1), 'RULE', 'EXCLUDED');
    expectErr(() => env.m.excludePlayer(env.code, target, present[0]!), 'FORBIDDEN'); // pas l'hôte
  });

  it('un joueur en file d\'attente exclu est simplement retiré', () => {
    const env = setup(3, { 1: closedWin(3, 0) });
    env.act(0, CLOSED_1);
    const j = env.m.joinRoom(env.code, { nickname: 'Retard' });
    env.m.excludePlayer(env.code, env.host.playerId, j.playerId);
    expect(env.out.some((o) => o.playerId === j.playerId && o.message.type === 'kicked')).toBe(true);
    expect(env.m.view(env.code, env.host.playerId).players.some((p) => p.id === j.playerId)).toBe(false);
  });
});

describe('persistance : reprise après redémarrage', () => {
  it('la room est restaurée, les jetons valent toujours, le minuteur reprend au temps restant', async () => {
    const stacks = { 1: closedWin(3, 1) };
    const env = setup(3, stacks);
    env.act(0, CLOSED_1);
    env.scheduler.advance(12_000);
    const deadline = env.m._debug(env.code).deadlineAt!;
    const viewBefore = env.m.view(env.code, env.order[1]!);

    // redémarrage : nouveau processus, même store, horloge à t0 + 12 s
    const sched2 = new ManualScheduler(env.scheduler.now());
    const m2 = new RoomManager({ rng: new SeededRng(9), scheduler: sched2, store: env.store, gameHooks: { stackedDeck: (r) => (stacks as Record<number, string[]>)[r] } });
    expect(await m2.restoreFromStore()).toBe(1);
    const p = env.order[1]!;
    expect(m2.authenticate(env.code, env.tokens[p]!)).toBe(p);
    const viewAfter = m2.view(env.code, p);
    expect(viewAfter.game).toEqual(viewBefore.game);
    expect(viewAfter.deadline).toEqual(viewBefore.deadline);
    expect(viewAfter.players.every((x) => x.connected === false)).toBe(true); // tous doivent se reconnecter
    sched2.advance(47_999);
    expect(m2.view(env.code, p).game!.history).toHaveLength(0);
    sched2.advance(1); // 60 s après le début de la phase
    expect(m2.view(env.code, p).game!.history).toHaveLength(1);
    expect(deadline).toBe(viewBefore.deadline!.at);
  });

  it('serveur arrêté au-delà de l\'échéance : elle est appliquée dès le redémarrage', async () => {
    const env = setup(3, { 1: closedWin(3, 1) });
    env.act(0, CLOSED_1);
    const sched2 = new ManualScheduler(env.scheduler.now() + 90_000);
    const m2 = new RoomManager({ rng: new SeededRng(9), scheduler: sched2, store: env.store, gameHooks: { stackedDeck: () => closedWin(3, 1) } });
    await m2.restoreFromStore();
    sched2.advance(0);
    expect(m2.view(env.code, env.order[0]!).game!.history).toHaveLength(1);
  });

  it('une erreur du store n\'interrompt jamais la partie', () => {
    const errors: unknown[] = [];
    const failing = { save: () => { throw new Error('disque plein'); }, delete: () => undefined, loadAll: () => [] };
    const { m } = makeManager({}, { store: failing, onError: (e) => errors.push(e) });
    const r = m.createRoom({ name: 'T', maxPlayers: 3, targetPoints: 3, stakeChips: 0, nickname: 'H' });
    m.joinRoom(r.code, { nickname: 'A' });
    m.startGame(r.code, r.playerId);
    expect(m.view(r.code, r.playerId).status).toBe('RUNNING');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('hygiène : expiration des rooms', () => {
  const ttl = { waitingMs: 1000, finishedMs: 1000, idleRunningMs: 1000 };

  it('room jamais démarrée : supprimée après le délai, y compris du store', () => {
    const { m, scheduler, store } = makeManager({}, { ttl });
    m.createRoom({ name: 'T', maxPlayers: 3, targetPoints: 3, stakeChips: 0, nickname: 'H' });
    expect(store.size()).toBe(1);
    expect(m.sweep()).toEqual([]);
    scheduler.advance(1001);
    expect(m.sweep()).toHaveLength(1);
    expect(m.roomCount()).toBe(0);
  });

  it('partie en cours sans aucun joueur connecté : abandonnée puis supprimée ; avec un joueur connecté : conservée', () => {
    const env = setup(3, { 1: closedWin(3, 0) }, {}, { ttl: { ...ttl, idleRunningMs: 5_000 } });
    env.scheduler.advance(6_000);
    env.m.sweep();
    expect(env.m.view(env.code, env.order[0]!).status).toBe('RUNNING'); // tout le monde est connecté
    for (const id of env.order) env.m.disconnect(env.code, id);
    env.scheduler.advance(4_999);
    env.m.sweep();
    expect(env.m.view(env.code, env.order[0]!).status).toBe('RUNNING');
    env.scheduler.advance(2);
    env.m.sweep();
    expect(env.m.view(env.code, env.order[0]!).status).toBe('CANCELLED');
    expect(env.scheduler.pending()).toBe(0); // aucun minuteur orphelin
    env.scheduler.advance(1001);
    expect(env.m.sweep()).toEqual([env.code]);
  });
});

describe('robustesse', () => {
  it('une exception dans un minuteur est signalée sans faire tomber le serveur', () => {
    const errors: unknown[] = [];
    const env = setup(3, { 1: closedWin(3, 0) }, {}, { onError: (e) => errors.push(e) });
    (env.m._debug(env.code).game as unknown as { apply: () => never }).apply = () => {
      throw new Error('boom');
    };
    env.scheduler.advance(60_000);
    expect(errors).toHaveLength(1);
  });

  it('dealStack est cohérent avec le moteur (hypothèse des tests)', () => {
    expect(dealStack([['a1', 'a2'], ['b1', 'b2']])).toEqual(['a1', 'b1', 'a2', 'b2']);
  });
});
