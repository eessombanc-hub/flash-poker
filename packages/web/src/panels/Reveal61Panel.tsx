import { PlayingCard } from '../components/Card';
import { StaticHand } from '../components/Hand';
import { Badge, Button } from '../components/ui';
import { useClient } from '../lib/context';
import { deNom } from '../lib/format';
import { categoryLabel, NEXT_REASON_TEXT } from '../lib/labels';
import { reveal61Info } from '../lib/roundInfo';
import { nick, ownCards } from '../lib/selectors';
import { useSettings } from '../lib/settings';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';

/** 6-1 : le joueur à la main visible la plus faible retourne une carte ; l'ordre est recalculé après chaque révélation. */
export function Reveal61Panel() {
  const client = useClient();
  const { view, game, round, me, canAct } = useTable();
  const { fourColor } = useSettings();
  if (!round) return null;
  const info = reveal61Info(round);
  const n = game.players.length;
  const mine = ownCards(round, me);
  const firstHidden = mine.findIndex((c) => !c.visible);
  const myTurn = info.next === me && canAct;
  const last = info.history.at(-1);

  // Classement courant (cartes visibles + plateau), du plus faible au plus fort
  const ranking = last
    ? Object.entries(last.ranking)
        .map(([pid, r]) => ({ pid, ...r }))
        .sort((a, b) => a.rank - b.rank)
    : [];

  return (
    <PanelShell
      eyebrow={`6-1 — révélation ${Math.min(info.reveals + 1, 5 * n)} / ${5 * n}`}
      title={info.next ? (myTurn ? 'À toi de révéler' : `${nick(view, info.next)} doit révéler`) : 'Showdown'}
      hint={info.next && info.reason ? `Joueur le plus faible désigné : ${NEXT_REASON_TEXT[info.reason]}. Sans retournement en 60 secondes, la carte est retournée automatiquement.` : undefined}
      timerLabel="Retournement"
    >
      {myTurn && (
        <div className="mb-4 flex justify-center">
          <Button onClick={() => void client.command({ type: 'REVEAL' })} className="w-full py-3.5 text-base sm:w-auto sm:min-w-[18rem]">
            Retourner ma carte
          </Button>
        </div>
      )}
      {!myTurn && info.next && <WaitingNote>En attente {deNom(nick(view, info.next))}…</WaitingNote>}

      {last && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-ivory-100" aria-live="polite">
          <PlayingCard code={last.card} size="xs" fourColor={fourColor} flip />
          <span>
            <strong>{nick(view, last.revealer)}</strong> vient de retourner une carte.
            {last.nextRevealer && (
              <>
                {' '}
                Nouvel ordre : <strong>{nick(view, last.nextRevealer)}</strong> révèle.
              </>
            )}
          </span>
        </div>
      )}

      {ranking.length > 0 && (
        <ol className="mt-4 space-y-1.5" aria-label="Mains visibles, de la plus faible à la plus forte">
          {ranking.map((r, i) => (
            <li key={r.pid} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${r.pid === info.next ? 'bg-gold-500/20 ring-1 ring-gold-400' : 'bg-ink-900/60'}`}>
              <span className="flex items-center gap-2">
                <span className="w-5 text-xs text-ivory-300/60">{i + 1}</span>
                <span className="font-medium text-ivory-50">{nick(view, r.pid)}</span>
                {i === 0 && <Badge tone="amber">Plus faible</Badge>}
              </span>
              <span className="text-ivory-200/85">{categoryLabel(r.category)}</span>
            </li>
          ))}
        </ol>
      )}

      {mine.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-center text-[10px] uppercase tracking-widest text-ivory-300/70 sm:mb-2 sm:text-xs">
            Votre main<span className="hidden sm:inline"> — cartes retournées dans l’ordre de distribution</span>
          </p>
          <StaticHand label="Votre main" size="md" cards={mine.map((c, i) => ({ code: c.code, visible: c.visible, next: i === firstHidden }))} />
        </div>
      )}
    </PanelShell>
  );
}
