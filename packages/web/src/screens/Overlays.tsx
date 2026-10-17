import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PlayingCard } from '../components/Card';
import { Confetti } from '../components/Confetti';
import { Avatar, Badge, Button, Eyebrow, Modal, ScorePips } from '../components/ui';
import type { FeedItem } from '../lib/client';
import { deNom, formatEuros, formatSignedEuros, pointsLabel } from '../lib/format';
import { categoryLabel, INSURANCE_LABELS, variantName, VICTORY_LABELS } from '../lib/labels';
import { nick } from '../lib/selectors';
import { useSettings } from '../lib/settings';
import type { LineResult, RoomView, RoundEvent, RoundRecord, TiebreakOutcome } from '../lib/types';
import { LinesRecap } from '../panels/Line63Panel';

/**
 * Événements de la manche `roundNo` : depuis son « variante choisie » jusqu'à maintenant.
 * Repli après un rechargement de page (repère perdu) : événements postérieurs à la manche précédente notée.
 */
export function collectRoundEvents(feed: readonly FeedItem[], roundNo: number): RoundEvent[] {
  let start = -1;
  feed.forEach((f, i) => {
    if (f.event.type === 'VARIANT_CHOSEN' && (f.event.data as { roundNo?: number }).roundNo === roundNo) start = i;
  });
  if (start < 0) {
    const scored = feed.reduce<number[]>((a, f, i) => (f.event.type === 'ROUND_SCORED' ? [...a, i] : a), []);
    start = scored.length >= 2 ? scored[scored.length - 2]! + 1 : 0;
  }
  return feed.slice(start).map((f) => f.event);
}

const NO_POINT_REASON: Record<string, string> = {
  ALL_FOLDED: 'toutes les mains sont couchées',
  NO_DESIGNATION: 'personne n’a désigné de combinaison à temps',
  TIE_SMALL_TABLE: 'égalité en tête à une table de 2 ou 3 joueurs',
};

export function awardText(record: RoundRecord, view: RoomView): string {
  const a = record.award;
  if (a.kind === 'POINTS') return `${nick(view, a.winner)} remporte la manche (+${pointsLabel(a.points)})${a.tiebreak ? ' après un Hold’em de départage' : ''}`;
  if (a.kind === 'INSTANT_VICTORY') return `${nick(view, a.winner)} désigne une quinte flush à la ligne ${a.line} : victoire immédiate`;
  return `Aucun point : ${NO_POINT_REASON[a.reason] ?? a.reason}`;
}

