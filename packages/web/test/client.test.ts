import type { Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api';
import { GameClient } from '../src/lib/client';
import { MemorySessionStore } from '../src/lib/session';
import type { RoundEvent, UpdateMessage } from '../src/lib/types';
import { game, roomView } from './fixtures';

class FakeSocket {
  connected = false;
  disconnected = false;
  handlers: Record<string, ((...a: any[]) => void)[]> = {};
  emitted: { event: string; payload: unknown }[] = [];
  reply: (event: string, payload: unknown) => unknown = () => ({ ok: true });
  constructor(readonly url: string, readonly opts: Record<string, any>) {}
  on(e: string, h: (...a: any[]) => void) {
    (this.handlers[e] ??= []).push(h);
    return this;
  }
  trigger(e: string, ...a: unknown[]) {
    if (e === 'connect') this.connected = true;
    if (e === 'disconnect') this.connected = false;
    for (const h of this.handlers[e] ?? []) h(...a);
  }
  timeout() {
    return {
      emit: (event: string, payload: unknown, cb: (err: Error | null, ack?: unknown) => void) => {
        this.emitted.push({ event, payload });
        const r = this.reply(event, payload);
        if (r === 'TIMEOUT') cb(new Error('timeout'));
        else cb(null, r);
      },
    };
  }
  disconnect() {
    this.connected = false;
    this.disconnected = true;
  }
}

function setup(over: { session?: boolean; fetchFn?: typeof fetch; now?: () => number } = {}) {
  const storage = new MemorySessionStore();
  if (over.session) storage.save({ code: 'POKER-ABCD', token: 'tok', playerId: 'p1', nickname: 'Emeric' });
  const sockets: FakeSocket[] = [];
  const client = new GameClient({
    baseUrl: 'http://srv',
    storage,
    clock: over.now,
    fetchFn: over.fetchFn,
    socketFactory: (url, opts) => {
      const s = new FakeSocket(url, opts);
      sockets.push(s);
      return s as unknown as Socket;
    },
  });
  return { client, storage, sockets, last: () => sockets.at(-1)! };
}
const update = (version: number, events: RoundEvent[] = [], serverTime = Date.now()): UpdateMessage => ({ type: 'update', roomCode: 'POKER-ABCD', version, view: roomView({ version, serverTime }), events });
const okFetch = (body: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

describe('accès HTTP', () => {
  it('création : session enregistrée, socket ouvert avec code et jeton', async () => {
    const { client, storage, last } = setup({ fetchFn: okFetch({ code: 'POKER-ABCD', playerId: 'p1', token: 'tok' }, 201) });
    await client.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 2000, nickname: 'Emeric' });
    expect(storage.load()).toEqual({ code: 'POKER-ABCD', token: 'tok', playerId: 'p1', nickname: 'Emeric' });
    expect(last().opts.auth).toEqual({ code: 'POKER-ABCD', token: 'tok' });
    expect(last().opts.transports).toEqual(['websocket']);
    expect(client.state.connection).toBe('connecting');
  });
  it('arrivée : le code est normalisé dans la session', async () => {
    const { client, storage } = setup({ fetchFn: okFetch({ playerId: 'p2', token: 't2' }, 201) });
    await client.joinRoom(' poker-abcd ', { nickname: 'Alice' });
    expect(storage.load()?.code).toBe('POKER-ABCD');
  });
  it('refus du serveur : message français conservé, aucune session créée', async () => {
    const { client, storage } = setup({ fetchFn: okFetch({ error: { code: 'ROOM_FULL', message: 'La partie est complète.' } }, 409) });
    await expect(client.joinRoom('POKER-ABCD', { nickname: 'Alice' })).rejects.toMatchObject({ code: 'ROOM_FULL', message: 'La partie est complète.' });
    expect(storage.load()).toBeNull();
  });
  it('réseau coupé : erreur explicite', async () => {
    const { client } = setup({ fetchFn: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    await expect(client.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 0, nickname: 'E' })).rejects.toBeInstanceOf(ApiError);
    await expect(client.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 0, nickname: 'E' })).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('cycle de connexion', () => {
  it('reprise après rechargement : la session conservée rouvre la connexion', () => {
    const a = setup({ session: true });
    expect(a.client.resume()).toBe(true);
    expect(a.sockets).toHaveLength(1);
    expect(a.client.resume()).toBe(false); // déjà connecté
    expect(setup().client.resume()).toBe(false); // pas de session
  });
  it('en ligne → hors ligne → en ligne, sans perdre la vue', () => {
    const { client, last } = setup({ session: true });
    client.resume();
    last().trigger('connect');
    last().trigger('update', update(1));
    expect(client.state.connection).toBe('online');
    last().trigger('disconnect');
    expect(client.state.connection).toBe('offline');
    expect(client.state.view).not.toBeNull(); // l'écran reste affiché pendant la reconnexion
    last().trigger('connect');
    last().trigger('update', update(2));
    expect(client.state.connection).toBe('online');
    expect(client.state.version).toBe(2);
  });
  it('échec de connexion : hors ligne', () => {
    const { client, last } = setup({ session: true });
    client.resume();
    last().trigger('connect_error', new Error('x'));
    expect(client.state.connection).toBe('offline');
  });
  it('exclusion par l’hôte : session effacée, motif conservé', () => {
    const { client, storage, last } = setup({ session: true });
    client.resume();
    last().trigger('update', update(1));
    last().trigger('kicked', {});
    expect(storage.load()).toBeNull();
    expect(client.state).toMatchObject({ session: null, view: null, closed: 'KICKED' });
    expect(last().disconnected).toBe(true);
  });
  it('session invalide (partie expirée) : effacée', () => {
    const { client, storage, last } = setup({ session: true });
    client.resume();
    last().trigger('fatal', {});
    expect(storage.load()).toBeNull();
    expect(client.state.closed).toBe('INVALID_SESSION');
  });
  it('quitter : déconnexion et session effacée', () => {
    const { client, storage, last } = setup({ session: true });
    client.resume();
    client.leave();
    expect(storage.load()).toBeNull();
    expect(last().disconnected).toBe(true);
    expect(client.state.session).toBeNull();
  });
  it('fermeture de l’onglet : la session est conservée pour la reprise', () => {
    const { client, storage } = setup({ session: true });
    client.resume();
    client.dispose();
    expect(storage.load()).not.toBeNull();
  });
});

describe('horloge et mises à jour', () => {
  it('l’heure serveur corrige le décalage de l’horloge locale', () => {
    let local = 1_000_000;
    const { client, last } = setup({ session: true, now: () => local });
    client.resume();
    last().trigger('update', update(1, [], 1_030_000)); // serveur 30 s en avance
    expect(client.serverNow()).toBe(1_030_000);
    local += 5_000;
    expect(client.serverNow()).toBe(1_035_000);
  });
  it('les mises à jour périmées ou d’une autre room sont ignorées', () => {
    const { client, last } = setup({ session: true });
    client.resume();
    last().trigger('update', update(5));
    last().trigger('update', update(3));
    last().trigger('update', { ...update(9), roomCode: 'POKER-ZZZZ' });
    expect(client.state.version).toBe(5);
  });
});

describe('envoi de commandes', () => {
  const ready = () => {
    const s = setup({ session: true });
    s.client.resume();
    s.last().trigger('connect');
    s.last().trigger('update', update(1));
    return s;
  };
  it('accepté : true, sans notification', async () => {
    const { client, last } = ready();
    expect(await client.command({ type: 'VALIDATE' })).toBe(true);
    expect(last().emitted.at(-1)).toEqual({ event: 'command', payload: { type: 'VALIDATE' } });
    expect(client.state.toasts).toEqual([]);
  });
  it('refusé par les règles : message du serveur affiché', async () => {
    const { client, last } = ready();
    last().reply = () => ({ ok: false, error: { code: 'RULE', message: 'Désignez exactement 2 cartes', ruleCode: 'INCOMPLETE_SELECTION' } });
    expect(await client.command({ type: 'VALIDATE' })).toBe(false);
    expect(client.state.toasts.at(-1)).toMatchObject({ tone: 'error', text: 'Désignez exactement 2 cartes' });
  });
  it('hors ligne : l’action n’est pas envoyée et le joueur est prévenu', async () => {
    const { client, last } = ready();
    last().trigger('disconnect');
    expect(await client.command({ type: 'VALIDATE' })).toBe(false);
    expect(last().emitted).toEqual([]);
    expect(client.state.toasts.at(-1)?.text).toMatch(/Connexion perdue/);
  });
  it('sans réponse du serveur : délai signalé', async () => {
    const { client, last } = ready();
    last().reply = () => 'TIMEOUT';
    expect(await client.command({ type: 'VALIDATE' })).toBe(false);
    expect(client.state.toasts.at(-1)?.text).toMatch(/n’a pas répondu/);
  });
  it('onSound : « select » pour une sélection, « confirm » pour les autres commandes, « error » en cas de refus', async () => {
    const { client } = ready();
    const heard: string[] = [];
    client.onSound = (k) => heard.push(k);
    await client.command({ type: 'SELECT', cards: ['As'] });
    await client.command({ type: 'VALIDATE' });
    expect(heard).toEqual(['select', 'confirm']);
  });
  it('onSound : « error » sur un refus du serveur, jamais « confirm »', async () => {
    const { client, last } = ready();
    last().reply = () => ({ ok: false, error: { code: 'RULE', message: 'Refusé' } });
    const heard: string[] = [];
    client.onSound = (k) => heard.push(k);
    await client.command({ type: 'VALIDATE' });
    expect(heard).toEqual(['error']);
  });
  it('onSound : silencieux par défaut avant d’être réglé depuis l’interface', async () => {
    const { client } = ready();
    expect(() => client.onSound('confirm')).not.toThrow(); // valeur par défaut sûre, no-op
  });

  it('approveAssistance : envoie le bon événement avec la valeur choisie', async () => {
    const { client, last } = ready();
    await client.approveAssistance(true);
    await client.approveAssistance(false);
    const sent = last().emitted.filter((e) => e.event === 'lobby:approveAssistance');
    expect(sent.map((e) => e.payload)).toEqual([{ approve: true }, { approve: false }]);
  });
  it('approveAssistance : refus du serveur → notification d’erreur, résultat faux', async () => {
    const { client, last } = ready();
    last().reply = () => ({ ok: false, error: { code: 'WRONG_STATE', message: 'La partie a déjà démarré' } });
    expect(await client.approveAssistance(true)).toBe(false);
    expect(client.state.toasts.at(-1)).toMatchObject({ tone: 'error', text: 'La partie a déjà démarré' });
  });

  it('actions d’hôte et de salle : bons événements', async () => {
    const { client, last } = ready();
    await client.startGame();
    await client.cancelRoom();
    await client.excludePlayer('p2');
    await client.resync();
    expect(last().emitted.map((e) => e.event)).toEqual(['lobby:start', 'lobby:cancel', 'host:exclude', 'state:resync']);
    expect(last().emitted[2]!.payload).toEqual({ playerId: 'p2' });
  });
  it('quitter la salle : session effacée seulement si le serveur accepte', async () => {
    const a = ready();
    a.last().reply = () => ({ ok: false, error: { code: 'X', message: 'Refusé' } });
    expect(await a.client.leaveLobby()).toBe(false);
    expect(a.storage.load()).not.toBeNull();
    const b = ready();
    expect(await b.client.leaveLobby()).toBe(true);
    expect(b.storage.load()).toBeNull();
  });
});

describe('notifications', () => {
  const ev = (type: string, visibility: 'PUBLIC' | 'PLAYER', data = {}): RoundEvent => ({ type, visibility, data });
  const ready = () => {
    const s = setup({ session: true });
    s.client.resume();
    return s;
  };
  it('avertissement privé à 10 s et assurance disponible : rappelés en notification', () => {
    const { client, last } = ready();
    last().trigger('update', update(1, [ev('WARNING', 'PLAYER', { secondsLeft: 10 }), ev('INSURANCE_AVAILABLE', 'PLAYER')]));
    expect(client.state.toasts.map((t) => t.text)).toEqual(['Sélection incomplète — il vous reste 10 secondes', 'Assurance disponible : vous êtes à 1 point de la victoire']);
  });
  it('événements publics : pas de notification (ils passent par les annonces)', () => {
    const { client, last } = ready();
    last().trigger('update', update(1, [ev('SHOWDOWN', 'PUBLIC', {}), ev('PLAYER_FOLDED', 'PUBLIC', { player: 'p2' })]));
    expect(client.state.toasts).toEqual([]);
    expect(client.state.feed).toHaveLength(2);
  });
  it('4 notifications au plus, fermeture individuelle', () => {
    const { client } = ready();
    for (let i = 0; i < 7; i++) client.toast('info', `n${i}`);
    expect(client.state.toasts.map((t) => t.text)).toEqual(['n3', 'n4', 'n5', 'n6']);
    client.dismissToast(client.state.toasts[0]!.id);
    expect(client.state.toasts).toHaveLength(3);
  });
  it('vue de test cohérente', () => {
    expect(game().players).toHaveLength(3);
  });
});
