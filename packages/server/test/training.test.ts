import { describe, expect, it } from 'vitest';
import { SeededRng } from '@poker/engine';
import { RoomManager } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { InMemoryRoomStore } from '../src/store';
import type { UpdateMessage } from '../src/protocol';
import { expectErr, makeManager } from './helpers';

const CFG = { name: 'Entraînement', maxPlayers: 6, targetPoints: 2, stakeChips: 0, nickname: 'Emeric', cpu: 3 };

/** Délai de réflexion nul : les CPU jouent dès que le temps avance, sans attendre. */
const FAST = { bots: { minDelayMs: 0, maxDelayMs: 0 } };

describe('mode entraînement : création', () => {
  it('crée l\'hôte et ses adversaires CPU, et démarre aussitôt une table privée', () => {
    const { m } = makeManager({}, FAST);
    const r = m.createRoom(CFG);
    const v = m.view(r.code, r.playerId);
    expect(v.status).toBe('RUNNING');
    expect(v.players).toHaveLength(4);
    expect(v.players.filter((p) => p.bot)).toHaveLength(3);
    expect(v.players.filter((p) => !p.bot)).toHaveLength(1);
    expect(v.players.every((p) => p.state === 'SEATED')).toBe(true);
    expect(v.players.filter((p) => p.bot).every((p) => p.connected)).toBe(true);
    // la table compte exactement l'hôte et ses CPU, quel que soit le maximum demandé
    expect(v.config.maxPlayers).toBe(4);
    expect(v.seatsLeft).toBe(0);
    expect(v.you.role).toBe('HOST');
  });

  it('prénoms CPU distincts, jamais celui de l\'hôte ; la table n\'apparaît pas dans la liste publique et reste fermée', () => {
    const { m } = makeManager({}, FAST);
    const r = m.createRoom({ ...CFG, nickname: 'gaspard', cpu: 5 });
    const names = m.view(r.code, r.playerId).players.map((p) => p.nickname.toLowerCase());
    expect(new Set(names).size).toBe(6);
    expect(m.listOpen()).toEqual([]);
    expectErr(() => m.joinRoom(r.code, { nickname: 'Intrus' }), 'ROOM_FULL');
  });

  it('nombre de CPU : 1 à 5 entiers seulement', () => {
    const { m } = makeManager({}, FAST);
    for (const cpu of [0, 6, 2.5, -1, '3']) expectErr(() => m.createRoom({ ...CFG, cpu }), 'BAD_REQUEST');
    for (const cpu of [1, 5]) expect(() => m.createRoom({ ...CFG, cpu })).not.toThrow();
    // une partie sans CPU garde le comportement habituel : salle d'attente
    const { cpu: _unused, ...plain } = CFG;
    void _unused;
    const lobby = m.createRoom(plain);
    expect(m.view(lobby.code, lobby.playerId).status).toBe('WAITING');
  });
});

