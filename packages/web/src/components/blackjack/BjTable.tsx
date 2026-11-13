import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Badge, Button } from '../ui';
import { PlayingCard } from '../Card';
import { CoinRain, Shine } from '../Scene3D';
import { FeltMark } from '../FeltMark';
import { formatChips, formatSignedChips } from '../../lib/format';
import { ACTION_LABEL, CHIP_COLORS, RESULT_LABEL, RESULT_TONE, SPEED_MS, totalText, paysText, decksText, type Pedagogy, type Speed } from '../../lib/blackjack';
import { FELT_OPTIONS } from '../../lib/theme';
import { Sound } from '../../lib/sound';
import { useSettings } from '../../lib/settings';
import type { Advice, BjAction, BjActive, BjResult, Odds, PlayerHand } from '../../lib/types';
import { FairnessProof } from './Panels';
import { useI18n } from '../../i18n';

export interface HelpData {
  advice: Advice | null;
  odds: Odds;
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;
const ORDER: BjAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER'];
const KEYS: Record<string, BjAction> = { h: 'HIT', s: 'STAND', d: 'DOUBLE', p: 'SPLIT', r: 'SURRENDER' };

/** Pile de jetons décorative : un jeton par palier de la mise, au plus cinq, pour rester lisible. */
export function ChipStack({ amount, size = 30 }: { amount: number; size?: number }) {
  const { t } = useI18n();
  const parts = useMemo(() => {
    const out: number[] = [];
    let rest = amount;
    for (const v of [500, 100, 25, 5, 1]) {
      while (rest >= v && out.length < 5) {
        out.push(v);
        rest -= v;
      }
    }
    return out;
  }, [amount]);
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={t('bjtable.mise', { formatChips: formatChips(amount) })}>
      <span className="relative inline-block" style={{ width: size, height: size + parts.length * 3 }} aria-hidden="true">
        {parts.map((v, i) => (
          <span
            key={i}
            className="absolute left-0 rounded-full border-2 border-dashed border-white/70 shadow-md"
            style={{ width: size, height: size, bottom: i * 3, background: CHIP_COLORS[v] ?? '#8a6a2f' }}
          />
        ))}
      </span>
      <span className="font-display text-sm text-ivory-50">{formatChips(amount)}</span>
    </span>
  );
}

