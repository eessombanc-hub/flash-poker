import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Board } from '../components/Board';
import { Seat } from '../components/Seat';
import { SettingsBody } from '../components/SettingsBody';
import { Badge, Button, Modal, Panel } from '../components/ui';
import { useClient, useGame } from '../lib/context';
import { useGameAlerts } from '../lib/alerts';
import { describeEvent, type Announcement } from '../lib/events';
import { formatChips } from '../lib/format';
import { variantName } from '../lib/labels';
import { useMediaQuery } from '../lib/media';
import { closedInfo, discardInfo, line63Info, reveal61Info } from '../lib/roundInfo';
import { nick, opponentCards, seatedPlayers } from '../lib/selectors';
import { useSettings } from '../lib/settings';
import { Sound } from '../lib/sound';
import { FELT_OPTIONS } from '../lib/theme';
import { useTable } from '../lib/table';
import type { PlayerPublic, RoomView, RoundRecord } from '../lib/types';
import { ClosedPanel } from '../panels/ClosedPanel';
import { DiscardPanel } from '../panels/DiscardPanel';
import { MorpionPanel } from '../panels/MorpionPanel';
import { Reveal10Panel } from '../panels/Reveal10Panel';
import { InsurancePanel } from '../panels/InsurancePanel';
import { Line63Panel } from '../panels/Line63Panel';
import { Reveal61Panel } from '../panels/Reveal61Panel';
import { ChatDock, ThrowLayer } from '../components/Social';
import { hasStraightFlush, morpionInfo, reveal10Info } from '../lib/roundInfo';
import { VariantPicker } from '../panels/VariantPicker';
import { RulesModal } from './Home';
import { collectRoundEvents, GameOverModal, RoundResultModal, ScoreModal } from './Overlays';
import { tr, useI18n } from '../i18n';

// ---------- Annonces (« Variante choisie : … », « Nouvel ordre : … ») ----------
type CurrentAnnouncement = (Announcement & { id: number }) | null;

/** Dernière annonce publique de la partie, visible quelques secondes. */
function useAnnouncement(): CurrentAnnouncement {
  const feed = useGame((s) => s.feed);
  const view = useGame((s) => s.view)!;
  const [current, setCurrent] = useState<CurrentAnnouncement>(null);
  const seen = useRef(feed.at(-1)?.id ?? 0);
  useEffect(() => {
    const fresh = feed.filter((f) => f.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh.at(-1)!.id;
    for (const f of [...fresh].reverse()) {
      if (f.event.visibility === 'PLAYER') continue; // les rappels privés passent par les notifications
      const a = describeEvent(f.event, view);
      if (a) return setCurrent({ ...a, id: f.id });
    }
  }, [feed, view]);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 4200);
    return () => clearTimeout(t);
  }, [current]);
  return current;
}

/** Annonce du moment, partagée entre la barre d'état (ordinateur) et le bandeau du tapis (téléphone). */
const NewsContext = createContext<CurrentAnnouncement>(null);

const ANNOUNCE_TONE = { warning: 'text-amber-100', success: 'text-jade-100', info: 'text-ivory-50', error: 'text-ruby-100' } as const;

// ---------- Barre d'état ----------
/**
 * Ordinateur : l'annonce du moment s'affiche DANS la barre, à la place des pastilles. Téléphone : elle remplace le
 * bandeau de la variante sur le tapis (voir `TableCenter`). Elle ne recouvre jamais le menu ni les cartes.
 */
