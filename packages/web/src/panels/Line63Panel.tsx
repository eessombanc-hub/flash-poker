import { PlayingCard } from '../components/Card';
import { AssistBadge } from '../components/AssistBadge';
import { assistCategory } from '../lib/roundInfo';
import { SelectableHand, useDraft } from '../components/Hand';
import { Badge, Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { formatLinePoints } from '../lib/format';
import { categoryLabel } from '../lib/labels';
import { line63Info } from '../lib/roundInfo';
import { nick, ownCards } from '../lib/selectors';
import { useSettings } from '../lib/settings';
import { useTable } from '../lib/table';
import type { LineResult, RoomView } from '../lib/types';
import { PanelShell, WaitingNote } from './Shell';

/**
 * 6-3 : à chaque ligne, le joueur désigne 2 cartes privées. RÈGLE ABSOLUE : AUCUNE AIDE. Rien n'est calculé ni affiché
 * sur la force de la main ou de la paire choisie avant la résolution de la ligne (ni suggestion, ni indice).
 */
export function Line63Panel() {
  const client = useClient();
  const { view, game, round, me, canAct, timerKey } = useTable();
  const info = round ? line63Info(round) : null;
  const { draft, toggle } = useDraft(info?.yourDraft ?? [], timerKey, (cards) => void client.command({ type: 'SELECT', cards }));
  if (!round || !info) return null;
  const hand = sortHand(ownCards(round, me).map((c) => c.code!));
  const validated = info.validated.includes(me);
  const total = game.players.length;

  return (
    <PanelShell
      eyebrow="6-3"
      title={
        <>
          LIGNE {info.line} <span className="text-gold-400">/ 3</span>
        </>
      }
      hint="Désignez 2 de vos 6 cartes. Aucune aide n’est fournie : la ligne est évaluée sur la paire que vous désignez. Sans paire complète à l’échéance, la ligne est perdue."
    >
      {canAct ? (
        <>
          <SelectableHand label="Votre main" cards={hand} selected={draft} max={2} disabled={validated} onToggle={(c) => toggle(c, 2)} />
          <AssistBadge active={game.assistance} category={assistCategory(round)} waiting="Désignez 2 cartes" />
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ivory-200/80" aria-live="polite">
              {draft.length} / 2 cartes désignées
            </p>
            <Button disabled={validated || draft.length !== 2} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? 'Combinaison verrouillée' : 'Valider ma combinaison'}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">Désignation secrète, dévoilée avec celle des autres ({info.validated.length} / {total})</p>}
          </div>
        </>
      ) : (
        <WaitingNote>Vous suivez la partie en spectateur.</WaitingNote>
      )}
      {info.lines.length > 0 && <LinesRecap lines={info.lines} view={view} scale={info.unitsScale} />}
    </PanelShell>
  );
}

/** Lignes déjà closes : désignations dévoilées ensemble, gagnant et points de ligne. */
export function LinesRecap({ lines, view, scale }: { lines: LineResult[]; view: RoomView; scale: number }) {
  const { fourColor } = useSettings();
  return (
    <div className="mt-6 space-y-3 border-t border-ivory-100/10 pt-4" aria-label="Lignes terminées">
      {lines.map((l) => (
        <div key={l.line} className="rounded-xl border border-ivory-100/10 bg-ink-900/60 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ivory-50">
            Ligne {l.line}
            {l.winners.length === 0 ? <Badge tone="amber">Aucun gagnant</Badge> : <Badge tone="gold">{l.winners.map((w) => nick(view, w)).join(' + ')} · {formatLinePoints(l.unitsEach, scale)} pt{l.winners.length > 1 ? ' chacun' : ''}</Badge>}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(l.designations).map(([pid, d]) => (
              <li key={pid} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${l.winners.includes(pid) ? 'bg-gold-500/15' : 'bg-ink-800/60'}`}>
                <span className="w-20 truncate font-medium text-ivory-100">{nick(view, pid)}</span>
                {d ? (
                  <>
                    <span className="flex -space-x-2">
                      {d.pair.map((c) => (
                        <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
                      ))}
                    </span>
                    <span className="text-ivory-200/85">{categoryLabel(d.category)}</span>
                  </>
                ) : (
                  <span className="text-amber-200/90">Ligne perdue</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
