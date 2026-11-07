import { SelectableHand, useDraft } from '../components/Hand';
import { AssistBadge } from '../components/AssistBadge';
import { assistCategory } from '../lib/roundInfo';
import { Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { closedInfo } from '../lib/roundInfo';
import { ownCards } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';

/** Poker fermé, 1 ou 2 changes : jeter de 0 à 3 cartes, simultanément et en secret. */
export function ClosedPanel() {
  const client = useClient();
  const { game, round, me, canAct, timerKey } = useTable();
  const info = round ? closedInfo(round) : null;
  const { draft, toggle } = useDraft(info?.yourDraft ?? [], timerKey, (cards) => void client.command({ type: 'SELECT', cards }));
  if (!round || !info) return null;
  const hand = sortHand(ownCards(round, me).map((c) => c.code!));
  const validated = info.validated.includes(me);
  const total = game.players.length;

  return (
    <PanelShell
      eyebrow={`Poker fermé, change ${info.change} / ${info.totalChanges}`}
      title="Choisissez les cartes à changer"
      hint="De 0 à 3 cartes. Les changes sont simultanés et secrets. Sans action à l’échéance, votre main reste telle quelle."
    >
      {canAct ? (
        <>
          <SelectableHand label="Votre main" cards={hand} selected={draft} max={3} disabled={validated} onToggle={(c) => toggle(c, 3)} fan />
          <AssistBadge active={game.assistance} category={assistCategory(round)} />
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {draft.length === 0 ? 'Aucune carte sélectionnée' : `${draft.length} carte${draft.length > 1 ? 's' : ''} à changer`}
            </p>
            <Button disabled={validated} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? 'Change validé' : draft.length === 0 ? 'Garder ma main' : `Changer ${draft.length} carte${draft.length > 1 ? 's' : ''}`}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">En attente des autres joueurs ({info.validated.length} / {total})</p>}
          </div>
        </>
      ) : (
        <WaitingNote>Vous suivez la partie en spectateur.</WaitingNote>
      )}
    </PanelShell>
  );
}
