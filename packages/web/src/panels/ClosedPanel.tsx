import { SelectableHand, useDraft } from '../components/Hand';
import { AssistBadge } from '../components/AssistBadge';
import { assistCards, assistCategory } from '../lib/roundInfo';
import { Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { closedInfo } from '../lib/roundInfo';
import { ownCards } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';
import { useI18n } from '../i18n';

/** Poker fermé, 1 ou 2 changes : jeter de 0 à 3 cartes, simultanément et en secret. */
export function ClosedPanel() {
  const { t, tp } = useI18n();
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
      eyebrow={t('closed.poker_ferme_change', { change: info.change, totalChanges: info.totalChanges })}
      title={t('closed.choisissez_les_cartes')}
      hint={t('closed.de_0_a')}
    >
      {canAct ? (
        <>
          <SelectableHand label={t('closed.votre_main')} cards={hand} selected={draft} max={3} assist={assistCards(round)} disabled={validated} onToggle={(c) => toggle(c, 3)} fan />
          <AssistBadge active={game.assistance} category={assistCategory(round)} />
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {draft.length === 0 ? t('closed.aucune_carte_selectionnee') : tp('closed.carte_a_changer', draft.length)}
            </p>
            <Button disabled={validated} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? t('closed.change_valide') : draft.length === 0 ? t('closed.garder_ma_main') : tp('closed.changer_carte', draft.length)}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">{t('closed.en_attente_des', { n: info.validated.length, total })}</p>}
          </div>
        </>
      ) : (
        <WaitingNote>{t('closed.vous_suivez_la')}</WaitingNote>
      )}
    </PanelShell>
  );
}