function TopBar({ onScores, onRules, onOptions, onBack }: { onScores: () => void; onRules: () => void; onOptions: () => void; onBack: () => void }) {
  const { t, tp } = useI18n();
  const { view, game, round } = useTable();
  const news = useContext(NewsContext);
  const newsText = news && (
    <motion.span key={news.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={`block font-medium ${ANNOUNCE_TONE[news.tone]}`}>
      {news.text}
    </motion.span>
  );
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-ivory-100/10 bg-ink-800/90 px-3 py-1.5 sm:flex-wrap sm:px-4 sm:py-2">
      <span className="sr-only" aria-live="polite" role="status">
        {news?.text ?? ''}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button type="button" onClick={onBack} aria-label={t('table.retour_a_l')} className="shrink-0 rounded-lg px-2 py-1 text-sm text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
          {t('table.retour')}</button>
        <div className="min-w-0">
          <p className="truncate font-display text-base text-ivory-50 sm:text-lg">{view.name}</p>
          <p className="flex min-w-0 font-mono text-[11px] tracking-widest text-gold-400 sm:text-xs">
            <span className="shrink-0">{view.code}</span>
            {/* Téléphone : l'essentiel des pastilles en une ligne, sous le code (le code, lui, n'est jamais coupé). */}
            <span className="truncate font-sans tracking-normal text-ivory-200/80 sm:hidden">
              {' '}{tp('table.m_pt', game.targetPoints, { roundNo: game.roundNo })} · {formatChips(game.potChips)}
            </span>
          </p>
        </div>
      </div>
      <div className="hidden min-w-0 flex-wrap items-center justify-center gap-1.5 sm:flex">
        {news ? (
          <p className="rounded-full border border-gold-500/40 bg-ink-900/80 px-4 py-1 text-sm" aria-hidden="true">
            {newsText}
          </p>
        ) : (
          <>
            <Badge tone="neutral">{t('table.manche', { roundNo: game.roundNo })}</Badge>
            {round && <Badge tone="gold">{variantName(round.variant)}</Badge>}
            <Badge tone="neutral">{tp('table.objectif_pt', game.targetPoints)}</Badge>
            <Badge tone="green">{t('table.cagnotte', { formatChips: formatChips(game.potChips) })}</Badge>
          </>
        )}
      </div>
      <nav className="flex shrink-0 gap-0 sm:gap-1" aria-label={t('table.menu_de_la')}>
        <Button variant="ghost" className="min-h-[40px] px-1.5 text-xs sm:px-3 sm:text-sm" onClick={onScores}>
          {t('table.scores')}</Button>
        <Button variant="ghost" className="min-h-[40px] px-1.5 text-xs sm:px-3 sm:text-sm" onClick={onRules}>
          {t('table.regles')}</Button>
        <Button variant="ghost" className="min-h-[40px] px-1.5 text-xs sm:px-3 sm:text-sm" onClick={onOptions}>
          {t('table.options')}</Button>
      </nav>
    </header>
  );
}

// ---------- Tapis : sièges et plateau ----------
function useSeatProps() {
  const { view, game, round } = useTable();
  return (p: PlayerPublic) => {
    let validated = false;
    let folded = false;
    let active = false;
    if (round) {
      active = round.awaiting.includes(p.id);
      if (round.variant === 'CLOSED_1' || round.variant === 'CLOSED_2') validated = closedInfo(round).validated.includes(p.id);
      if (round.variant === 'AVIATION' || round.variant === 'AVIA_6') {
        const i = discardInfo(round);
        validated = i.validated.includes(p.id);
        folded = i.status[p.id] === 'FOLDED';
      }
      if (round.variant === 'V6_3') validated = line63Info(round).validated.includes(p.id);
      if (round.variant === 'V6_1') active = reveal61Info(round).next === p.id;
      if (round.variant === 'MORPION') validated = morpionInfo(round).validated.includes(p.id);
      if (round.variant === 'LE10') active = reveal10Info(round).next === p.id;
    } else if (game.phase === 'VARIANT_SELECTION') {
      active = game.awaiting.includes(p.id);
    }
    const shown = round && p.id !== view.you.playerId ? opponentCards(round, p.id) : { shown: [], hiddenCount: 0 };
    return {
      player: p,
      isMe: p.id === view.you.playerId,
      target: game.targetPoints,
      shown: shown.shown,
      hiddenCount: shown.hiddenCount,
      active,
      validated,
      folded,
      insured: game.insurance.accepted.some((i) => i.players.includes(p.id)),
      isChooser: game.phase === 'VARIANT_SELECTION' && game.chooser === p.id,
      score: game.players.find((x) => x.player === p.id)?.score ?? 0,
    };
  };
}

