import { SelectableHand, useDraft } from '../components/Hand';
import { AssistBadge } from '../components/AssistBadge';
import { assistCards, assistCategory } from '../lib/roundInfo';
import { Badge, Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { discardInfo } from '../lib/roundInfo';
import { ownCards } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';
import { useI18n } from '../i18n';

/** Aviation (jeter 1 puis 1) et Avia 6 (jeter 2 puis 2) : défausse exacte et obligatoire. */
export function DiscardPanel() {
  const { t, tp } = useI18n();
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
      eyebrow={t('discard.defausse_2', { v: round.variant === 'AVIATION' ? t('discard.aviation') : t('discard.avia_6'), step: info.step })}
      title={tp('discard.jetez_exactement_carte', n)}
      hint={tp(info.step === 1 ? 'discard.apres_flop' : 'discard.apres_turn', hand.length - n)}
    >
      {folded ? (
        <>
          <div className="mb-3 flex justify-center">
            <Badge tone="amber">{t('discard.votre_main_est')}</Badge>
          </div>
          <SelectableHand label={t('discard.votre_main_couchee')} cards={hand} selected={[]} max={0} disabled dimmed onToggle={() => undefined} />
        </>
      ) : canAct ? (
        <>
          <SelectableHand label={t('discard.votre_main')} cards={hand} selected={draft} max={n} assist={assistCards(round)} disabled={validated} onToggle={(c) => toggle(c, n)} />
          <AssistBadge active={game.assistance} category={assistCategory(round)} waiting={t('discard.combinaison_des_cartes')} />
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {tp('discard.carte', n, { n: draft.length, n2: n })}</p>
            <Button disabled={validated || draft.length !== n} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? t('discard.defausse_validee') : t('discard.valider_ma_defausse')}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">{t('discard.en_attente_des', { n: info.validated.length, active })}</p>}
          </div>
        </>
      ) : (
        <WaitingNote>{t('discard.vous_suivez_la')}</WaitingNote>
      )}
      {game.players.length > 0 && active < game.players.length && <p className="mt-3 text-center text-xs text-ivory-300/70">{t('discard.main_s_couchee', { active: game.players.length - active })}</p>}
    </PanelShell>
  );
}