describe('mode entraînement : les CPU jouent', () => {
  it('le CPU désigné choisit la variante après son délai de réflexion, pas avant', () => {
    const scheduler = new ManualScheduler();
    const { m } = makeManager({}, { scheduler, bots: { minDelayMs: 1500, maxDelayMs: 1500 } });
    // on cherche une table où un CPU commence : positions tirées au sort, on essaie plusieurs parties
    let found: { code: string; playerId: string } | null = null;
    for (let i = 0; i < 30 && !found; i++) {
      const r = m.createRoom({ ...CFG, nickname: `H${i}`, cpu: 2 });
      const v = m.view(r.code, r.playerId);
      const chooser = v.game!.chooser;
      if (v.players.find((p) => p.id === chooser)!.bot) found = r;
    }
    expect(found).not.toBeNull();
    const { code, playerId } = found!;
    expect(m.view(code, playerId).game!.phase).toBe('VARIANT_SELECTION');
    scheduler.advance(1000);
    expect(m.view(code, playerId).game!.phase).toBe('VARIANT_SELECTION'); // il « réfléchit » encore
    scheduler.advance(600);
    expect(m.view(code, playerId).game!.phase).toBe('ROUND');
  });

  it('une partie entière est jouée jusqu\'au bout : l\'humain ne fait rien, ses minuteurs de 60 s s\'écoulent', () => {
    const scheduler = new ManualScheduler();
    const errors: unknown[] = [];
    const { m, out } = makeManager({}, { scheduler, onError: (e) => errors.push(e), ...FAST });
    const r = m.createRoom({ ...CFG, targetPoints: 1, cpu: 3 });
    for (let i = 0; i < 300 && m.view(r.code, r.playerId).status === 'RUNNING'; i++) scheduler.advance(61_000);
    const v = m.view(r.code, r.playerId);
    expect(v.status).toBe('FINISHED');
    expect(errors).toEqual([]); // aucun coup refusé par le moteur : les CPU jouent légalement
    expect(v.game!.outcome).not.toBeNull();
    // l'humain a bien reçu les mises à jour
    expect(out.some((o) => o.playerId === r.playerId && o.message.type === 'update')).toBe(true);
  });

  it('plusieurs CPU attendus dans la même phase jouent l\'un après l\'autre', () => {
    const scheduler = new ManualScheduler();
    const errors: unknown[] = [];
    const { m } = makeManager({}, { scheduler, onError: (e) => errors.push(e), bots: { minDelayMs: 500, maxDelayMs: 500 } });
    const r = m.createRoom({ ...CFG, cpu: 4, targetPoints: 5 });
    let sawParallel = false;
    for (let i = 0; i < 200 && m.view(r.code, r.playerId).status === 'RUNNING'; i++) {
      scheduler.advance(500);
      const g = m.view(r.code, r.playerId).game!;
      if (g.phase === 'ROUND' && g.round && g.round.awaiting.length > 1) sawParallel = true;
    }
    expect(errors).toEqual([]);
    expect(sawParallel || m.view(r.code, r.playerId).status === 'FINISHED').toBe(true);
  });

  it('l\'humain ne reçoit jamais les cartes cachées d\'un CPU', () => {
    const { m, out, scheduler } = makeManager({}, FAST);
    const r = m.createRoom({ ...CFG, cpu: 2, targetPoints: 5 });
    for (let i = 0; i < 40; i++) scheduler.advance(61_000);
    const hostUpdates = out.filter((o) => o.playerId === r.playerId && o.message.type === 'update').map((o) => o.message as UpdateMessage);
    expect(hostUpdates.length).toBeGreaterThan(1);
    // l'humain ne reçoit jamais la main cachée d'un CPU tant qu'elle est cachée
    for (const u of hostUpdates) {
      const round = u.view.game?.round;
      if (!round || round.variant === 'V6_1' || round.variant === 'LE10') continue;
      for (const [pid, hand] of Object.entries(round.cards.hands)) {
        if (pid !== r.playerId) expect(hand.kind).toBe('opponent');
      }
    }
  });
});

describe('mode entraînement : vie de la salle', () => {
  it('une salle d\'entraînement sans humain connecté est abandonnée comme les autres (les CPU ne comptent pas)', () => {
    const scheduler = new ManualScheduler();
    const { m } = makeManager({}, { scheduler, ...FAST, ttl: { idleRunningMs: 10 * 60_000 } });
    const r = m.createRoom({ ...CFG, targetPoints: 5 });
    scheduler.advance(11 * 60_000);
    // la partie avance seule pendant ce temps (minuteurs de l'humain), mais personne n'est là pour la regarder
    m.sweep();
    expect(['CANCELLED', 'FINISHED']).toContain(m.view(r.code, r.playerId).status);
  });

  it('survit à un redémarrage du serveur : les CPU reprennent la main', () => {
    const scheduler = new ManualScheduler();
    const store = new InMemoryRoomStore();
    const a = makeManager({}, { scheduler, store, ...FAST });
    const r = a.m.createRoom({ ...CFG, targetPoints: 5, cpu: 3 });
    scheduler.advance(61_000);
    const before = a.m.snapshotRoom(r.code);
    expect(before.players.filter((p) => p.bot)).toHaveLength(3);

    const scheduler2 = new ManualScheduler();
    const m2 = new RoomManager({ rng: new SeededRng(9), scheduler: scheduler2, store, bots: { minDelayMs: 0, maxDelayMs: 0 } });
    m2.restoreRoom(JSON.parse(JSON.stringify(before)));
    const v = m2.view(r.code, r.playerId);
    expect(v.players.filter((p) => p.bot).every((p) => p.connected)).toBe(true);
    expect(v.players.filter((p) => !p.bot).every((p) => !p.connected)).toBe(true);
    const roundBefore = v.game!.roundNo;
    for (let i = 0; i < 200 && m2.view(r.code, r.playerId).status === 'RUNNING'; i++) scheduler2.advance(61_000);
    const after = m2.view(r.code, r.playerId);
    expect(after.status === 'FINISHED' || after.game!.roundNo > roundBefore).toBe(true);
  });

  it('une ancienne sauvegarde sans champ « bot » est relue comme une partie entre humains', () => {
    const { m } = makeManager({}, FAST);
    const r = m.createRoom({ ...CFG, cpu: undefined, maxPlayers: 3 });
    const snap = m.snapshotRoom(r.code);
    const legacy = JSON.parse(JSON.stringify(snap)) as typeof snap;
    for (const p of legacy.players) delete (p as { bot?: boolean }).bot;
    const m2 = new RoomManager({ rng: new SeededRng(1), scheduler: new ManualScheduler(), store: new InMemoryRoomStore() });
    m2.restoreRoom(legacy);
    expect(m2.view(r.code, r.playerId).players.every((p) => p.bot === false)).toBe(true);
  });
});
