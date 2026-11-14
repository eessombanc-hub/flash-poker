import { motion, useReducedMotion } from 'framer-motion';
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
import { categoryLabel, describeRank, INSURANCE_LABELS, variantName, VICTORY_LABELS, winningCards, winningCombination } from '../lib/labels';
import { sortHand } from '../lib/cards';
import { nick } from '../lib/selectors';
import { straightFlushes } from '../lib/roundInfo';
import { StraightFlushFeast } from '../components/Feast';
import { useAccount } from '../lib/context';
import { useSettings } from '../lib/settings';
import type { LineResult, RoomView, RoundEvent, RoundRecord, TiebreakOutcome } from '../lib/types';
import { LinesRecap } from '../panels/Line63Panel';
import { tr, type Key, locale, useI18n } from '../i18n';

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

const noPointReason = (r: string): string => (['ALL_FOLDED', 'NO_DESIGNATION', 'TIE_SMALL_TABLE'].includes(r) ? tr(`aw.r.${r}` as Key) : r);

export function awardText(record: RoundRecord, view: RoomView): string {
  return awardTextBy(record, (id) => nick(view, id));
}
/** Même texte, avec les pseudos fournis par l'appelant (parties archivées de « Mon espace »). */
export function awardTextBy(record: RoundRecord, nameOf: (id: string) => string): string {
  const a = record.award;
  if (a.kind === 'POINTS') {
    const capot = record.variant === 'V6_3' && a.points === 2 ? tr('aw.capot') : '';
    return `${tr('aw.points', { name: nameOf(a.winner), points: pointsLabel(a.points) })}${capot}${a.tiebreak ? tr('aw.tiebreak') : ''}`;
  }
  if (a.kind === 'INSTANT_VICTORY') return tr('aw.sf', { name: nameOf(a.winner), line: a.line });
  return tr('aw.none', { reason: noPointReason(a.reason) });
}

// ---------- Hold'em de départage ----------
const TIEBREAK_INTRO_MS = 3200;
const SUITS = ['♠', '♥', '♦', '♣'] as const;

/**
 * Ouverture du départage : un décor à part (rouge sombre et or, symboles de couleurs qui flottent), le mot
 * « Égalité » qui s'abat, puis les joueurs à égalité face à face. Elle dit d'un coup d'œil que ce qui suit n'est
 * plus la manche en cours mais un Hold'em joué entre les seuls ex aequo.
 */
function TiebreakIntro({ players, view, reduce }: { players: readonly string[]; view: RoomView; reduce: boolean }) {
  const { t } = useI18n();
  const dur = reduce ? 0 : 1;
  return (
    <div className="relative flex min-h-[15rem] flex-col items-center justify-center overflow-hidden px-3 py-6 text-center" role="status" aria-live="polite">
      {SUITS.map((suit, i) => (
        <motion.span
          key={suit}
          aria-hidden="true"
          className={`pointer-events-none absolute select-none text-6xl ${i % 2 === 0 ? 'text-ivory-100/10' : 'text-ruby-400/15'}`}
          style={{ left: `${8 + i * 26}%`, top: i % 2 === 0 ? '8%' : '58%' }}
          initial={reduce ? false : { opacity: 0, y: 30, rotate: -20 }}
          animate={reduce ? undefined : { opacity: 1, y: [0, -10, 0], rotate: [-8, 8, -8] }}
          transition={{ duration: 3.2, delay: 0.15 * i, repeat: Infinity, ease: 'easeInOut' }}
        >
          {suit}
        </motion.span>
      ))}
      <motion.p
        className="relative font-display text-4xl uppercase tracking-[0.22em] text-amber-200 sm:text-5xl"
        initial={reduce ? false : { scale: 2.6, opacity: 0, rotate: -4 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.1 * dur }}
      >
        {t('tbk.egalite')}
      </motion.p>
      <motion.span
        aria-hidden="true"
        className="mt-2 block h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent"
        initial={reduce ? false : { width: 0, opacity: 0 }}
        animate={{ width: '70%', opacity: 1 }}
        transition={{ duration: 0.7 * dur, delay: 0.55 * dur }}
      />
      <motion.p
        className="relative mt-2 font-display text-xl text-ivory-50"
        initial={reduce ? false : { y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 * dur, delay: 0.8 * dur }}
      >
        {t('overlays.hold_em_de')}
      </motion.p>
      <ul className="relative mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-2" aria-label={t('tbk.joueurs')}>
        {players.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            {i > 0 && (
              <motion.span
                aria-hidden="true"
                className="font-display text-sm text-ruby-300"
                initial={reduce ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 14, delay: (1.2 + 0.2 * i) * dur }}
              >
                {t('tbk.contre')}
              </motion.span>
            )}
            <motion.span
              className="flex items-center gap-2 rounded-full border border-amber-300/50 bg-ink-900/80 py-1 pl-1 pr-3"
              initial={reduce ? false : { x: i % 2 === 0 ? -60 : 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20, delay: (1.1 + 0.2 * i) * dur }}
            >
              <Avatar nickname={nick(view, p)} avatar={null} size={28} />
              <span className="max-w-[7rem] truncate text-sm font-semibold text-ivory-50">{nick(view, p)}</span>
            </motion.span>
          </li>
        ))}
      </ul>
      <motion.p
        className="relative mt-4 max-w-xs text-xs text-ivory-200/80"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 * dur, delay: 1.9 * dur }}
      >
        {t('tbk.note')}
      </motion.p>
    </div>
  );
}