export function HandView({ hand, index, isActive, compact, settled, speed, fourColor, cardBack }: { hand: PlayerHand; index: number; isActive: boolean; compact: boolean; settled: boolean; speed: Speed; fourColor: boolean; cardBack: 'losange' | 'rayures' | 'etoile' }) {
  const { t } = useI18n();
  const fast = speed === 'rapide';
  return (
    <div
      className={`rounded-2xl border px-2.5 py-2 transition ${isActive ? 'border-gold-400/80 bg-black/25 shadow-gold' : 'border-transparent bg-black/10'}`}
      aria-label={t('bjtable.main', { v: index + 1, v2: isActive ? (" " + t('bjtable.en_cours')) : '' })}
    >
      <div className={`flex ${compact ? '[&>*:not(:first-child)]:-ml-7' : '[&>*:not(:first-child)]:-ml-6 sm:[&>*:not(:first-child)]:-ml-8'}`}>
        {hand.cards.map((c, i) => (
          <PlayingCard key={`${i}-${c}`} code={c} size={compact ? 'sm' : 'md'} fourColor={fourColor} back={cardBack} flip={false} dealIndex={fast ? undefined : i + 1} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ivory-50" data-testid={`total-${index}`}>
          {totalText(hand.cards)}
        </span>
        <ChipStack amount={hand.bet} size={22} />
      </div>
      {settled && hand.result && (
        <div className="mt-1.5 flex items-center gap-2">
          <Badge tone={RESULT_TONE[hand.result]}>{RESULT_LABEL[hand.result]}</Badge>
          <span className={`text-sm font-semibold ${hand.net > 0 ? 'text-emerald-300' : hand.net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedChips(hand.net)}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  active: BjActive;
  result: BjResult | null;
  chips: number;
  speed: Speed;
  pedagogy: Pedagogy;
  help: HelpData | null;
  busy: boolean;
  error: string | null;
  canReplay: boolean;
  onAction: (a: BjAction) => void;
  onReplay: () => void;
  onLeave: () => void;
}

/** Table de Blackjack : croupier, mains du joueur, actions, aide pédagogique et fin de manche. */
export function BjTable({ active, result, chips, speed, pedagogy, help, busy, error, canReplay, onAction, onReplay, onLeave }: Props) {
  const { t } = useI18n();
  const { fourColor, cardBack, feltColor, sound } = useSettings();
  const reduce = useReducedMotion();
  const felt = FELT_OPTIONS.find((f) => f.id === feltColor) ?? FELT_OPTIONS[0]!;
  const feltVars = { '--felt-a': felt.a, '--felt-b': felt.b, '--felt-c': felt.c } as CSSProperties;
  const r = active.round;
  const done = r.phase === 'DONE';
  const dealer = r.dealer;

  // Révélation progressive de la main du croupier : carte cachée, puis chaque tirage, au rythme choisi.
  const [upTo, setUpTo] = useState(1);
  const stepMs = reduce ? 0 : SPEED_MS[speed];
  useEffect(() => {
    if (!done || upTo >= dealer.length) return;
    const t = setTimeout(() => {
      setUpTo((n) => n + 1);
      if (sound) Sound.flip();
    }, upTo === 1 ? Math.round(stepMs * 1.4) : stepMs);
    return () => clearTimeout(t);
  }, [done, upTo, dealer.length, stepMs, sound]);
  const settled = !done || upTo >= dealer.length;

  // Son de fin de manche, une seule fois quand tout est révélé.
  const announced = useRef(false);
  useEffect(() => {
    if (!settled || !done || announced.current || !sound) return;
    announced.current = true;
    if (r.net > 0) Sound.win();
    else if (r.net < 0) Sound.error();
    else Sound.confirm();
  }, [settled, done, r.net, sound]);

  const dealerCards = done ? dealer.slice(0, Math.max(upTo, 2)) : dealer;
  const hiddenHole = !done || upTo < 2;
  const dealerFaceUp = dealerCards.filter((c, i) => c !== null && !(hiddenHole && i === 1));
  const dealerTotal = dealerFaceUp.length > 0 ? totalText(dealerFaceUp) : '';

  const legal = new Set(active.legal);
  const act = (a: BjAction) => {
    if (busy || !legal.has(a)) return;
    if (sound) (a === 'DOUBLE' || a === 'SPLIT' ? Sound.confirm : Sound.select)();
    onAction(a);
  };
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const a = KEYS[e.key.toLowerCase()];
      if (a) actRef.current(a);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showHelp = pedagogy !== 'libre' && !done && help;
  const coachAction = pedagogy === 'coach' ? help?.advice?.action : undefined;
  const compact = r.hands.length > 2;
  const good = settled && done && r.net > 0;
  const natural = settled && done && r.hands.some((h) => h.result === 'BLACKJACK');
  const actions = ORDER.filter((a) => a !== 'SURRENDER' || r.rules.surrender);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onLeave} className="px-3">
          {t('bjtable.tables')}</Button>
        <p className="text-sm text-ivory-200" aria-live="polite">
          {t('bjtable.jetons_libres')} <strong className="font-display text-base text-gold-300">{formatChips(done ? chips : active.freeChips)}</strong>
        </p>
      </div>

      <div className="felt felt-bj relative overflow-hidden rounded-[32px] px-3 py-3 sm:px-8 sm:py-4" style={feltVars}>
        <FeltMark />
        {/* Croupier */}
        <div className="flex flex-col items-center">
          <div className="mb-2 flex items-center gap-2 rounded-full border border-gold-500/40 bg-black/35 px-3.5 py-1 text-xs text-gold-200">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-600 font-display text-xs text-ink-950" aria-hidden="true">
              C
            </span>
            {t('bjtable.croupier')} {r.rules.dealerHitsSoft17 ? t('bjtable.tire_sur_17') : t('bjtable.reste_sur_tous')}
          </div>
          <div className="flex min-h-[5.2rem] items-center sm:min-h-[5.8rem] [&>*:not(:first-child)]:-ml-6 sm:[&>*:not(:first-child)]:-ml-8" data-testid="dealer-cards">
            {dealerCards.map((c, i) => (
              <PlayingCard key={`${i}-${c ?? 'x'}`} code={hiddenHole && i === 1 ? null : c} size="md" fourColor={fourColor} back={cardBack} flip={i > 0 && !!c && done} dealIndex={speed === 'rapide' ? undefined : i + 1} />
            ))}
          </div>
          <p className="mt-1 h-5 text-sm font-semibold text-ivory-50" data-testid="dealer-total">
            {dealerTotal}
          </p>
        </div>

        <p className="my-1.5 text-center text-[11px] tracking-wide text-gold-200/70">
          {t('bjtable.regles', { pays: paysText(r.rules.blackjackPays), decks: decksText(r.rules.decks) })}
        </p>

        {/* Joueur */}
        <div className="flex flex-wrap justify-center gap-2" data-testid="player-hands">
          {r.hands.map((h, i) => (
            <HandView key={i} hand={h} index={i} isActive={!done && i === r.active} compact={compact} settled={settled} speed={speed} fourColor={fourColor} cardBack={cardBack} />
          ))}
        </div>

        {/* Effets de fin de manche */}
        {good && <CoinRain count={natural ? 30 : 16} />}
        {natural && (
          <div className="pointer-events-none absolute inset-0">
            <Shine delay={0.2} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-ruby-500/50 bg-ruby-500/10 px-4 py-2 text-sm text-ruby-300">
          {error}
        </p>
      )}

      {!done && (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={t('bjtable.actions')}>
            {actions.map((a) => (
              <Button
                key={a}
                variant={a === coachAction ? 'primary' : a === 'HIT' || a === 'STAND' ? 'secondary' : 'ghost'}
                disabled={busy || !legal.has(a)}
                onClick={() => act(a)}
                aria-keyshortcuts={Object.entries(KEYS).find(([, v]) => v === a)?.[0]}
                className={`${a === coachAction ? 'ring-2 ring-gold-200' : 'border border-ivory-100/15'} ${a === 'HIT' ? 'col-span-1' : ''}`}
              >
                {ACTION_LABEL[a]}
                <kbd className="hidden rounded border border-current/30 px-1 text-[10px] opacity-60 sm:inline">{Object.entries(KEYS).find(([, v]) => v === a)?.[0]?.toUpperCase()}</kbd>
              </Button>
            ))}
          </div>
          {showHelp && (
            <div className="mt-3 rounded-2xl border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-ivory-100" data-testid="help-box">
              {pedagogy === 'coach' && help.advice && (
                <p className="mb-1.5">
                  <strong className="text-gold-300">{t('bjtable.conseil', { v: ACTION_LABEL[help.advice.action] })}</strong> {help.advice.reason}
                </p>
              )}
              <p className="text-ivory-200/90">
                {t('bj.odds', { bust: pct(help.odds.bustOnHit), win: pct(help.odds.stand.win), push: pct(help.odds.stand.push), lose: pct(help.odds.stand.lose) })}</p>
            </div>
          )}
        </div>
      )}

      {done && settled && <RoundSummary active={active} result={result} chips={chips} canReplay={canReplay && !busy} onReplay={onReplay} onLeave={onLeave} />}
    </div>
  );
}

function RoundSummary({ active, result, chips, canReplay, onReplay, onLeave }: { active: BjActive; result: BjResult | null; chips: number; canReplay: boolean; onReplay: () => void; onLeave: () => void }) {
  const { t } = useI18n();
  const net = active.round.net;
  const tone = net > 0 ? 'border-emerald-400/50 bg-emerald-500/10' : net < 0 ? 'border-ruby-500/40 bg-ruby-500/10' : 'border-ivory-100/20 bg-ink-800/80';
  return (
    <section aria-label={t('bjtable.resultat_de_la')} className={`rounded-3xl border p-4 sm:p-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl text-ivory-50" data-testid="round-net">
            {net > 0 ? t('bj.won', { chips: formatChips(net) }) : net < 0 ? t('bj.lost', { chips: formatChips(-net) }) : t('bj.push')}
          </p>
          <p className="text-sm text-ivory-200/85">
            {t('bjtable.solde', { formatChips: formatChips(chips) })}{result && result.xpGained > 0 ? `, +${result.xpGained} XP` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onReplay} disabled={!canReplay}>
            {t('bjtable.rejouer', { formatChips: formatChips(active.bet) })}</Button>
          <Button variant="ghost" onClick={onLeave}>
            {t('bjtable.changer_de_mise')}</Button>
        </div>
      </div>
      {!canReplay && chips < active.bet && <p className="mt-2 text-xs text-amber-200">{t('bjtable.solde_insuffisant_pour')}</p>}
      {result?.level && (
        <p className="mt-3 rounded-xl bg-gold-500/15 px-3 py-2 text-sm text-gold-200">
          {t('bjtable.niveau_atteint_recompense', { to: result.level.to, formatChips: formatChips(result.level.reward) })}</p>
      )}
      {result?.challengesDone.map((c) => (
        <p key={c.id} className="mt-2 text-sm text-emerald-200">
          {t('bjtable.defi_accompli_xp', { label: c.label, formatChips: formatChips(c.rewardChips), rewardXp: c.rewardXp })}</p>
      ))}
      {result?.achievements.map((a) => (
        <p key={a.id} className="mt-2 text-sm text-gold-200">
          {t('bjtable.objectif_debloque', { label: a.label, formatChips: formatChips(a.rewardChips) })}</p>
      ))}
      {result && (
        <details className="mt-3 text-xs text-ivory-300/80">
          <summary className="cursor-pointer text-ivory-200">{t('bjtable.verifier_l_equite')}</summary>
          <FairnessProof seed={result.seed} commitment={result.commitment} />
        </details>
      )}
    </section>
  );
}
