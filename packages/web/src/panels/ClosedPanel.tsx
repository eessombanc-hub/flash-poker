import { useEffect, useRef, useState } from 'react';
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

/** Temps d'arrêt avant de pouvoir choisir : à l'ouverture de la partie, puis après chaque change (pour voir les cartes reçues). */
export const closedPause = { first: 3000, next: 4000 };

/**
 * Compte à rebours de lecture : renvoie les secondes restantes, relancé à chaque nouvelle phase (`phaseKey`).
 * La pause ne bloque que la validation côté écran : le minuteur de la phase, géré par le serveur, court déjà.
 */
function useReadingPause(phaseKey: string | null, ms: number): number {
  const seen = useRef<string | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!phaseKey || seen.current === phaseKey) return;
    seen.current = phaseKey;
    if (ms <= 0) return;
    const end = Date.now() + ms;
    setLeft(Math.ceil(ms / 1000));
    const id = setInterval(() => {
      const rest = Math.ceil((end - Date.now()) / 1000);
      if (rest <= 0) {
        setLeft(0);
        clearInterval(id);
      } else setLeft(rest);
    }, 250);
    return () => clearInterval(id);
  }, [phaseKey, ms]);
  return left;
}

/** Poker fermé, 1 ou 2 changes : jeter de 0 à 3 cartes, simultanément et en secret. */
export function ClosedPanel() {
  const { t, tp } = useI18n();
  const client = useClient();
  const { game, round, me, canAct, timerKey } = useTable();
  const info = round ? closedInfo(round) : null;
  const { draft, toggle } = useDraft(info?.yourDraft ?? [], timerKey, (cards) => void client.command({ type: 'SELECT', cards }));
  const hand = round ? sortHand(ownCards(round, me).map((c) => c.code!)) : [];
  // Cartes reçues au change précédent : celles de la main qui n'y figuraient pas.
  const previous = useRef<{ key: string | null; hand: string[] }>({ key: null, hand: [] });
  const [fresh, setFresh] = useState<string[]>([]);
  const phaseId = timerKey ?? (info ? `c${info.change}` : null);
  if (previous.current.key !== phaseId && info) {
    const before = previous.current.hand;
    const received = before.length > 0 ? hand.filter((c) => !before.includes(c)) : [];
    previous.current = { key: phaseId, hand };
    if (received.length !== fresh.length || received.some((c, i) => c !== fresh[i])) setFresh(received);
  }
  const pause = useReadingPause(info && canAct ? phaseId : null, info && info.change > 1 ? closedPause.next : closedPause.first);
  if (!round || !info) return null;
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
          <SelectableHand label={t('closed.votre_main')} cards={hand} selected={draft} max={3} assist={assistCards(round)} fresh={fresh} disabled={validated || pause > 0} onToggle={(c) => toggle(c, 3)} fan />
          <AssistBadge active={game.assistance} category={assistCategory(round)} />
          <div className="mt-4 flex flex-col items-center gap-2">
            {pause > 0 && fresh.length > 0 && <p className="text-sm font-semibold text-gold-300" role="status">{tp('closed.recues', fresh.length)}</p>}
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {draft.length === 0 ? t('closed.aucune_carte_selectionnee') : tp('closed.carte_a_changer', draft.length)}
            </p>
            <Button disabled={validated || pause > 0} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {pause > 0 ? t('closed.pause', { n: pause }) : validated ? t('closed.change_valide') : draft.length === 0 ? t('closed.garder_ma_main') : tp('closed.changer_carte', draft.length)}
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
