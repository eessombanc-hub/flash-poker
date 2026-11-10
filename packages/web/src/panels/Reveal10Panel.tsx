import { PlayingCard } from '../components/Card';
import { StaticHand } from '../components/Hand';
import { Badge, Button } from '../components/ui';
import { useClient } from '../lib/context';
import { deNom } from '../lib/format';
import { categoryLabel, NEXT_REASON_TEXT_10 } from '../lib/labels';
import { reveal10Info } from '../lib/roundInfo';
import { nick, ownCards } from '../lib/selectors';
import { useSettings } from '../lib/settings';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';
import { useI18n } from '../i18n';

/** Le 10 : comme au 6-1, mais sans plateau commun — le classement ne porte que sur les cartes visibles de chacun. */
export function Reveal10Panel() {
  const { t } = useI18n();
  const client = useClient();
  const { view, game, round, me, canAct } = useTable();
  const { fourColor } = useSettings();
  if (!round) return null;
  const info = reveal10Info(round);
  const n = game.players.length;
  const mine = ownCards(round, me);
  const firstHidden = mine.findIndex((c) => !c.visible);
  const myTurn = info.next === me && canAct;
  const last = info.history.at(-1);

  const ranking = last
    ? Object.entries(last.ranking)
        .map(([pid, r]) => ({ pid, ...r }))
        .sort((a, b) => a.rank - b.rank)
    : [];

  return (
    <PanelShell
      eyebrow={t('reveal10.le_10_revelation', { min: Math.min(info.reveals + 1, 9 * n), n: 9 * n })}
      title={info.next ? (myTurn ? t('reveal10.a_toi_de') : t('reveal10.doit_reveler', { nick: nick(view, info.next) })) : t('reveal10.showdown')}
      hint={info.next && info.reason ? t('reveal10.joueur_le_plus', { v: NEXT_REASON_TEXT_10[info.reason] }) : undefined}
      timerLabel={t('reveal10.retournement')}
    >
      {myTurn && (
        <div className="mb-4 flex justify-center">
          <Button onClick={() => void client.command({ type: 'REVEAL' })} className="w-full py-3.5 text-base sm:w-auto sm:min-w-[18rem]">
            {t('reveal10.retourner_ma_carte')}</Button>
        </div>
      )}
      {!myTurn && info.next && <WaitingNote>{t('reveal10.en_attente', { v: deNom(nick(view, info.next)) })}</WaitingNote>}

      {last && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-ivory-100" aria-live="polite">
          <PlayingCard code={last.card} size="xs" fourColor={fourColor} flip />
          <span>
            <strong>{nick(view, last.revealer)}</strong>  {t('reveal10.vient_de_retourner')}{last.nextRevealer && (
              <>
                {' '}
                {t('reveal10.nouvel_ordre')} <strong>{nick(view, last.nextRevealer)}</strong>  {t('reveal10.revele')}</>
            )}
          </span>
        </div>
      )}

      {ranking.length > 0 && (
        <ol className="mt-4 space-y-1.5" aria-label={t('reveal10.mains_visibles_de')}>
          {ranking.map((r, i) => (
            <li key={r.pid} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${r.pid === info.next ? 'bg-gold-500/20 ring-1 ring-gold-400' : 'bg-ink-900/60'}`}>
              <span className="flex items-center gap-2">
                <span className="w-5 text-xs text-ivory-300/60">{i + 1}</span>
                <span className="font-medium text-ivory-50">{nick(view, r.pid)}</span>
                {i === 0 && <Badge tone="amber">{t('reveal10.plus_faible')}</Badge>}
              </span>
              <span className="text-ivory-200/85">{categoryLabel(r.category)}</span>
            </li>
          ))}
        </ol>
      )}

      {mine.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-center text-xs uppercase tracking-widest text-ivory-300/70">{t('reveal10.votre_main_cartes')}</p>
          <StaticHand label={t('reveal10.votre_main')} size="sm" cards={mine.map((c, i) => ({ code: c.code, visible: c.visible, next: i === firstHidden }))} />
        </div>
      )}
    </PanelShell>
  );
}