function TableCenter() {
  const { t, tp } = useI18n();
  const { game, round } = useTable();
  const news = useContext(NewsContext);
  // Téléphone : l'annonce du moment prend un instant la place du bandeau de la variante (ordinateur : barre d'état).
  const phoneNews = news && (
    <motion.p key={news.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-full bg-ink-950/70 px-3 py-0.5 text-[11px] font-medium leading-snug sm:hidden ${ANNOUNCE_TONE[news.tone]}`} aria-hidden="true">
      {news.text}
    </motion.p>
  );
  return (
    <div className="flex flex-col items-center gap-1 text-center sm:gap-1.5">
      {round ? (
        <>
          <Board round={round} size="board" />
          {phoneNews}
          <p className={`rounded-full bg-ink-950/50 px-3 py-0.5 text-xs uppercase tracking-[0.2em] text-gold-300 sm:block ${news ? 'hidden' : ''}`}>
            {variantName(round.variant)}{round.variant === 'CLOSED_1' || round.variant === 'CLOSED_2' ? '' : ` (${phaseLabel(round.variant, round.phase)})`}
          </p>
        </>
      ) : (
        <>
          {phoneNews}
          <p className={`font-display text-base text-ivory-50 sm:block sm:text-2xl ${news ? 'hidden' : ''}`}>{game.phase === 'GAME_OVER' ? t('table.partie_terminee') : t('table.manche_choix_de', { roundNo: game.roundNo })}</p>
        </>
      )}
      <p className="hidden text-xs text-ivory-100/85 sm:block sm:text-sm">
        {t('table.cagnotte2')} <strong className="text-gold-300">{formatChips(game.potChips)}</strong>
      </p>
    </div>
  );
}

function phaseLabel(variant: string, phase: string): string {
  const n = phase.split('_')[1];
  if (phase === 'DONE') return tr('ph.done');
  if (variant === 'V6_3') return phase === 'BETS' ? tr('ph.bets') : tr('ph.line', { n: n ?? '' });
  if (variant === 'V6_1' || variant === 'LE10') return tr('ph.reveals');
  if (variant === 'MORPION') return tr('ph.designation');
  if (variant.startsWith('CLOSED')) return tr('ph.swap', { n: n ?? '' });
  return tr('ph.discard', { n: n ?? '' });
}

/**
 * Ordre des sièges affichés : moi d'abord, puis les autres dans l'ordre des positions (sens horaire).
 * Spectateur (pas assis) : l'ordre des positions tel quel.
 */
export function orderFromMe<T extends { id: string }>(players: T[], me: string): T[] {
  const myIdx = players.findIndex((p) => p.id === me);
  return myIdx > 0 ? [...players.slice(myIdx), ...players.slice(0, myIdx)] : players;
}

function TableFelt() {
  const { t, tp } = useI18n();
  const { view, me } = useTable();
  const seatProps = useSeatProps();
  const desktop = useMediaQuery('(min-width: 768px)');
  const { feltColor } = useSettings();
  const felt = FELT_OPTIONS.find((f) => f.id === feltColor) ?? FELT_OPTIONS[0]!;
  const feltVars = { '--felt-a': felt.a, '--felt-b': felt.b, '--felt-c': felt.c } as CSSProperties;
  const players = seatedPlayers(view);
  const ordered = orderFromMe(players, me);

  if (desktop) {
    // Sièges en une rangée au-dessus du tapis : ils ne recouvrent jamais les cartes communes (grille du
    // Morpion, trois lignes du 6-3) et la table reste assez basse pour laisser la place au panneau d'action.
    return (
      <div className="mx-auto mt-1 w-full max-w-5xl shrink-0" role="group" aria-label={t('table.table_de_jeu')}>
        <div className="mb-1.5 flex flex-wrap justify-center gap-2">
          {ordered.map((p) => (
            <div key={p.id} className="w-40">
              <Seat {...seatProps(p)} compact />
            </div>
          ))}
        </div>
        <div className="felt flex min-h-[150px] items-center justify-center rounded-[999px] px-[9%] py-3" style={feltVars}>
          <div className="w-full max-w-2xl">
            <TableCenter />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="felt shrink-0 rounded-3xl p-1.5" style={feltVars} role="group" aria-label={t('table.table_de_jeu')}>
      <div className="py-1">
        <TableCenter />
      </div>
      <div className={`grid gap-1.5 ${ordered.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {ordered.map((p) => (
          <Seat key={p.id} {...seatProps(p)} compact />
        ))}
      </div>
    </div>
  );
}

// ---------- Panneaux d'action ----------
function ActionDock() {
  const { t, tp } = useI18n();
  const { view, game, round, excluded, timerKey } = useTable();
  const ref = useRef<HTMLDivElement>(null);
  // Nouvelle phase à jouer : si le bas du panneau (main, bouton de validation) dépasse de l'écran, on l'y ramène.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.scrollIntoView !== 'function' || !timerKey) return;
    if (el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView({ block: 'end', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [timerKey]);
  const notes: ReactNode[] = [];
  if (view.you.role === 'QUEUED') notes.push(<Banner key="q">{t('table.vous_rejoindrez_la')}</Banner>);
  if (excluded) notes.push(<Banner key="x" tone="red">{t('table.vous_avez_ete')}</Banner>);

  let body: ReactNode = null;
  if (game.phase === 'VARIANT_SELECTION') {
    body = (
      <>
        <InsurancePanel />
        <VariantPicker />
      </>
    );
  } else if (game.phase === 'ROUND' && round) {
    body =
      round.variant === 'V6_3' ? <Line63Panel /> : round.variant === 'V6_1' ? <Reveal61Panel /> : round.variant === 'LE10' ? <Reveal10Panel /> : round.variant === 'MORPION' ? <MorpionPanel /> : round.variant === 'AVIATION' || round.variant === 'AVIA_6' ? <DiscardPanel /> : <ClosedPanel />;
  } else if (game.phase === 'GAME_OVER') {
    body = <Panel className="p-5 text-center text-ivory-200/85">{t('table.la_partie_est')}</Panel>;
  }
  return (
    <div ref={ref} className="space-y-3">
      {notes}
      {body}
    </div>
  );
}

function Banner({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'red' }) {
  return <p className={`rounded-xl border px-4 py-2.5 text-sm ${tone === 'red' ? 'border-ruby-500/50 bg-ruby-950/60 text-ruby-100' : 'border-gold-500/40 bg-gold-500/10 text-ivory-100'}`}>{children}</p>;
}

// ---------- Écran de jeu ----------
export function Table({ onRegister }: { onRegister?: () => void } = {}) {
  const { t, tp } = useI18n();
  const client = useClient();
  const { view, game, me } = useTable();
  const feed = useGame((s) => s.feed);
  const { sound } = useSettings();
  const [modal, setModal] = useState<null | 'scores' | 'rules' | 'options' | 'quit'>(null);
  const [result, setResult] = useState<RoundRecord | null>(null);
  const [finalOpen, setFinalOpen] = useState(game.phase === 'GAME_OVER');
  const seen = useRef(game.history.length);
  // Dernier plateau connu : la manche disparaît de la vue dès qu'elle est notée, le récapitulatif en a besoin.
  const lastBoard = useRef<(string | null)[]>([]);
  if (game.round) lastBoard.current = game.round.cards.board;
  const [resultBoard, setResultBoard] = useState<(string | null)[]>([]);

  // Une manche vient de se terminer : résultat (showdown, lignes, départage) ; ne rien montrer au chargement d'une partie en cours.
  useEffect(() => {
    if (game.history.length > seen.current) {
      const record = game.history.at(-1)!;
      setResult(record);
      setResultBoard(lastBoard.current);
      if (game.phase === 'GAME_OVER') setFinalOpen(false);
      if (sound) {
        const iWon = (record.award.kind === 'POINTS' || record.award.kind === 'INSTANT_VICTORY') && record.award.winner === me;
        Sound[hasStraightFlush(record) ? 'cheer' : iWon ? 'win' : 'flip']();
      }
    }
    seen.current = game.history.length;
  }, [game.history, game.phase, me, sound]);
  // Cartes distribuées au début d'une manche : bruit de distribution (pas au chargement d'une partie en cours).
  const lastDealt = useRef<string | null>(null);
  useEffect(() => {
    const key = game.round ? `${game.roundNo}:${game.round.variant ?? ''}` : null;
    if (key && lastDealt.current !== null && lastDealt.current !== key && sound) Sound.deal();
    if (key) lastDealt.current = key;
  }, [game.round, game.roundNo, sound]);
  useEffect(() => {
    if (game.phase === 'GAME_OVER' && !result) setFinalOpen(true);
  }, [game.phase, result]);
  useGameAlerts(sound);

  const events = useMemo(() => (result ? collectRoundEvents(feed, result.roundNo) : []), [feed, result]);
  const over = game.phase === 'GAME_OVER';
  const news = useAnnouncement();

  return (
    <NewsContext.Provider value={news}>
    <ThrowLayer />
    <ChatDock canThrow />
    <main className="relative mx-auto flex h-[100dvh] w-full max-w-6xl flex-col gap-1.5 overflow-hidden px-2 py-1.5 sm:px-3 sm:py-2 lg:max-w-[100rem]">
      <TopBar onScores={() => setModal('scores')} onRules={() => setModal('rules')} onOptions={() => setModal('options')} onBack={() => (over ? client.leave() : setModal('quit'))} />
      {/* Téléphone et tablette : table au-dessus, actions en dessous. Écran large : côte à côte, pour que la table,
          votre main et les boutons tiennent ensemble dans la hauteur de l'écran, sans défiler. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 lg:flex-row lg:gap-4">
        <div className="shrink-0 lg:flex lg:w-[50%] lg:flex-col lg:justify-center lg:overflow-y-auto">
          <TableFelt />
        </div>
        {/* Zone qui défile : atteignable au clavier (flèches) même quand elle ne contient aucun bouton. */}
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 lg:flex lg:flex-col lg:justify-center" tabIndex={0} role="region" aria-label={t('table.actions_de_jeu')}>
          <ActionDock />
        </div>
      </div>

      {result && <RoundResultModal record={result} events={events} board={resultBoard} view={view} final={over} onClose={() => { setResult(null); if (over) setFinalOpen(true); }} />}
      {!result && over && finalOpen && game.outcome && <GameOverModal view={view} onClose={() => setFinalOpen(false)} onLeave={() => client.leave()} onRegister={onRegister ? () => { client.leave(); onRegister(); } : undefined} />}
      {modal === 'scores' && <ScoreModal view={view} onClose={() => setModal(null)} />}
      {modal === 'rules' && <RulesModal onClose={() => setModal(null)} />}
      {modal === 'quit' && (
        <Modal title={t('table.quitter_la_partie')} onClose={() => setModal(null)}>
          <h2 className="font-display text-2xl text-ivory-50">{t('table.quitter_la_partie2')}</h2>
          <p className="mt-3 text-sm text-ivory-200/85">{t('table.la_partie_est2')}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>{t('table.rester_a_la')}</Button>
            <Button variant="danger" onClick={() => client.leave()}>{t('table.quitter')}</Button>
          </div>
        </Modal>
      )}
      {modal === 'options' && (
        <Modal title={t('table.options')} onClose={() => setModal(null)}>
          <h2 className="font-display text-2xl text-ivory-50">{t('table.options')}</h2>
          <div className="mt-5">
            <SettingsBody />
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setModal(null)}>{t('table.fermer')}</Button>
          </div>
        </Modal>
      )}
      {over && !finalOpen && !result && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <Button onClick={() => setFinalOpen(true)}>{t('table.voir_le_resultat')}</Button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {game.phase === 'VARIANT_SELECTION' ? t('table.choisit_la_variante', { nick: nick(view, game.chooser) }) : ''}
      </span>
    </main>
    </NewsContext.Provider>
  );
}

export type { RoomView };