export function TiebreakSequence({ tiebreak, view, intro = false }: { tiebreak: TiebreakOutcome; view: RoomView; intro?: boolean }) {
  const { t } = useI18n();
  const { fourColor } = useSettings();
  const reduce = useReducedMotion() ?? false;
  const total = tiebreak.rounds.length * 4;
  const [tick, setT] = useState(reduce ? total - 1 : 0);
  const [opening, setOpening] = useState(intro && !reduce);
  useEffect(() => {
    if (!opening) return;
    Sound.confirm();
    const id = setTimeout(() => setOpening(false), TIEBREAK_INTRO_MS);
    return () => clearTimeout(id);
  }, [opening]);
  useEffect(() => {
    if (opening || tick >= total - 1) return;
    const id = setTimeout(() => setT((x) => x + 1), 1100);
    return () => clearTimeout(id);
  }, [tick, total, opening]);
  const r = tiebreak.rounds[Math.min(Math.floor(tick / 4), tiebreak.rounds.length - 1)]!;
  const step = tick % 4; // 0 mains ouvertes, 1 flop, 2 turn, 3 river
  const shown = step === 0 ? 0 : step === 1 ? 3 : step === 2 ? 4 : 5;
  const done = tick >= total - 1;
  return (
    <section aria-label={t('overlays.hold_em_de')} className="rounded-xl border border-amber-400/50 bg-gradient-to-b from-[#2b0f12] via-ink-900/90 to-ink-900/80 p-4 shadow-[0_0_0_1px_rgba(240,180,92,.12)]">
      {opening ? (
        <>
          <TiebreakIntro players={tiebreak.rounds[0]!.players} view={view} reduce={reduce} />
          <div className="flex justify-end">
            <Button variant="ghost" className="min-h-[32px] px-2 py-1 text-xs" onClick={() => setOpening(false)}>
              {t('overlays.passer')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>
              <span className="inline-flex items-center gap-2">
                {!done && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-ruby-400" />}
                {t('overlays.hold_em_de')}
                {tiebreak.rounds.length > 1 ? ' ' + t('overlays.tour', { v: Math.floor(tick / 4) + 1 }) : ''}
              </span>
            </Eyebrow>
            {!done && (
              <Button variant="ghost" className="min-h-[32px] px-2 py-1 text-xs" onClick={() => setT(total - 1)}>
                {t('overlays.passer')}
              </Button>
            )}
          </div>
          <div className="mt-3 flex items-end justify-center gap-1.5 rounded-2xl bg-felt-900/85 px-2 py-3 ring-1 ring-amber-300/25" role="group" aria-label={t('overlays.cartes_communes_du')}>
            {Array.from({ length: 5 }, (_, i) => (i < shown ? <PlayingCard key={`${tick}-${i}`} code={r.board[i]!} size="sm" fourColor={fourColor} flip /> : <span key={i} className="aspect-[5/7] w-12 rounded-[9px] border border-dashed border-ivory-100/25" aria-hidden="true" />))}
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
          {done && <p className="mt-3 text-center text-sm font-semibold text-gold-300">{t('overlays.vainqueur_du_departage', { nick: nick(view, tiebreak.winner) })}</p>}
        </>
      )}
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

/** Secondes d'affichage des mains abattues (poker fermé) avant le résultat de la manche. */
export const SHOWDOWN_SECONDS = 8;

export function RoundResultModal({ record, events, board, view, onClose, final }: { record: RoundRecord; events: RoundEvent[]; board: readonly (string | null)[]; view: RoomView; onClose: () => void; final: boolean }) {
  const { t, tp } = useI18n();
  const { fourColor } = useSettings();
  // La combinaison gagnante est montrée à chaque manche (bannière) ; la quinte flush a droit, en plus, à sa fête.
  const flushes = straightFlushes(record);
  const shownBoard = record.variant === 'AVIATION' || record.variant === 'AVIA_6' || record.variant === 'V6_1' ? finalBoard(board, events) : [];
  const lines = events.filter((e) => e.type === 'LINE_RESOLVED').map((e) => e.data as unknown as LineResult);
  const winner = record.award.kind === 'POINTS' || record.award.kind === 'INSTANT_VICTORY' ? record.award.winner : null;
  const players = view.game!.players;
  // Poker fermé : les mains, telles qu'elles sont après le dernier change, s'affichent seules avant le résultat de la manche.
  const closedHands = record.variant === 'CLOSED_1' || record.variant === 'CLOSED_2' ? record.summary?.hands : undefined;
  const [stage, setStage] = useState<'hands' | 'result'>(closedHands && Object.keys(closedHands).length > 0 ? 'hands' : 'result');
  const [handsLeft, setHandsLeft] = useState(SHOWDOWN_SECONDS);
  const [left, setLeft] = useState(final ? null : 14);
  const [interacted, setInteracted] = useState(false);
  useEffect(() => {
    if (stage !== 'hands' || interacted) return;
    if (handsLeft <= 0) return setStage('result');
    const id = setTimeout(() => setHandsLeft((x) => x - 1), 1000);
    return () => clearTimeout(id);
  }, [stage, handsLeft, interacted]);
  useEffect(() => {
    if (stage !== 'result' || left === null || interacted) return;
    if (left <= 0) return onClose();
    const id = setTimeout(() => setLeft((x) => (x === null ? x : x - 1)), 1000);
    return () => clearTimeout(id);
  }, [left, onClose, interacted, stage]);

  if (stage === 'hands' && closedHands) {
    return (
      <Modal title={t('overlays.abattage.title')} onClose={() => setStage('result')} wide compact>
        <div onPointerDown={() => setInteracted(true)} onWheel={() => setInteracted(true)}>
          <Eyebrow>{t('overlays.manche', { roundNo: record.roundNo, variantName: variantName(record.variant) })}</Eyebrow>
          <h2 className="font-display text-xl leading-tight text-ivory-50 sm:text-2xl">{t('overlays.abattage.title')}</h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('overlays.abattage.text')}</p>
          <ul className="mt-3 space-y-2" data-testid="abattage">
            {players.filter((p) => closedHands[p.player]).map((p, row) => {
              const h = closedHands[p.player]!;
              const name = (h.rank !== undefined ? describeRank(h.rank) : null) ?? categoryLabel(h.category);
              return (
                <li key={p.player} className="rounded-xl bg-ink-900/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-ivory-50">{nick(view, p.player)}</span>
                    <span className="text-sm font-semibold text-gold-300">{name}</span>
                  </div>
                  <span className="mt-2 flex justify-center -space-x-1.5" role="group" aria-label={t('overlays.abattage.main', { nick: nick(view, p.player) })}>
                    {sortHand(h.cards).map((c, i) => <RevealCard key={c} code={c} size="xs" index={row * 2 + i} />)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-end gap-3">
            {!interacted && <span className="text-xs text-ivory-300/60">{t('overlays.abattage.auto', { left: handsLeft })}</span>}
            <Button onClick={() => setStage('result')}>{t('overlays.abattage.cta')}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('overlays.resultat_de_la', { roundNo: record.roundNo })} onClose={onClose} wide compact>
      <div onPointerDown={() => setInteracted(true)} onWheel={() => setInteracted(true)}>
      <Eyebrow>
        {t('overlays.manche', { roundNo: record.roundNo, variantName: variantName(record.variant) })}</Eyebrow>
      <h2 className="font-display text-xl leading-tight text-ivory-50 sm:text-2xl" aria-live="polite">
        {awardText(record, view)}
      </h2>
      <WinnerBanner record={record} view={view} />

      {record.award.kind === 'POINTS' && record.award.tiebreak && (
        <div className="mt-4">
          <TiebreakSequence tiebreak={record.award.tiebreak} view={view} intro />
        </div>
      )}

      {shownBoard.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-1.5" role="group" aria-label={t('overlays.cartes_communes')}>
          {shownBoard.map((c, i) => (c ? <PlayingCard key={i} code={c} size="sm" fourColor={fourColor} /> : <span key={i} className="aspect-[5/7] w-12 rounded-[9px] border border-dashed border-ivory-100/25" />))}
        </div>
      )}
      {(record.summary?.teats ?? 0) > 0 && <p className="mt-3 text-center text-xs text-ivory-200/80">{t('overlays.manche_jouee_avec')} {record.summary!.teats === 1 ? t('overlays.une_tetine') : '2 tétines'}.</p>}
      {(record.summary?.sideBets ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-gold-500/30 bg-gold-500/5 p-3 text-sm text-ivory-100" aria-label={t('overlays.paris_exterieurs')}>
          {record.summary!.sideBets!.map((b) => (
            <li key={`${b.line}-${b.amount}`}>
              {t('overlays.ligne_jetons_par', { line: b.line, toLocaleString: b.amount.toLocaleString(locale()) })} {b.refunded || b.winners.length === 0 ? t('overlays.mises_rendues') : tp('overlays.la_cagnotte', b.winners.length, { join: b.winners.map((w) => nick(view, w)).join(' + ') })}
            </li>
          ))}
        </ul>
      )}
      {flushes.map((f) => (
        <StraightFlushFeast key={f.player} name={nick(view, f.player)} cards={f.cards} line={f.line} />
      ))}
      {lines.length > 0 && <LinesRecap lines={lines} view={view} scale={60} showCombos={false} />}

      <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-gold-400">{t('overlays.scores')}</h3>
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
        {left !== null && !interacted && <span className="text-xs text-ivory-300/60">{t('overlays.fermeture_dans_s', { left })}</span>}
        <Button onClick={onClose}>{final ? t('overlays.voir_le_resultat') : t('overlays.continuer')}</Button>
      </div>
      </div>
    </Modal>
  );
}

// ---------- Fin de partie ----------
export function GameOverModal({ view, onClose, onLeave, onRegister, onRematch }: { view: RoomView; onClose: () => void; onLeave: () => void; onRegister?: () => void; onRematch?: () => void }) {
  const { t } = useI18n();
  const account = useAccount((s) => s.account);
  const game = view.game!;
  const o = game.outcome!;
  const insured = o.insurance ? o.insurance.players : null;
  const { sound } = useSettings();
  useEffect(() => {
    if (sound) Sound.victory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title={t('overlays.fin_de_partie')} wide>
      <Confetti />
      <CoinRain />
      <div className="flex items-center gap-4">
        <WinnerSpotlight className="shrink-0">
          <SpinTrophy size={96} />
        </WinnerSpotlight>
        <div className="min-w-0">
          <Eyebrow>{t('overlays.fin_de_partie')}</Eyebrow>
          <VictoryTitle className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">{t('overlays.victoire', { v: deNom(nick(view, o.winner)) })}</VictoryTitle>
          <p className="mt-1 text-gold-300">{VICTORY_LABELS[o.victoryType]}</p>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">{t('overlays.classement')}</h3>
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
              <span className="w-6 text-center font-display text-xl text-ivory-300/50" aria-label={t('overlays.non_classe')}>–</span>
              <Avatar nickname={nick(view, p.player)} avatar={view.players.find((x) => x.id === p.player)?.avatar} size={34} dim={p.excluded} />
              <span className="flex-1 font-medium text-ivory-100">{nick(view, p.player)}</span>
              <span className="text-sm text-ivory-200/70">{p.position} · {pointsLabel(p.score)}</span>
            </li>
          ))}
      </ol>
      {o.insurance && insured && (
        <p className="mt-2 text-xs text-ivory-300/80">
          {t('overlays.assurance_appliquee_entre', { nick: nick(view, insured[0]), nick2: nick(view, insured[1]), name: INSURANCE_LABELS[o.insurance.type].name })}</p>
      )}

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">{t('overlays.repartition_de_la')}</h3>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('overlays.mise_gain_bilan', { formatChips: formatChips(STARTING_CHIPS) })}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
            <th className="py-1 font-medium">{t('overlays.joueur')}</th>
            <th className="hidden py-1 text-right font-medium sm:table-cell">{t('overlays.mise')}</th>
            <th className="py-1 text-right font-medium">{t('overlays.recoit')}</th>
            <th className="py-1 text-right font-medium">{t('overlays.bilan')}</th>
            <th className="py-1 text-right font-medium">{t('overlays.jetons_finaux')}</th>
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
                <td className="py-1.5 text-right tabular-nums text-ivory-50"><span className="sm:hidden">{payout.toLocaleString(locale())}</span><span className="hidden sm:inline">{formatChips(payout)}</span></td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${net > 0 ? 'text-jade-300' : net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}><span className="sm:hidden">{net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toLocaleString(locale())}</span><span className="hidden sm:inline">{formatSignedChips(net)}</span></td>
                <td className="py-1.5 text-right tabular-nums text-ivory-50">{(STARTING_CHIPS + net + (o.sideBets?.[p.player] ?? 0)).toLocaleString(locale())}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold-500/40 text-ivory-50">
            <td className="py-1.5 font-semibold">{t('overlays.cagnotte')}</td>
            <td className="hidden sm:table-cell" />
            <td className="py-1.5 text-right font-semibold tabular-nums"><span className="sm:hidden">{o.settlement.potChips.toLocaleString(locale())}</span><span className="hidden sm:inline">{formatChips(o.settlement.potChips)}</span></td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
      <RoundsRecap history={game.history} view={view} />

      {!account && onRegister && (
        <section className="mt-6 rounded-xl border border-gold-500/40 bg-gold-500/5 p-4" aria-label={t('overlays.compte.titre')} data-testid="guest-invite">
          <h3 className="font-display text-xl text-ivory-50">{t('overlays.compte.titre')}</h3>
          <p className="mt-1 text-sm text-ivory-100/90">{t('overlays.compte.texte')}</p>
          <Button className="mt-3" onClick={onRegister}>{t('overlays.compte.cta')}</Button>
        </section>
      )}

      <div className={`flex flex-col gap-2 sm:flex-row sm:justify-end sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 border-t border-ivory-100/10 bg-ink-800 px-5 pb-8 pt-3 sm:static sm:mx-0 sm:mb-0 sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0`}>
        <Button variant="secondary" onClick={onClose}>
          {t('overlays.revoir_la_table')}</Button>
        <Button variant={onRematch ? 'secondary' : 'primary'} onClick={onLeave}>{t('overlays.retour_a_l')}</Button>
        {onRematch && <Button onClick={onRematch}>{view.rematch ? t('overlays.revanche.rejoindre') : t('overlays.revanche.ouvrir')}</Button>}
      </div>
    </Modal>
  );
}

// ---------- Scores et historique ----------
function Sparkline({ values, max }: { values: number[]; max: number }) {
  const { t } = useI18n();
  if (values.length === 0) return <span className="text-xs text-ivory-300/50">—</span>;
  const w = 90;
  const h = 26;
  const pts = [0, ...values].map((v, i, a) => `${(i / Math.max(1, a.length - 1)) * w},${h - 2 - (v / Math.max(1, max)) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('overlays.evolution2', { join: values.join(', ') })}>
      <polyline points={pts} fill="none" stroke="#c9a25a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ScoreModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const { t } = useI18n();
  const game = view.game!;
  return (
    <Modal title={t('overlays.scores_et_historique')} onClose={onClose} wide>
      <Eyebrow>{t('overlays.objectif', { pointsLabel: pointsLabel(game.targetPoints) })}</Eyebrow>
      <h2 className="mt-1 font-display text-2xl text-ivory-50">{t('overlays.scores_et_historique')}</h2>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">{t('overlays.scores_des_joueurs')}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
            <th className="py-1 font-medium">{t('overlays.joueur')}</th>
            <th className="py-1 font-medium">{t('overlays.points')}</th>
            <th className="hidden py-1 font-medium sm:table-cell">{t('overlays.evolution')}</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => {
            const ins = game.insurance.accepted.find((i) => i.players.includes(p.player));
            return (
              <tr key={p.player} className="border-t border-ivory-100/10">
                <td className="py-2 text-ivory-50">
                  {nick(view, p.player)} <span className="text-xs text-gold-400">{p.position}</span>
                  {view.players.find((x) => x.id === p.player)?.bot && <span className="ml-2 align-middle"><Badge tone="neutral">{t('overlays.cpu')}</Badge></span>}
                  {ins && <span className="ml-2 align-middle"><Badge tone="gold">{t('overlays.assure_avec', { v: nick(view, ins.players.find((x) => x !== p.player)!) })}</Badge></span>}
                  {p.excluded && <span className="ml-2 align-middle"><Badge tone="red">{t('overlays.exclu')}</Badge></span>}
                </td>
                <td className="py-2"><ScorePips score={p.score} target={game.targetPoints} /></td>
                <td className="hidden py-2 sm:table-cell"><Sparkline values={game.evolution[p.player] ?? []} max={game.targetPoints} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gold-400">{t('overlays.historique_des_manches')}</h3>
      {game.history.length === 0 ? (
        <p className="text-sm text-ivory-300/70">{t('overlays.aucune_manche_terminee')}</p>
      ) : (
        <ol className="space-y-1.5">
          {[...game.history].reverse().map((r) => (
            <li key={r.roundNo} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
              <span className="text-ivory-50">
                <span className="mr-2 text-ivory-300/60">#{r.roundNo}</span>
                {variantName(r.variant)} <span className="text-xs text-ivory-300/60">{t('overlays.choisie_par', { nick: nick(view, r.chooser) })}</span>
              </span>
              <span className="text-ivory-200/85">{r.award.kind === 'POINTS' ? t('overlays.txt', { nick: nick(view, r.award.winner), points: r.award.points, v: r.award.tiebreak ? (" " + t('overlays.departage')) : '' }) : r.award.kind === 'INSTANT_VICTORY' ? t('overlays.quinte_flush_victoire') : t('overlays.aucun_point')}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>{t('overlays.fermer')}</Button>
      </div>
    </Modal>
  );
}

// ---------- Vainqueur de la manche et combinaison gagnante ----------
/** Bandeau de fin de manche : qui gagne, avec quelle combinaison (et ses cartes quand elles sont connues). */
export function WinnerBanner({ record, view }: { record: RoundRecord; view: RoomView }) {
  const { t } = useI18n();
  const a = record.award;
  const winner = a.kind === 'POINTS' || a.kind === 'INSTANT_VICTORY' ? a.winner : null;
  if (!winner) return null;
  const combo = winningCombination(record);
  const cards = winningCards(record);
  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/50 bg-gradient-to-r from-gold-500/20 to-transparent px-3 py-1.5" data-testid="vainqueur-manche">
      <Shine />
      <SpinTrophy size={38} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-xs uppercase tracking-widest text-gold-300">{t('overlays.vainqueur_de_la')}</p>
        <p className="font-display text-xl text-ivory-50">
          {nick(view, winner)}{combo && <span className="text-gold-300"> ({combo})</span>}
        </p>
      </div>
      {cards.length > 0 && (
        <span className="flex -space-x-2" role="group" aria-label={t('overlays.cartes_de_la')}>
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  return (
    <section className="mt-6" aria-label={t('overlays.resultat_de_chaque')}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full justify-between">
        <span>{open ? t('overlays.masquer') : t('overlays.voir')}  {t('overlays.le_resultat_de', { n: history.length })}</span>
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
  const { t } = useI18n();
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
                {t('overlays.manche2', { roundNo: r.roundNo })} <span className="text-gold-300">{variantName(r.variant)}</span>
              </span>
              <span className="flex items-center gap-2">
                {pts !== null && <Badge tone="gold">+{pointsLabel(pts)}</Badge>}
                {star && (
                  <button
                    type="button"
                    onClick={() => star.toggle(r.roundNo)}
                    aria-pressed={on}
                    aria-label={t('overlays.manche_favorite', { roundNo: r.roundNo })}
                    title={on ? t('overlays.retirer_des_manches') : t('overlays.ajouter_aux_manches')}
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
