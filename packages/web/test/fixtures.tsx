import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';
import { SettingsProvider } from '../src/lib/settings';
import type { GameView, PlayerPublic, RoomView, RoundView, VariantId } from '../src/lib/types';

export const ME = 'p1';
export const IDS = ['p1', 'p2', 'p3'];
export const NAMES: Record<string, string> = { p1: 'Emeric', p2: 'Alice', p3: 'Bob' };
const POS = ['UTG', 'UTG+1', 'UTG+2'];

export function players(n = 3, over: Partial<Record<string, Partial<PlayerPublic>>> = {}): PlayerPublic[] {
  return IDS.slice(0, n).map((id, i) => ({
    id,
    nickname: NAMES[id]!,
    avatar: null,
    registered: false,
    connected: true,
    state: 'SEATED' as const,
    isHost: i === 0,
    position: POS[i]!,
    score: 0,
    excluded: false,
    bot: false,
    assistanceApproved: true,
    ...over[id],
  }));
}

export function game(over: Partial<GameView> = {}, n = 3): GameView {
  return {
    phase: 'ROUND',
    roundNo: 1,
    chooser: 'p1',
    awaiting: [],
    targetPoints: 3,
    stakeChips: 2000,
    potChips: 2000 * n,
    assistance: false,
    players: IDS.slice(0, n).map((player, i) => ({ player, position: POS[i]!, score: 0, excluded: false })),
    maxPlayers: 6,
    timer: { kind: 'ROUND', key: 'k1' },
    warnings: [],
    evolution: {},
    variants: (['V6_3', 'V6_1', 'CLOSED_1', 'CLOSED_2', 'AVIATION', 'AVIA_6'] as VariantId[]).map((variant) => ({ variant, available: true })),
    insurance: { eligible: [], canPropose: false, blockedPartners: [], pending: null, accepted: [] },
    round: null,
    history: [],
    outcome: null,
    ...over,
  };
}

/** Vue de manche : ma main en clair, celle des adversaires en dos de cartes. */
export function round(variant: VariantId, mine: string[], info: Record<string, unknown>, opts: { board?: (string | null)[]; phase?: string; awaiting?: string[]; n?: number; hidden?: number; visibleMine?: boolean[] } = {}): RoundView {
  const n = opts.n ?? 3;
  const hands: RoundView['cards']['hands'] = {};
  // 6-1 et Le 10 : le serveur masque aussi les cartes cachées à leur propriétaire (il les découvre au même
  // rythme que ses adversaires) ; les autres variantes montrent toujours sa propre main en clair.
  const masks = variant === 'V6_1' || variant === 'LE10';
  IDS.slice(0, n).forEach((id) => {
    hands[id] =
      id === ME
        ? {
            kind: 'own',
            cards: mine.map((code, i) => {
              const visible = opts.visibleMine?.[i] ?? false;
              return { code: masks && !visible ? null : code, visible };
            }),
          }
        : { kind: 'opponent', shown: [], hiddenCount: opts.hidden ?? mine.length };
  });
  return { variant, phase: opts.phase ?? 'X', awaiting: opts.awaiting ?? IDS.slice(0, n), cards: { deckCount: 20, discardCount: 0, board: opts.board ?? [], hands }, info, result: null };
}

export function roomView(over: Partial<RoomView> = {}, g: GameView | null = game()): RoomView {
  const n = g?.players.length ?? 3;
  return {
    code: 'POKER-ABCD',
    name: 'Table test',
    status: g ? 'RUNNING' : 'WAITING',
    config: { maxPlayers: 6, targetPoints: 3, stakeChips: 2000, potChips: 2000 * n, assistance: false, private: false },
    seatsLeft: Math.max(0, 6 - n),
    hostId: 'p1',
    you: { playerId: ME, role: 'HOST' },
    players: players(n),
    version: 5,
    serverTime: Date.now(),
    deadline: g?.timer ? { at: Date.now() + 25_000, kind: g.timer.kind, key: g.timer.key } : null,
    game: g,
    ...over,
  };
}

/** Client sans réseau : l'état est injecté, les commandes sont espionnées. */
export function fakeClient(view: RoomView | null) {
  const client = new GameClient({ storage: new MemorySessionStore() });
  client.store.setState({ session: { code: 'POKER-ABCD', token: 't', playerId: ME, nickname: 'Emeric' }, view, connection: 'online', version: view?.version ?? 0 });
  const sent: unknown[] = [];
  client.command = async (cmd) => {
    sent.push(cmd);
    return true;
  };
  client.resume = () => false; // pas de réseau dans ces tests
  client.dispose = () => undefined;
  const calls = { start: 0, cancel: 0, leave: 0, excluded: [] as string[] };
  client.startGame = async () => ((calls.start += 1), true);
  client.cancelRoom = async () => ((calls.cancel += 1), true);
  client.leaveLobby = async () => ((calls.leave += 1), true);
  client.excludePlayer = async (id) => (calls.excluded.push(id), true);
  return { client, sent, calls };
}

export function renderWith(ui: ReactElement, view: RoomView | null) {
  const f = fakeClient(view);
  const utils = render(
    <SettingsProvider>
      <ClientProvider client={f.client}>{ui}</ClientProvider>
    </SettingsProvider>,
  );
  return { ...f, ...utils };
}
