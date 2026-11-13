import { useGame } from './context';
import { isSeated } from './selectors';

/** Contexte de la table pour les panneaux : qui je suis, ai-je le droit d'agir, quelle manche est en cours. */
export function useTable() {
  const view = useGame((s) => s.view)!;
  const game = view.game!;
  const me = view.you.playerId;
  const spectator = view.you.role === 'SPECTATOR';
  const mePub = view.players.find((p) => p.id === me)!;
  const seated = isSeated(view);
  return {
    view,
    game,
    round: game.round,
    me,
    mePub,
    seated,
    /** Regarde la partie sans y jouer : aucune main, aucune action. */
    spectator,
    excluded: mePub?.excluded ?? false,
    /** Assis, non exclu, partie en cours. */
    canAct: seated && !spectator && !mePub?.excluded && view.status === 'RUNNING',
    deadlineAt: view.deadline?.at ?? null,
    timerKey: game.timer?.key ?? '',
  };
}
