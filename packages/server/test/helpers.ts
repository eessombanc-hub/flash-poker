import { SeededRng } from '@poker/engine';
import { expect } from 'vitest';
import { ServerError } from '../src/errors';
import type { Outgoing, UpdateMessage } from '../src/protocol';
import { RoomManager, type RoomManagerDeps } from '../src/roomManager';
import { ManualScheduler } from '../src/scheduler';
import { InMemoryRoomStore } from '../src/store';

// ---------- Paquets truqués : l'indice = la POSITION à la table (UTG = 0) ----------
export function dealStack(hands: string[][], rest: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < hands[0]!.length; i++) for (const h of hands) out.push(h[i]!);
  return [...out, ...rest];
}
export const WIN = ['As', 'Ad', '2c', '7d', '9h']; // paire d'As
export const LOSERS = [
  ['Ks', 'Qd', '8c', '5h', '3s'],
  ['Kd', 'Jc', '9d', '6h', '4s'],
  ['Kh', 'Tc', '7s', '5c', '2s'],
];
/** Fermé : le joueur en position `w` gagne sans rien changer. */
export function closedWin(n: number, w: number): string[] {
  let li = 0;
  return dealStack(Array.from({ length: n }, (_, i) => (i === w ? WIN : LOSERS[li++]!)));
}
export const AVIATION_HANDS = [
  ['As', 'Ad', '2c', '3d'],
  ['Ks', 'Kd', '4c', '5d'],
  ['7s', '8d', '9c', 'Th'],
];
export const aviationStack = () => dealStack(AVIATION_HANDS, ['Ah', '9s', 'Js', '3c', '2h']);
export const H63 = [
  ['9h', 'Th', 'As', 'Ad', '3c', '4d'],
  ['Ah', 'Ac', '5s', '6d', '8c', '3h'],
  ['Kd', 'Ks', '7s', '8d', '9s', '2h'],
];
export const stack63 = () => dealStack(H63, ['Jh', 'Qh', '2d', '4c', '7c', '2s', 'Kh']);

// ---------- Environnement de test ----------
export interface Env {
  m: RoomManager;
  scheduler: ManualScheduler;
  store: InMemoryRoomStore;
  out: Outgoing[];
  code: string;
  host: { playerId: string; token: string };
  /** Joueurs dans l'ordre des positions (UTG en premier). */
  order: string[];
  tokens: Record<string, string>;
  act: (idx: number, cmd: unknown) => void;
  updates: (playerId: string) => UpdateMessage[];
}

let counter = 0;
export function makeManager(stacks: Record<number, string[]> = {}, deps: Partial<RoomManagerDeps> = {}) {
  const scheduler = (deps.scheduler as ManualScheduler | undefined) ?? new ManualScheduler();
  const store = (deps.store as InMemoryRoomStore | undefined) ?? new InMemoryRoomStore();
  const out: Outgoing[] = [];
  const m = new RoomManager({
    rng: new SeededRng(7),
    scheduler,
    store,
    tokenFactory: () => `token_${++counter}_0123456789abcdef`,
    idFactory: () => `p${++counter}`,
    gameHooks: { stackedDeck: (r) => stacks[r] },
    ...deps,
  });
  m.onOutgoing((o) => out.push(o));
  return { m, scheduler, store, out };
}

/** Room démarrée : l'hôte + n−1 joueurs, tous connectés. */
export function setup(n: number, stacks: Record<number, string[]> = {}, cfg: Record<string, unknown> = {}, deps: Partial<RoomManagerDeps> = {}): Env {
  const { m, scheduler, store, out } = makeManager(stacks, deps);
  const host = m.createRoom({ name: 'Table', maxPlayers: 6, targetPoints: 5, stakeChips: 2000, nickname: 'Host', ...cfg });
  const tokens: Record<string, string> = { [host.playerId]: host.token };
  const ids = [host.playerId];
  for (let i = 1; i < n; i++) {
    const j = m.joinRoom(host.code, { nickname: `J${i}` });
    tokens[j.playerId] = j.token;
    ids.push(j.playerId);
  }
  for (const id of ids) m.connect(host.code, id);
  m.startGame(host.code, host.playerId);
  const order = m._debug(host.code).game!.players();
  return {
    m, scheduler, store, out, code: host.code, host, order, tokens,
    act: (idx, cmd) => m.command(host.code, order[idx]!, cmd),
    updates: (playerId) => out.filter((o) => o.playerId === playerId && o.message.type === 'update').map((o) => o.message as UpdateMessage),
  };
}

export function expectErr(fn: () => unknown, code: string, ruleCode?: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ServerError);
    expect((e as ServerError).code).toBe(code);
    if (ruleCode) expect((e as ServerError).ruleCode).toBe(ruleCode);
    return;
  }
  throw new Error(`Une ServerError ${code} était attendue`);
}

const CODE = /"([2-9TJQKA][cdhs])"/g;
export const codesIn = (v: unknown): Set<string> => new Set([...JSON.stringify(v).matchAll(CODE)].map((x) => x[1]!));
