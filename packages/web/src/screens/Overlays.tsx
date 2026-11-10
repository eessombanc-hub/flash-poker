import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PlayingCard } from '../components/Card';
import { Confetti } from '../components/Confetti';
import { VictoryTitle, WinnerSpotlight } from '../components/Winner';
import { Sound } from '../lib/sound';
import { TrophyIcon } from '../components/Icons3D';
import { CoinRain, RevealCard, Shine, SpinTrophy } from '../components/Scene3D';
import { Avatar, Badge, Button, Eyebrow, Modal, ScorePips } from '../components/ui';
import type { FeedItem } from '../lib/client';
import { deNom, formatChips, formatSignedChips, pointsLabel, STARTING_CHIPS } from '../lib/format';
import { categoryLabel, INSURANCE_LABELS, variantName, VICTORY_LABELS, winningCards, winningCombination } from '../lib/labels';
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
  return awardTextBy(record, (id) => nick(view, id));
}
/** Même texte, avec les pseudos fournis par l'appelant (parties archivées de « Mon espace »). */
export function awardTextBy(record: RoundRecord, nameOf: (id: string) => string): string {
  const a = record.award;
  if (a.kind === 'POINTS') {
    const capot = record.variant === 'V6_3' && a.points === 2 ? ' : capot, les 3 lignes gagnées' : '';
    return `${nameOf(a.winner)} remporte la manche (+${pointsLabel(a.points)})${capot}${a.tiebreak ? ' après un Hold’em de départage' : ''}`;
  }
  if (a.kind === 'INSTANT_VICTORY') return `${nameOf(a.winner)} désigne une quinte flush à la ligne ${a.line} : victoire immédiate`;
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
        <Eyebrow>Hold’em de départage{tiebreak.rounds.length > 1 ? ` (tour ${Math.floor(t / 4) + 1})` : ''}</Eyebrow>
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
  // Le showdown transporte le plateau exact évalué par le moteur : source de référence.
  const sd = [...events].reverse().find((e) => e.type === 'SHOWDOWN');
  const exact = sd?.data.board;
  if (Array.isArray(exact) && exact.length > 0 && exact.every((c) => typeof c === 'string')) return [...(exact as string[])];
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
  const showdown = [...events].reverse().find((e) => e.type === 'SHOWDOWN')?.data.hands as Record<string, { cards: string[]; category: number }> | undefined;
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
    <Modal title={`Résultat de la manche ${record.roundNo}`} onClose={onClose} wide compact>
      <div onPointerDown={() => setInteracted(true)} onWheel={() => setInteracted(true)}>
      <Eyebrow>
        Manche {record.roundNo}, {variantName(record.variant)}
      </Eyebrow>
      <h2 className="font-display text-xl leading-tight text-ivory-50 sm:text-2xl" aria-live="polite">
        {awardText(record, view)}
      </h2>
      <WinnerBanner record={record} view={view} />

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
      {(record.summary?.teats ?? 0) > 0 && <p className="mt-3 text-center text-xs text-ivory-200/80">Manche jouée avec {record.summary!.teats === 1 ? 'une tétine' : '2 tétines'}.</p>}
      {(record.summary?.sideBets ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-gold-500/30 bg-gold-500/5 p-3 text-sm text-ivory-100" aria-label="Paris extérieurs">
          {record.summary!.sideBets!.map((b) => (
            <li key={`${b.line}-${b.amount}`}>
              Ligne {b.line}, {b.amount.toLocaleString('fr-FR')} jetons par joueur : {b.refunded || b.winners.length === 0 ? 'mises rendues' : `${b.winners.map((w) => nick(view, w)).join(' + ')} ${b.winners.length > 1 ? 'se partagent' : 'remporte'} la cagnotte`}
            </li>
          ))}
        </ul>
      )}
      {showdown && (
        <ul className="mt-2 grid gap-1.5 md:grid-cols-2" aria-label="Mains dévoilées">
          {Object.entries(showdown).map(([pid, h]) => (
            <li key={pid} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1 ${pid === winner ? 'animate-winGlow bg-gold-500/15 ring-1 ring-gold-400' : 'bg-ink-900/60'}`}>
              <span className="w-16 truncate font-medium text-ivory-50">{nick(view, pid)}</span>
              <span className="flex -space-x-2">
                {h.cards.map((c, i) => (
                  <RevealCard key={c} code={c} size="xs" index={i} />
                ))}
              </span>
              <span className="text-sm text-ivory-200/85">{categoryLabel(h.category)}</span>
              {pid === winner && <Badge tone="gold">Gagnant</Badge>}
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && <LinesRecap lines={lines} view={view} scale={60} />}

      <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-gold-400">Scores</h3>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {players.map((p) => (
          <li key={p.player} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-ink-900/60 px-2.5 py-1.5 text-sm">
            <span className="flex items-center gap-2 text-ivory-50">
              {nick(view, p.player)}
              {(record.points[p.player] ?? 0) > 0 && <Badge tone="gold">+{record.points[p.player]}</Badge>}
            </span>
            <ScorePips score={record.scoresAfter[p.player] ?? 0} target={view.game!.targetPoints} />
          </li>
        ))}
      </ul>
      {/* Téléphone : le bouton reste visible en bas de la fenêtre, même quand le contenu défile. */}
      <div className={`flex items-center justify-end gap-3 sticky -bottom-4 z-10 -mx-4 -mb-4 mt-3 border-t border-ivory-100/10 bg-ink-800 px-4 pb-6 pt-2 sm:static sm:mx-0 sm:mb-0 sm:mt-3 sm:border-0 sm:bg-transparent sm:p-0`}>
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
  const { sound } = useSettings();
  useEffect(() => {
    if (sound) Sound.victory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title="Fin de partie" wide>
      <Confetti />
      <CoinRain />
      <div className="flex items-center gap-4">
        <WinnerSpotlight className="shrink-0">
          <SpinTrophy size={96} />
        </WinnerSpotlight>
        <div className="min-w-0">
          <Eyebrow>Fin de partie</Eyebrow>
          <VictoryTitle className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">Victoire {deNom(nick(view, o.winner))}</VictoryTitle>
          <p className="mt-1 text-gold-300">{VICTORY_LABELS[o.victoryType]}</p>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">Classement</h3>
      <ol className="space-y-2">
        {o.standings.map((s) => (
          <li key={s.player} className="flex items-center gap-3 rounded-xl bg-ink-900/60 px-3 py-2.5">
            <span className="w-6 font-display text-xl text-gold-400">{s.rank}</span>
            <Avatar nickname={nick(view, s.player)} avatar={view.players.find((p) => p.id === s.player)?.avatar} size={34} />
            <span className="flex-1 font-medium text-ivory-50">{nick(view, s.player)}</span>
            <span className="text-sm text-ivory-200/80">{s.position}, {pointsLabel(s.score)}</span>
          </li>
        ))}
        {/* Les autres joueurs ne sont pas classés par la règle (seuls le vainqueur et son partenaire d'assurance
            le sont) : ils restent affichés, sans rang, avec leurs points. */}
        {game.players
          .filter((p) => !o.standings.some((st) => st.player === p.player))
          .sort((a, b) => b.score - a.score)
          .map((p) => (
            <li key={p.player} className="flex items-center gap-3 rounded-xl bg-ink-900/40 px-3 py-2.5">
              <span className="w-6 text-center font-display text-xl text-ivory-300/50" aria-label="non classé">–</span>
              <Avatar nickname={nick(view, p.player)} avatar={view.players.find((x) => x.id === p.player)?.avatar} size={34} dim={p.excluded} />
              <span className="flex-1 font-medium text-ivory-100">{nick(view, p.player)}</span>
              <span className="text-sm text-ivory-200/70">{p.position} · {pointsLabel(p.score)}</span>
            </li>
          ))}
      </ol>
      {o.insurance && insured && (
        <p className="mt-2 text-xs text-ivory-300/80">
          Assurance appliquée : {nick(view, insured[0])} et {nick(view, insured[1])} ({INSURANCE_LABELS[o.insurance.type].name}).
        </p>
      )}

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">Répartition de la cagnotte, en jetons</h3>
      <table className="w-full text-sm">
        <caption className="sr-only">Mise, gain, bilan et jetons en fin de partie de chaque joueur (cave de départ : {formatChips(STARTING_CHIPS)})</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
            <th className="py-1 font-medium">Joueur</th>
            <th className="hidden py-1 text-right font-medium sm:table-cell">Mise</th>
            <th className="py-1 text-right font-medium">Reçoit</th>
            <th className="py-1 text-right font-medium">Bilan</th>
            <th className="py-1 text-right font-medium">Jetons finaux</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => {
            const payout = o.settlement.payouts[p.player] ?? 0;
            const net = payout - game.stakeChips;
            return (
              <tr key={p.player} className="border-t border-ivory-100/10">
                <td className="py-1.5 text-ivory-50">{nick(view, p.player)}</td>
                <td className="hidden py-1.5 text-right tabular-nums text-ivory-200/80 sm:table-cell">{formatChips(game.stakeChips)}</td>
                <td className="py-1.5 text-right tabular-nums text-ivory-50"><span className="sm:hidden">{payout.toLocaleString('fr-FR')}</span><span className="hidden sm:inline">{formatChips(payout)}</span></td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${net > 0 ? 'text-jade-300' : net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}><span className="sm:hidden">{net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toLocaleString('fr-FR')}</span><span className="hidden sm:inline">{formatSignedChips(net)}</span></td>
                <td className="py-1.5 text-right tabular-nums text-ivory-50">{(STARTING_CHIPS + net + (o.sideBets?.[p.player] ?? 0)).toLocaleString('fr-FR')}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold-500/40 text-ivory-50">
            <td className="py-1.5 font-semibold">Cagnotte</td>
            <td className="hidden sm:table-cell" />
            <td className="py-1.5 text-right font-semibold tabular-nums"><span className="sm:hidden">{o.settlement.potChips.toLocaleString('fr-FR')}</span><span className="hidden sm:inline">{formatChips(o.settlement.potChips)}</span></td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
      <RoundsRecap history={game.history} view={view} />

      <div className={`flex flex-col gap-2 sm:flex-row sm:justify-end sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 border-t border-ivory-100/10 bg-ink-800 px-5 pb-8 pt-3 sm:static sm:mx-0 sm:mb-0 sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0`}>
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
                  {view.players.find((x) => x.id === p.player)?.bot && <span className="ml-2 align-middle"><Badge tone="neutral">CPU</Badge></span>}
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
                {variantName(r.variant)} <span className="text-xs text-ivory-300/60">(choisie par {nick(view, r.chooser)})</span>
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

// ---------- Vainqueur de la manche et combinaison gagnante ----------
/** Bandeau de fin de manche : qui gagne, avec quelle combinaison (et ses cartes quand elles sont connues). */
export function WinnerBanner({ record, view }: { record: RoundRecord; view: RoomView }) {
  const a = record.award;
  const winner = a.kind === 'POINTS' || a.kind === 'INSTANT_VICTORY' ? a.winner : null;
  const combo = winningCombination(record);
  if (!winner || !combo) return null;
  const cards = winningCards(record);
  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/50 bg-gradient-to-r from-gold-500/20 to-transparent px-3 py-1.5" data-testid="vainqueur-manche">
      <Shine />
      <SpinTrophy size={38} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-xs uppercase tracking-widest text-gold-300">Vainqueur de la manche</p>
        <p className="font-display text-xl text-ivory-50">
          {nick(view, winner)} <span className="text-gold-300">({combo})</span>
        </p>
      </div>
      {cards.length > 0 && (
        <span className="flex -space-x-2" role="group" aria-label="Cartes de la combinaison gagnante">
          {cards.map((c, i) => (
            <RevealCard key={c} code={c} size="xs" index={i + 1} />
          ))}
        </span>
      )}
    </div>
  );
}

// ---------- Résultat de chaque manche (fin de partie) ----------
/** Liste repliable des manches de la partie : variante, vainqueur, combinaison, points. */
export function RoundsRecap({ history, view }: { history: readonly RoundRecord[]; view: RoomView }) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  return (
    <section className="mt-6" aria-label="Résultat de chaque manche">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full justify-between">
        <span>{open ? 'Masquer' : 'Voir'} le résultat de chaque manche ({history.length})</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </Button>
      {open && <RoundList history={history} nameOf={(id) => nick(view, id)} />}
    </section>
  );
}

/**
 * Liste des manches : vainqueur, combinaison gagnante, points. `star` (facultatif) ajoute un bouton
 * « manche favorite » par manche (parties archivées de « Mon espace »).
 */
export function RoundList({ history, nameOf, star }: { history: readonly RoundRecord[]; nameOf: (id: string) => string; star?: { isOn: (roundNo: number) => boolean; toggle: (roundNo: number) => void } }) {
  return (
    <ol className="mt-3 space-y-2">
      {history.map((r) => {
        const winner = r.award.kind === 'POINTS' || r.award.kind === 'INSTANT_VICTORY' ? r.award.winner : null;
        const combo = winningCombination(r);
        const pts = r.award.kind === 'POINTS' ? r.award.points : null;
        const on = star?.isOn(r.roundNo) ?? false;
        return (
          <li key={r.roundNo} className="rounded-xl bg-ink-900/60 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-semibold text-ivory-50">
                Manche {r.roundNo} · <span className="text-gold-300">{variantName(r.variant)}</span>
              </span>
              <span className="flex items-center gap-2">
                {pts !== null && <Badge tone="gold">+{pointsLabel(pts)}</Badge>}
                {star && (
                  <button
                    type="button"
                    onClick={() => star.toggle(r.roundNo)}
                    aria-pressed={on}
                    aria-label={`Manche ${r.roundNo} favorite`}
                    title={on ? 'Retirer des manches favorites' : 'Ajouter aux manches favorites'}
                    className={`rounded-full px-2 py-0.5 text-lg leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${on ? 'text-gold-300' : 'text-ivory-300/50 hover:text-gold-300'}`}
                  >
                    {on ? '★' : '☆'}
                  </button>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-ivory-200/90">
              {winner ? (
                <>
                  <strong className="text-ivory-50">{nameOf(winner)}</strong>
                  {combo ? ` (${combo})` : ''}
                </>
              ) : (
                awardTextBy(r, nameOf)
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
