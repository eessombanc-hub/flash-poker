import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Eyebrow, Field, Panel, Segmented, inputClass } from '../components/ui';
import { CoinIcon } from '../components/Icons3D';
import { MultiTables } from '../components/blackjack/MultiTables';
import { BjTable, ChipStack, type HelpData } from '../components/blackjack/BjTable';
import { ChallengesPanel, HistoryPanel, LeaderboardPanel, LevelBar, StatsPanel } from '../components/blackjack/Panels';
import { useAccount, useAccountClient } from '../lib/context';
import { formatChips } from '../lib/format';
import { CHIP_COLORS, CHIP_VALUES, DOUBLE_LABEL, PEDAGOGIES, rulesSummary, SPEEDS, loadPrefs, savePrefs, type BjPrefs, type Pedagogy, type Speed } from '../lib/blackjack';
import { useSettings } from '../lib/settings';
import { Sound } from '../lib/sound';
import type { BjAction, BjActive, BjOverview, BjResult, TablePreset, TableRules } from '../lib/types';
import { currentI18n, locale, tr, useI18n } from '../i18n';
import { errorText } from '../lib/tbText';

export type Tab = 'jouer' | 'plusieurs' | 'progression' | 'classement' | 'historique';
const TABS: readonly Tab[] = ['jouer', 'plusieurs', 'progression', 'classement', 'historique'];
const TAB_LABEL: Record<Tab, string> = {
  get jouer() { return tr('bj.tab.jouer'); },
  get plusieurs() { return tr('bj.tab.plusieurs'); },
  get progression() { return tr('bj.tab.progression'); },
  get classement() { return tr('bj.tab.classement'); },
  get historique() { return tr('bj.tab.historique'); },
};
const FREE_ID = 'libre';
const FREE_LIMITS = { minBet: 1, maxBet: 1000 };

const rulesLine = rulesSummary;