// ---------- Hold'em de départage ----------
export function TiebreakSequence({ tiebreak, view }: { tiebreak: TiebreakOutcome; view: RoomView }) {
  const { fourColor } = useSettings();
  const reduce = useReducedMotion();
  const total = tiebreak.rounds.length * 4;
  const [t, setT] = useState(reduce ? total - 1 : 0);
  useEffect(() => {
    if (t >= total - 1) return;
    const id = setTimeout(() => setT((x) => x + 1), 1100);
    return () => clearTimeout(id);
  }, [t, total]);
  const r = tiebreak.rounds[Math.min(Math.floor(t / 4), tiebreak.rounds.length - 1)]!;
  const step = t % 4; // 0 mains ouvertes, 1 flop, 2 turn, 3 river
  const shown = step === 0 ? 0 : step === 1 ? 3 : step === 2 ? 4 : 5;
  const done = t >= total - 1;
  return (
    <section aria-label="Hold’em de départage" className="rounded-xl border border-gold-500/40 bg-ink-900/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Hold’em de départage{tiebreak.rounds.length > 1 ? ` — tour ${Math.floor(t / 4) + 1}` : ''}</Eyebrow>
        {!done && (
          <Button variant="ghost" className="min-h-[32px] px-2 py-1 text-xs" onClick={() => setT(total - 1)}>
            Passer
          </Button>
        )}
      </div>
      <div className="mt-3 flex items-end justify-center gap-1.5" role="group" aria-label="Cartes communes du départage">
        {Array.from({ length: 5 }, (_, i) => (i < shown ? <PlayingCard key={`${t}-${i}`} code={r.board[i]!} size="sm" fourColor={fourColor} flip /> : <span key={i} className="aspect-[5/7] w-12 rounded-[9px] border border-dashed border-ivory-100/25" aria-hidden="true" />))}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {r.players.map((p) => (
          <li key={p} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${step === 3 && r.winners.includes(p) ? 'bg-gold-500/20 ring-1 ring-gold-400' : 'bg-ink-800/70'}`}>
            <span className="w-20 truncate text-sm font-medium text-ivory-50">{nick(view, p)}</span>
            <span className="flex -space-x-2">
              {r.hands[p]!.map((c) => (
                <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      {done && <p className="mt-3 text-center text-sm font-semibold text-gold-300">Vainqueur du départage : {nick(view, tiebreak.winner)}</p>}
    </section>
  );
}

// ---------- Résultat de manche ----------
/** Plateau final : dernier plateau connu, complété par les cartes révélées à la clôture (BOARD_REVEALED). */
export function finalBoard(known: readonly (string | null)[], events: readonly RoundEvent[]): (string | null)[] {
  const b = [...known];
  for (const e of events) {
    if (e.type !== 'BOARD_REVEALED') continue;
    const { slot, card } = e.data as { slot?: number; card?: string };
    if (typeof slot === 'number' && typeof card === 'string') b[slot] = card;
  }
  return b;
}

export function RoundResultModal({ record, events, board, view, onClose, final }: { record: RoundRecord; events: RoundEvent[]; board: readonly (string | null)[]; view: RoomView; onClose: () => void; final: boolean }) {
  const { fourColor } = useSettings();
  const showdown = events.find((e) => e.type === 'SHOWDOWN')?.data.hands as Record<string, { cards: string[]; category: number }> | undefined;
  const shownBoard = record.variant === 'AVIATION' || record.variant === 'AVIA_6' || record.variant === 'V6_1' ? finalBoard(board, events) : [];
  const lines = events.filter((e) => e.type === 'LINE_RESOLVED').map((e) => e.data as unknown as LineResult);
  const winner = record.award.kind === 'POINTS' || record.award.kind === 'INSTANT_VICTORY' ? record.award.winner : null;
  const players = view.game!.players;
  const [left, setLeft] = useState(final ? null : 14);
  const [interacted, setInteracted] = useState(false);
  useEffect(() => {
    if (left === null || interacted) return;
    if (left <= 0) return onClose();
    const id = setTimeout(() => setLeft((x) => (x === null ? x : x - 1)), 1000);
    return () => clearTimeout(id);
  }, [left, onClose, interacted]);

  return (
    <Modal title={`Résultat de la manche ${record.roundNo}`} onClose={onClose} wide>
      <div onPointerDown={() => setInteracted(true)} onWheel={() => setInteracted(true)}>
      <Eyebrow>
        Manche {record.roundNo} — {variantName(record.variant)}
      </Eyebrow>
      <h2 className="mt-1 font-display text-2xl text-ivory-50 sm:text-3xl" aria-live="polite">
        {awardText(record, view)}
      </h2>

      {record.award.kind === 'POINTS' && record.award.tiebreak && (
        <div className="mt-4">
          <TiebreakSequence tiebreak={record.award.tiebreak} view={view} />
        </div>
      )}

      {shownBoard.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-1.5" role="group" aria-label="Cartes communes">
          {shownBoard.map((c, i) => (c ? <PlayingCard key={i} code={c} size="sm" fourColor={fourColor} /> : <span key={i} className="aspect-[5/7] w-12 rounded-[9px] border border-dashed border-ivory-100/25" />))}
        </div>
      )}
      {showdown && (
        <ul className="mt-4 space-y-2" aria-label="Mains dévoilées">
          {Object.entries(showdown).map(([pid, h]) => (
            <li key={pid} className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ${pid === winner ? 'bg-gold-500/15 ring-1 ring-gold-400' : 'bg-ink-900/60'}`}>
              <span className="w-24 truncate font-medium text-ivory-50">{nick(view, pid)}</span>
              <span className="flex -space-x-2">
                {h.cards.map((c) => (
                  <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
                ))}
              </span>
              <span className="text-sm text-ivory-200/85">{categoryLabel(h.category)}</span>
              {pid === winner && <Badge tone="gold">Gagnant</Badge>}
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && <LinesRecap lines={lines} view={view} scale={60} />}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-gold-400">Scores</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {players.map((p) => (
          <li key={p.player} className="flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-ivory-50">
              {nick(view, p.player)}
              {(record.points[p.player] ?? 0) > 0 && <Badge tone="gold">+{record.points[p.player]}</Badge>}
            </span>
            <ScorePips score={record.scoresAfter[p.player] ?? 0} target={view.game!.targetPoints} />
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-end gap-3">
        {left !== null && !interacted && <span className="text-xs text-ivory-300/60">Fermeture dans {left} s</span>}
        <Button onClick={onClose}>{final ? 'Voir le résultat final' : 'Continuer'}</Button>
      </div>
      </div>
    </Modal>
  );
}

// ---------- Fin de partie ----------
export function GameOverModal({ view, onClose, onLeave }: { view: RoomView; onClose: () => void; onLeave: () => void }) {
  const game = view.game!;
  const o = game.outcome!;
  const insured = o.insurance ? o.insurance.players : null;
  return (
    <Modal title="Fin de partie" wide>
      <Confetti />
      <Eyebrow>Fin de partie</Eyebrow>
      <h2 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">Victoire {deNom(nick(view, o.winner))}</h2>
      <p className="mt-1 text-gold-300">{VICTORY_LABELS[o.victoryType]}</p>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">Classement</h3>
      <ol className="space-y-2">
        {o.standings.map((s) => (
          <li key={s.player} className="flex items-center gap-3 rounded-xl bg-ink-900/60 px-3 py-2.5">
            <span className="w-6 font-display text-xl text-gold-400">{s.rank}</span>
            <Avatar nickname={nick(view, s.player)} avatar={view.players.find((p) => p.id === s.player)?.avatar} size={34} />
            <span className="flex-1 font-medium text-ivory-50">{nick(view, s.player)}</span>
            <span className="text-sm text-ivory-200/80">{s.position} · {pointsLabel(s.score)}</span>
          </li>
        ))}
      </ol>
      {o.insurance && insured && (
        <p className="mt-2 text-xs text-ivory-300/80">
          Assurance appliquée : {nick(view, insured[0])} et {nick(view, insured[1])} — {INSURANCE_LABELS[o.insurance.type].name}.
        </p>
      )}

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">Répartition de la cagnotte (virtuelle)</h3>
      <table className="w-full text-sm">
        <caption className="sr-only">Mise, gain et solde de chaque joueur</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
            <th className="py-1 font-medium">Joueur</th>
            <th className="py-1 text-right font-medium">Mise</th>
            <th className="py-1 text-right font-medium">Reçoit</th>
            <th className="py-1 text-right font-medium">Solde</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => {
            const payout = o.settlement.payouts[p.player] ?? 0;
            const net = payout - game.stakeCents;
            return (
              <tr key={p.player} className="border-t border-ivory-100/10">
                <td className="py-1.5 text-ivory-50">{nick(view, p.player)}</td>
                <td className="py-1.5 text-right tabular-nums text-ivory-200/80">{formatEuros(game.stakeCents)}</td>
                <td className="py-1.5 text-right tabular-nums text-ivory-50">{formatEuros(payout)}</td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${net > 0 ? 'text-emerald-300' : net < 0 ? 'text-red-300' : 'text-ivory-200'}`}>{formatSignedEuros(net)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold-500/40 text-ivory-50">
            <td className="py-1.5 font-semibold">Cagnotte</td>
            <td />
            <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuros(o.settlement.potCents)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Revoir la table
        </Button>
        <Button onClick={onLeave}>Retour à l’accueil</Button>
      </div>
    </Modal>
  );
}

// ---------- Scores et historique ----------
function Sparkline({ values, max }: { values: number[]; max: number }) {
  if (values.length === 0) return <span className="text-xs text-ivory-300/50">—</span>;
  const w = 90;
  const h = 26;
  const pts = [0, ...values].map((v, i, a) => `${(i / Math.max(1, a.length - 1)) * w},${h - 2 - (v / Math.max(1, max)) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Évolution : ${values.join(', ')}`}>
      <polyline points={pts} fill="none" stroke="#c9a25a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ScoreModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const game = view.game!;
  return (
    <Modal title="Scores et historique" onClose={onClose} wide>
      <Eyebrow>Objectif : {pointsLabel(game.targetPoints)}</Eyebrow>
      <h2 className="mt-1 font-display text-2xl text-ivory-50">Scores et historique</h2>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Scores des joueurs</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
            <th className="py-1 font-medium">Joueur</th>
            <th className="py-1 font-medium">Points</th>
            <th className="hidden py-1 font-medium sm:table-cell">Évolution</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => {
            const ins = game.insurance.accepted.find((i) => i.players.includes(p.player));
            return (
              <tr key={p.player} className="border-t border-ivory-100/10">
                <td className="py-2 text-ivory-50">
                  {nick(view, p.player)} <span className="text-xs text-gold-400">{p.position}</span>
                  {ins && <span className="ml-2 align-middle"><Badge tone="gold">Assuré avec {nick(view, ins.players.find((x) => x !== p.player)!)}</Badge></span>}
                  {p.excluded && <span className="ml-2 align-middle"><Badge tone="red">Exclu</Badge></span>}
                </td>
                <td className="py-2"><ScorePips score={p.score} target={game.targetPoints} /></td>
                <td className="hidden py-2 sm:table-cell"><Sparkline values={game.evolution[p.player] ?? []} max={game.targetPoints} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">Historique des manches</h3>
      {game.history.length === 0 ? (
        <p className="text-sm text-ivory-300/70">Aucune manche terminée.</p>
      ) : (
        <ol className="space-y-1.5">
          {[...game.history].reverse().map((r) => (
            <li key={r.roundNo} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
              <span className="text-ivory-50">
                <span className="mr-2 text-ivory-300/60">#{r.roundNo}</span>
                {variantName(r.variant)} <span className="text-xs text-ivory-300/60">— choisie par {nick(view, r.chooser)}</span>
              </span>
              <span className="text-ivory-200/85">{r.award.kind === 'POINTS' ? `${nick(view, r.award.winner)} +${r.award.points}${r.award.tiebreak ? ' (départage)' : ''}` : r.award.kind === 'INSTANT_VICTORY' ? 'Quinte flush : victoire' : 'Aucun point'}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  );
}
