import { useEffect, useState } from 'react';
import { PlayingCard } from '../components/Card';
import { AssistBadge } from '../components/AssistBadge';
import { assistCards, assistCategory } from '../lib/roundInfo';
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
import type { LineResult, RoomView, SideBet, SideBetPool, SideBetResult } from '../lib/types';
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
  if (info.stage === 'BETS') return <BetsPanel />;
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
      hint={`Désignez 2 de vos 6 cartes. ${info.teats > 0 ? `Votre meilleure main de 5 cartes peut combiner votre paire, les 5 cartes de la ligne et ${info.teats > 1 ? 'les 2 tétines' : 'la tétine'}. ` : ''}Aucune aide n’est fournie : la ligne est évaluée sur la paire que vous désignez. Sans paire complète à l’échéance, la ligne est perdue.`}
    >
      {canAct ? (
        <>
          <SelectableHand label="Votre main" cards={hand} selected={draft} max={2} assist={assistCards(round)} disabled={validated} onToggle={(c) => toggle(c, 2)} />
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
      {info.pools.length > 0 && <PoolsRecap pools={info.pools} results={info.sideResults} view={view} />}
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
            {l.winners.length === 0 ? <Badge tone="amber">Aucun gagnant</Badge> : <Badge tone="gold">{l.winners.map((w) => nick(view, w)).join(' + ')}, {formatLinePoints(l.unitsEach, scale)} pt{l.winners.length > 1 ? ' chacun' : ''}</Badge>}
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

const QUICK = [10, 50, 100, 250];

/** Phase de paris extérieurs : avant la distribution, chaque joueur choisit une ligne et un montant (jusqu'à un pari par ligne). */
export function BetsPanel() {
  const client = useClient();
  const { view, game, round, me, canAct, timerKey } = useTable();
  const info = round ? line63Info(round) : null;
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  useEffect(() => {
    const init: Record<number, string> = {};
    for (const b of info?.yourBets ?? []) init[b.line] = String(b.amount);
    setAmounts(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey]);
  if (!round || !info) return null;
  const validated = info.validated.includes(me);
  const bets: SideBet[] = [1, 2, 3].flatMap((line) => {
    const n = Math.floor(Number(amounts[line] ?? 0));
    return Number.isFinite(n) && n > 0 ? [{ line: line as 1 | 2 | 3, amount: n }] : [];
  });
  const total = bets.reduce((t, b) => t + b.amount, 0);
  const over = total > info.budget;
  const send = (next: Record<number, string>) => {
    const list = [1, 2, 3].flatMap((line) => {
      const n = Math.floor(Number(next[line] ?? 0));
      return n > 0 ? [{ line: line as 1 | 2 | 3, amount: n }] : [];
    });
    if (list.reduce((t, b) => t + b.amount, 0) <= info.budget) void client.command({ type: 'BET', bets: list });
  };
  const set = (line: number, v: string) => {
    const next = { ...amounts, [line]: v.replace(/[^0-9]/g, '') };
    setAmounts(next);
    send(next);
  };

  return (
    <PanelShell
      eyebrow="6-3 · Paris extérieurs"
      title="Pariez avant la distribution"
      hint="Choisissez une ligne et un montant. Un pari n’est actif que si au moins un autre joueur mise le même montant sur la même ligne : le meilleur de ceux-là, sans tenir compte des tétines, remporte la cagnotte à la fin de la ligne. Sans partenaire, la mise est rendue."
    >
      {canAct ? (
        <>
          <p className="text-sm text-ivory-200/85">
            Jetons disponibles : <strong className="text-gold-300">{info.budget}</strong>
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Paris par ligne">
            {[1, 2, 3].map((line) => (
              <li key={line} className="rounded-xl border border-ivory-100/10 bg-ink-900/60 p-3">
                <label htmlFor={`bet-${line}`} className="block text-sm font-semibold text-ivory-50">
                  Ligne {line}
                </label>
                <input
                  id={`bet-${line}`}
                  inputMode="numeric"
                  disabled={validated}
                  value={amounts[line] ?? ''}
                  placeholder="0"
                  onChange={(e) => set(line, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ivory-100/20 bg-ink-950 px-3 py-2 text-ivory-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {QUICK.map((q) => (
                    <button key={q} type="button" disabled={validated} onClick={() => set(line, String(q))} className="rounded-md border border-gold-500/40 px-2 py-0.5 text-xs text-gold-300 hover:bg-gold-500/10 disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                  <button type="button" disabled={validated} onClick={() => set(line, '')} className="rounded-md border border-ivory-100/20 px-2 py-0.5 text-xs text-ivory-200/80 hover:bg-ivory-100/5 disabled:opacity-50">
                    Aucun
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className={`text-sm ${over ? 'text-red-300' : 'text-ivory-200/80'}`} aria-live="polite">
              {over ? `Total ${total} : supérieur à vos jetons disponibles` : bets.length === 0 ? 'Aucun pari' : `Total misé : ${total} jetons`}
            </p>
            <Button disabled={validated || over} onClick={() => void client.command({ type: 'VALIDATE' })} className="w-full sm:w-auto sm:min-w-[16rem]">
              {validated ? 'Paris verrouillés' : bets.length === 0 ? 'Ne pas parier' : 'Valider mes paris'}
            </Button>
            {validated && <p className="text-sm text-ivory-200/80">En attente des autres joueurs ({info.validated.length} / {game.players.length})</p>}
          </div>
        </>
      ) : (
        <WaitingNote>Vous suivez la partie en spectateur.</WaitingNote>
      )}
    </PanelShell>
  );
}

/** Cagnottes engagées sur les lignes, avec leur issue une fois la ligne close. */
export function PoolsRecap({ pools, results, view }: { pools: SideBetPool[]; results: SideBetResult[]; view: RoomView }) {
  return (
    <div className="mt-4 rounded-xl border border-gold-500/30 bg-gold-500/5 p-3" aria-label="Paris extérieurs">
      <p className="mb-1.5 text-sm font-semibold text-gold-300">Paris extérieurs</p>
      <ul className="space-y-1 text-xs text-ivory-200/90">
        {pools.map((p) => {
          const r = results.find((x) => x.line === p.line && x.amount === p.amount);
          return (
            <li key={`${p.line}-${p.amount}`}>
              Ligne {p.line} · {p.amount} jetons × {p.members.length} ({p.members.map((m) => nick(view, m)).join(', ')})
              {r ? (r.refunded ? ' · mises rendues' : ` · remporté par ${r.winners.map((w) => nick(view, w)).join(' + ')}`) : ' · en jeu'}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
