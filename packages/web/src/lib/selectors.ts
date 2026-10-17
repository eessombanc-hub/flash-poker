import type { OpponentHandView, OwnHandView, PlayerPublic, RoomView, RoundView } from './types';

export const nick = (view: RoomView, id: string): string => view.players.find((p) => p.id === id)?.nickname ?? 'Un joueur';

export const meOf = (view: RoomView): PlayerPublic => view.players.find((p) => p.id === view.you.playerId)!;

/** Joueurs assis, dans l'ordre des positions (UTG en premier) ; en lobby, dans l'ordre d'arrivée. */
export function seatedPlayers(view: RoomView): PlayerPublic[] {
  if (!view.game) return view.players;
  const order = view.game.players.map((p) => p.player);
  return order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerPublic => !!p);
}

export const queuedPlayers = (view: RoomView): PlayerPublic[] => view.players.filter((p) => p.state === 'QUEUED');

export const isSeated = (view: RoomView): boolean => view.game !== null && view.game.players.some((p) => p.player === view.you.playerId);

export function ownCards(round: RoundView, me: string): { code: string | null; visible: boolean }[] {
  const h = round.cards.hands[me];
  return h && h.kind === 'own' ? (h as OwnHandView).cards : [];
}

export function opponentCards(round: RoundView, id: string): { shown: string[]; hiddenCount: number } {
  const h = round.cards.hands[id];
  return h && h.kind === 'opponent' ? { shown: (h as OpponentHandView).shown, hiddenCount: (h as OpponentHandView).hiddenCount } : { shown: [], hiddenCount: 0 };
}

export const scoreOf = (view: RoomView, id: string): number => view.game?.players.find((p) => p.player === id)?.score ?? 0;

/** Joueurs excluant de la manche : exclus par l'hôte ou hors partie. */
export const isExcluded = (view: RoomView, id: string): boolean => view.players.find((p) => p.id === id)?.excluded ?? false;