/** Point d'entrée : ouvert à tous. Invité ou connecté, jetons, niveau et manche en cours sont enregistrés côté serveur. */
export function Blackjack({ onBack, onLogin, initialJoin, initialTab }: { onBack: () => void; onLogin: () => void; initialJoin?: string; initialTab?: Tab }) {
  const { t } = useI18n();
  const me = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  // À la table, l'écran est réservé au jeu : bandeaux et en-têtes se réduisent pour que tout tienne sans défiler.
  const [playing, setPlaying] = useState(false);
  // Le bouton Retour remonte d'une étape (table → salon → autres onglets) avant de quitter vers l'accueil.
  const stepBack = useRef<(() => boolean) | null>(null);
  const back = () => {
    if (!stepBack.current?.()) onBack();
  };
  return (
    <div className="min-h-[calc(100dvh-3rem)]">
      <header className={`mx-auto flex max-w-4xl items-center justify-between px-4 ${playing ? 'py-2' : 'py-4'}`}>
        <button type="button" onClick={back} className="rounded-lg px-2 py-1 text-sm text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
          {t('blackjack.retour')}</button>
        <p className="flex items-center gap-2 font-display text-xl tracking-wide text-ivory-50">
          <CoinIcon size={30} />
          {t('blackjack.blackjack')}</p>
        <span className="w-16" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-12">
        {!ready ? (
          <p className="py-10 text-center text-sm text-ivory-300/70">{t('blackjack.chargement')}</p>
        ) : (
          <>
            {!me && (
              <p className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-500/30 bg-gold-500/10 text-xs text-ivory-100 ${playing ? 'mb-2 px-3 py-1' : 'mb-4 px-4 py-2.5'}`} data-testid="bj-guest-note">
                <span>{playing ? t('blackjack.invite_jetons_et') : t('blackjack.vous_jouez_en')}</span>
                <button type="button" onClick={onLogin} className="font-semibold text-gold-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                  {t('blackjack.se_connecter')}</button>
              </p>
            )}
            <Game onPlaying={setPlaying} stepBack={stepBack} initialJoin={initialJoin} initialTab={initialTab} />
          </>
        )}
      </main>
    </div>
  );
}

function Game({ onPlaying, stepBack, initialJoin, initialTab }: { onPlaying?: (playing: boolean) => void; stepBack?: { current: (() => boolean) | null }; initialJoin?: string; initialTab?: Tab } = {}) {
  const { t } = useI18n();
  const account = useAccountClient()!;
  const { sound } = useSettings();
  const [prefs, setPrefs] = useState<BjPrefs>(loadPrefs);
  const [tab, setTab] = useState<Tab>(initialJoin ? 'plusieurs' : initialTab ?? 'jouer');
  const [overview, setOverview] = useState<BjOverview | null>(null);
  const [active, setActive] = useState<BjActive | null>(null);
  const [result, setResult] = useState<BjResult | null>(null);
  const [help, setHelp] = useState<HelpData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'lobby' | 'table'>('lobby');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((p: Partial<BjPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });
  }, []);

  const fail = (e: unknown) => setError(errorText(currentI18n(), e, t('blackjack.une_erreur_est')));

  const refresh = useCallback(async () => {
    try {
      const o = await account.blackjack();
      if (!mounted.current) return;
      setOverview(o);
      return o;
    } catch (e) {
      if (mounted.current) fail(e);
    }
  }, [account]);

  // Chargement initial ; une manche interrompue reprend là où elle s'était arrêtée.
  useEffect(() => {
    void refresh().then((o) => {
      if (o?.active && mounted.current) {
        setActive(o.active);
        setView('table');
      }
    });
  }, [refresh]);

  // Aide pédagogique : récupérée à chaque nouvelle situation de jeu, jamais en mode « libre ».
  const sig = active && active.round.phase === 'PLAYER' ? `${active.commitment}:${active.round.hands.map((h) => h.cards.join('')).join('|')}:${active.round.active}` : null;
  useEffect(() => {
    setHelp(null);
    if (!sig || prefs.pedagogy === 'libre') return;
    let cancelled = false;
    account
      .blackjackHelp()
      .then((h) => !cancelled && setHelp(h))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [account, sig, prefs.pedagogy]);

  const apply = (r: { active: BjActive; result: BjResult | null }) => {
    setActive(r.active);
    setResult(r.result);
    setView('table');
    if (r.result) void refresh();
  };

  const start = async (table: string, bet: number, rules?: TableRules) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await account.blackjackStart({ table, bet, ...(table === FREE_ID ? { rules: rules ?? prefs.rules } : {}) });
      if (mounted.current) apply(r);
    } catch (e) {
      if (mounted.current) fail(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const act = async (a: BjAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await account.blackjackAct(a);
      if (mounted.current) apply(r);
    } catch (e) {
      if (mounted.current) {
        fail(e);
        void refresh().then((o) => o?.active && setActive(o.active));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const leave = () => {
    setView('lobby');
    setActive((a) => (a && a.round.phase === 'DONE' ? null : a));
    setResult(null);
    setError(null);
    void refresh();
  };

  useEffect(() => {
    if (!stepBack) return;
    stepBack.current = () => {
      if (tab === 'jouer' && view === 'table' && active) {
        leave();
        return true;
      }
      if (tab !== 'jouer') {
        setTab('jouer');
        return true;
      }
      return false;
    };
    return () => {
      stepBack.current = null;
    };
  });

  const onSettled = useCallback(() => void refresh(), [refresh]);
  const profile = overview?.profile;
  const chips = profile?.chips ?? 0;
  const inProgress = active && active.round.phase === 'PLAYER';
  const playing = tab === 'jouer' && view === 'table' && !!active;
  useEffect(() => {
    onPlaying?.(playing);
    return () => onPlaying?.(false);
  }, [playing, onPlaying]);

  return (
    <div className={playing ? 'space-y-2' : 'space-y-4'}>
      {profile && playing && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ivory-100/10 bg-ink-900/60 px-3 py-1.5 text-sm text-ivory-200" data-testid="bj-compact">
          <span>
            {t('blackjack.niveau', { level: profile.level })} <span className="text-ivory-300/70">· {profile.xp ?? 0}  {t('blackjack.xp')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CoinIcon size={20} />
            <span className="font-display text-gold-300" data-testid="bj-chips">
              {formatChips(chips)}
            </span>
          </span>
        </p>
      )}
      {profile && !playing && (
        <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <LevelBar profile={profile} />
          <div className="flex items-center gap-2 rounded-2xl border border-gold-500/40 bg-gold-500/10 px-4 py-2.5">
            <CoinIcon size={34} />
            <div>
              <p className="text-xs text-gold-300">{t('blackjack.jetons_blackjack')}</p>
              <p className="font-display text-2xl text-ivory-50" data-testid="bj-chips">
                {formatChips(chips)}
              </p>
            </div>
          </div>
        </Panel>
      )}
      {profile?.refillAt && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          {t('blackjack.solde_bas_recharge', { toLocaleTimeString: new Date(profile.refillAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })}</p>
      )}

      <div role="tablist" aria-label={t('blackjack.sections_du_blackjack')} className="flex gap-1 overflow-x-auto rounded-2xl bg-ink-900/70 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`bj-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`bj-panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-[40px] flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${tab === t ? 'bg-gold-500/20 text-gold-200' : 'text-ivory-300 hover:bg-ivory-100/5'}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`bj-panel-${tab}`} aria-labelledby={`bj-tab-${tab}`}>
        {tab === 'jouer' &&
          (view === 'table' && active ? (
            <BjTable
              key={active.commitment}
              active={active}
              result={result}
              chips={chips}
              speed={prefs.speed}
              pedagogy={prefs.pedagogy}
              help={help}
              busy={busy}
              error={error}
              canReplay={chips >= active.bet && chips > 0}
              onAction={act}
              onReplay={() => void start(active.table, active.bet, active.rules)}
              onLeave={leave}
            />
          ) : (
            <Lobby
              prefs={prefs}
              patch={patch}
              overview={overview}
              busy={busy}
              error={error}
              inProgress={!!inProgress}
              onResume={() => setView('table')}
              onStart={(table, bet) => void start(table, bet)}
              sound={sound}
            />
          ))}
        {tab === 'plusieurs' && <MultiTables tables={overview?.tables ?? []} freeRules={prefs.rules} pedagogy={prefs.pedagogy} speed={prefs.speed} chips={chips} onSettled={onSettled} joinCode={initialJoin} />}
        {tab === 'progression' && (profile ? <div className="space-y-4"><StatsPanel profile={profile} /><ChallengesPanel challenges={overview!.challenges} achievements={overview!.achievements} /></div> : <p className="text-sm text-ivory-300/70">{t('blackjack.chargement')}</p>)}
        {tab === 'classement' && <LeaderboardPanel />}
        {tab === 'historique' && <HistoryPanel items={overview?.history ?? []} />}
      </div>

      <p className="text-center text-xs text-ivory-300/60">{t('blackjack.jetons_virtuels_sans')}</p>
    </div>
  );
}

function Lobby({ prefs, patch, overview, busy, error, inProgress, onResume, onStart, sound }: { prefs: BjPrefs; patch: (p: Partial<BjPrefs>) => void; overview: BjOverview | null; busy: boolean; error: string | null; inProgress: boolean; onResume: () => void; onStart: (table: string, bet: number) => void; sound: boolean }) {
  const { t } = useI18n();
  const level = overview?.profile.level ?? 1;
  const chips = overview?.profile.chips ?? 0;
  const tables: (TablePreset | { id: 'libre'; name: string; description: string; rules: TableRules; limits: { minBet: number; maxBet: number }; minLevel: number })[] = useMemo(
    () => [...(overview?.tables.filter((t) => t.id !== FREE_ID) ?? []), { id: FREE_ID, name: t('blackjack.table_libre'), description: t('blackjack.vous_fixez_vous'), rules: prefs.rules, limits: FREE_LIMITS, minLevel: 1 }],
    [overview, prefs.rules],
  );
  const table = tables.find((t) => t.id === prefs.table) ?? tables[0]!;
  const rules = table.id === FREE_ID ? prefs.rules : table.rules;
  const { minBet, maxBet } = table.limits;
  const cap = Math.min(maxBet, chips);
  const bet = Math.max(minBet, Math.min(prefs.bet, Math.max(cap, minBet)));
  const locked = level < table.minLevel;
  const canDeal = !!overview && !locked && !busy && chips >= minBet && bet <= chips;

  const setBet = (n: number) => patch({ bet: Math.max(minBet, Math.min(Math.max(cap, minBet), Math.round(n))) });
  const addChip = (v: number) => {
    if (sound) Sound.confirm();
    setBet(bet + v);
  };
  const setRule = <K extends keyof TableRules>(k: K, v: TableRules[K]) => patch({ rules: { ...prefs.rules, [k]: v } });

  return (
    <div className="space-y-4">
      {inProgress && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-gold-500/50 p-4">
          <div>
            <p className="font-display text-lg text-ivory-50">{t('blackjack.manche_en_cours')}</p>
            <p className="text-xs text-ivory-300/80">{t('blackjack.elle_a_ete')}</p>
          </div>
          <Button onClick={onResume}>{t('blackjack.reprendre_la_manche')}</Button>
        </Panel>
      )}

      <p className="max-w-2xl text-sm leading-relaxed text-ivory-100/90" data-testid="bj-intro">{t('blackjack.intro')}</p>

      <Panel className="p-4 sm:p-5">
        <Eyebrow>{t('blackjack.tables')}</Eyebrow>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={t('blackjack.tables_disponibles')}>
          {tables.map((tb) => {
            const isLocked = level < tb.minLevel;
            const selected = tb.id === table.id;
            return (
              <li key={tb.id}>
                <button
                  type="button"
                  onClick={() => !isLocked && patch({ table: tb.id })}
                  aria-pressed={selected}
                  aria-disabled={isLocked}
                  className={`h-full w-full rounded-2xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${selected ? 'border-gold-400 bg-gold-500/15' : 'border-ivory-100/12 bg-ink-900/60 hover:border-ivory-100/30'} ${isLocked ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-lg text-ivory-50">{tb.name}</span>
                    {isLocked ? <Badge tone="amber">{t('blackjack.niveau2', { minLevel: tb.minLevel })}</Badge> : <span className="text-xs text-gold-300">{tb.id === FREE_ID ? '1' : tb.limits.minBet} – {formatChips(tb.limits.maxBet)}</span>}
                  </span>
                  <span className="mt-1 block text-xs text-ivory-200/80">{tb.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-ivory-300/80" data-testid="rules-line">
          {rulesLine(rules)}
        </p>

        {table.id === FREE_ID && (
          <fieldset className="mt-4 grid gap-4 rounded-2xl border border-ivory-100/10 p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-gold-300">{t('blackjack.regles_de_la')}</legend>
            <Field label={t('blackjack.nombre_de_jeux')}>
              <Segmented<number> value={prefs.rules.decks} options={[1, 2, 4, 6, 8]} onChange={(v) => setRule('decks', v)} label={t('blackjack.nombre_de_jeux')} />
            </Field>
            <Field label={t('blackjack.croupier_sur_17')}>
              <Segmented<string> value={prefs.rules.dealerHitsSoft17 ? 'tire' : 'reste'} options={['reste', 'tire']} onChange={(v) => setRule('dealerHitsSoft17', v === 'tire')} label={t('blackjack.croupier_sur_17')} format={(v) => (v === 'tire' ? t('blackjack.tire') : t('blackjack.reste'))} />
            </Field>
            <Field label={t('blackjack.blackjack_paye')}>
              <Segmented<'3:2' | '6:5'> value={prefs.rules.blackjackPays} options={['3:2', '6:5']} onChange={(v) => setRule('blackjackPays', v)} label={t('blackjack.blackjack_paye')} format={(v) => (v === '3:2' ? '3 contre 2' : '6 contre 5')} />
            </Field>
            <Field label={t('blackjack.doublement')}>
              <Segmented<'any' | '9-11' | '10-11'> value={prefs.rules.doubleOn} options={['any', '9-11', '10-11']} onChange={(v) => setRule('doubleOn', v)} label={t('blackjack.doublement')} format={(v) => (v === 'any' ? t('blackjack.tout') : v.replace('-', ' à '))} />
            </Field>
            <Field label={t('blackjack.mains_maximum_apres')}>
              <Segmented<number> value={prefs.rules.maxHands} options={[2, 3, 4]} onChange={(v) => setRule('maxHands', v)} label={t('blackjack.mains_maximum')} />
            </Field>
            <div className="grid grid-cols-1 gap-2 text-sm text-ivory-100">
              {(
                [
                  ['doubleAfterSplit', t('blackjack.doublement_apres_separation')],
                  ['resplitAces', t('blackjack.separer_a_nouveau')],
                  ['surrender', t('blackjack.abandon_autorise')],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex min-h-[32px] cursor-pointer items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-[#c9a25a]" checked={prefs.rules[k]} onChange={(e) => setRule(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </Panel>

      <Panel className="p-4 sm:p-5">
        <Eyebrow>{t('blackjack.mise')}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('blackjack.ajouter_des_jetons')}>
            {CHIP_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => addChip(v)}
                disabled={bet >= cap}
                aria-label={t('blackjack.ajouter_jetons', { v })}
                className="grid h-14 w-14 place-items-center rounded-full border-4 border-dashed border-white/70 font-display text-sm text-white shadow-lg transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 disabled:opacity-40 motion-reduce:transform-none"
                style={{ background: CHIP_COLORS[v] }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="min-w-[8rem]">
            <ChipStack amount={bet} size={34} />
            <div className="mt-1 flex gap-1 text-xs">
              <button type="button" className="rounded px-1.5 py-0.5 text-gold-300 underline-offset-2 hover:underline" onClick={() => setBet(minBet)}>
                {t('blackjack.min')}</button>
              <button type="button" className="rounded px-1.5 py-0.5 text-gold-300 underline-offset-2 hover:underline" onClick={() => setBet(cap)}>
                {t('blackjack.max')}</button>
            </div>
          </div>
          <div className="w-28">
            <label htmlFor="bj-bet" className="sr-only">
              {t('blackjack.montant_de_la')}</label>
            <input id="bj-bet" type="number" inputMode="numeric" min={minBet} max={Math.max(cap, minBet)} value={bet} onChange={(e) => setBet(Number(e.target.value) || minBet)} className={inputClass} />
          </div>
        </div>
        {locked && <p className="mt-2 text-sm text-amber-200">{t('blackjack.cette_table_s', { minLevel: table.minLevel })}</p>}
        {!locked && overview && chips < minBet && <p className="mt-2 text-sm text-amber-200">{t('blackjack.solde_insuffisant_pour')}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('blackjack.niveau_pedagogique')} hint={PEDAGOGIES.find((p) => p.id === prefs.pedagogy)?.text}>
            <Segmented<Pedagogy> value={prefs.pedagogy} options={PEDAGOGIES.map((p) => p.id)} onChange={(v) => patch({ pedagogy: v })} label={t('blackjack.niveau_pedagogique')} format={(v) => PEDAGOGIES.find((p) => p.id === v)!.label} />
          </Field>
          <Field label={t('blackjack.vitesse_des_animations')}>
            <Segmented<Speed> value={prefs.speed} options={SPEEDS} onChange={(v) => patch({ speed: v })} label={t('blackjack.vitesse_des_animations')} format={(v) => v[0]!.toUpperCase() + v.slice(1)} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-ruby-500/50 bg-ruby-500/10 px-4 py-2 text-sm text-ruby-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onStart(table.id, bet)} disabled={!canDeal} className="min-w-[10rem]">
            {t('blackjack.distribuer', { formatChips: formatChips(bet) })}</Button>
          <Button
            variant="secondary"
            disabled={busy || !overview || chips < 5}
            onClick={() => {
              const q = Math.max(5, Math.min(100, prefs.bet, chips));
              patch({ table: 'decouverte', bet: q });
              onStart('decouverte', q);
            }}
          >
            {t('blackjack.partie_rapide')}</Button>
        </div>
      </Panel>
    </div>
  );
}
