import { SelectableHand, useDraft } from '../components/Hand';
import { AssistBadge } from '../components/AssistBadge';
import { assistCategory } from '../lib/roundInfo';
import { Badge, Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { discardInfo } from '../lib/roundInfo';
import { ownCards } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';

/** Aviation (jeter 1 puis 1) et Avia 6 (jeter 2 puis 2) : défausse exacte et obligatoire. */
export function DiscardPanel() {
  const client = useClient();
  const { game, round, me, canAct, timerKey } = useTable();
  const info = round ? discardInfo(round) : null;
  const { draft, toggle } = useDraft(info?.yourDraft ?? [], timerKey, (cards) => void client.command({ type: 'SELECT', cards }));
  if (!round || !info) return null;
  const n = info.discardCount;
  const hand = sortHand(ownCards(round, me).map((c) => c.code!));
  const validated = info.validated.includes(me);
  const folded = info.status[me] === 'FOLDED';
  const active = Object.values(info.status).filter((s) => s === 'ACTIVE').length;

  return (
    <PanelShell
      eyebrow={`${round.variant === 'AVIATION' ? 'Aviation' : 'Avia 6'}, défausse ${info.step} / 2`}
      title={`Jetez exactement ${n} carte${n > 1 ? 's' : ''}`}
      hint={`Après le ${info.step === 1 ? 'flop' : 'turn'}. Il vous restera ${hand.length - n} carte${hand.length - n > 1 ? 's' : ''}. Sans défausse complète à l’échéance, votre main est couchée.`}
    >
      {folded ? (
        <>
          <div className="mb-3 flex justify-center">
            <Badge tone="amber">Votre main est couchée pour cette manche</Badge>
          </div>
          <SelectableHand label="Votre main (couchée)" cards={hand} selected={[]} max={0} disabled dimmed onToggle={() => undefined} />
        </>
      ) : canAct ? (
        <>
          <SelectableHand label="Votre main" cards={hand} selected={draft} max={n} disabled={validated} onToggle={(c) => toggle(c, n)} />
          <AssistBadge active={game.assistance} category={assistCategory(round)} waiting="Combinaison des cartes que vous gardez" />
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {draft.length} / {n} carte{n > 1 ? 's' : ''} à jeter
            </p>
            <Button disabled={validated || draft.length !== n} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? 'Défausse validée' : 'Valider ma défausse'}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">En attente des autres joueurs ({info.validated.length} / {active})</p>}
          </div>
        </>
      ) : (
        <WaitingNote>Vous suivez la partie en spectateur.</WaitingNote>
      )}
      {game.players.length > 0 && active < game.players.length && <p className="mt-3 text-center text-xs text-ivory-300/70">{game.players.length - active} main(s) couchée(s) : hors manche, sans showdown.</p>}
    </PanelShell>
  );
}
