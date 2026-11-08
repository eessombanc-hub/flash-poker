import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Eyebrow, Field, Panel, Segmented, inputClass } from '../components/ui';
import { CoinIcon } from '../components/Icons3D';
import { BjTable, ChipStack, type HelpData } from '../components/blackjack/BjTable';
import { ChallengesPanel, HistoryPanel, LeaderboardPanel, LevelBar, LoginPrompt, StatsPanel } from '../components/blackjack/Panels';
import { ApiError } from '../lib/api';
import { useAccount, useAccountClient } from '../lib/context';
import { formatChips } from '../lib/format';
import { CHIP_COLORS, CHIP_VALUES, DOUBLE_LABEL, PEDAGOGIES, SPEEDS, loadPrefs, savePrefs, type BjPrefs, type Pedagogy, type Speed } from '../lib/blackjack';
import { useSettings } from '../lib/settings';
import { Sound } from '../lib/sound';
import type { BjAction, BjActive, BjOverview, BjResult, TablePreset, TableRules } from '../lib/types';

type Tab = 'jouer' | 'progression' | 'classement' | 'historique';
const TABS: readonly Tab[] = ['jouer', 'progression', 'classement', 'historique'];
const TAB_LABEL: Record<Tab, string> = { jouer: 'Jouer', progression: 'Progression', classement: 'Classement', historique: 'Historique' };
const FREE_ID = 'libre';
const FREE_LIMITS = { minBet: 1, maxBet: 1000 };

const rulesLine = (r: TableRules): string =>
  `${r.decks} jeu${r.decks > 1 ? 'x' : ''} · croupier ${r.dealerHitsSoft17 ? 'tire' : 'reste'} sur 17 soft · Blackjack ${r.blackjackPays === '3:2' ? '3 contre 2' : '6 contre 5'} · doublement ${DOUBLE_LABEL[r.doubleOn].toLowerCase()} · ${r.surrender ? 'abandon' : 'sans abandon'}`;

/** Point d'entrée : réservé aux comptes (jetons, niveau et manche en cours sont enregistrés côté serveur). */
export function Blackjack({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const me = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <button type="button" onClick={onBack} className="rounded-lg px-2 py-1 text-sm text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
          ← Accueil
        </button>
        <p className="flex items-center gap-2 font-display text-xl tracking-wide text-ivory-50">
          <CoinIcon size={30} />
          Blackjack
        </p>
        <span className="w-16" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-12">
        {!ready ? <p className="py-10 text-center text-sm text-ivory-300/70">Chargement…</p> : !me ? <LoginPrompt onLogin={onLogin} onBack={onBack} /> : <Game />}
      </main>
    </div>
  );
}

function Game() {
  const account = useAccountClient()!;
  const { sound } = useSettings();
  const [prefs, setPrefs] = useState<BjPrefs>(loadPrefs);
  const [tab, setTab] = useState<Tab>('jouer');
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

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Une erreur est survenue. Réessayez.');

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

  const profile = overview?.profile;
  const chips = profile?.chips ?? 0;
  const inProgress = active && active.round.phase === 'PLAYER';

  return (
    <div className="space-y-4">
      {profile && (
        <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <LevelBar profile={profile} />
          <div className="flex items-center gap-2 rounded-2xl border border-gold-500/40 bg-gold-500/10 px-4 py-2.5">
            <CoinIcon size={34} />
            <div>
              <p className="text-xs text-gold-300">Jetons Blackjack</p>
              <p className="font-display text-2xl text-ivory-50" data-testid="bj-chips">
                {formatChips(chips)}
              </p>
            </div>
          </div>
        </Panel>
      )}
      {profile?.refillAt && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          Solde bas : recharge gratuite à {new Date(profile.refillAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}

      <div role="tablist" aria-label="Sections du Blackjack" className="flex gap-1 overflow-x-auto rounded-2xl bg-ink-900/70 p-1">
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
        {tab === 'progression' && (profile ? <div className="space-y-4"><StatsPanel profile={profile} /><ChallengesPanel challenges={overview!.challenges} achievements={overview!.achievements} /></div> : <p className="text-sm text-ivory-300/70">Chargement…</p>)}
        {tab === 'classement' && <LeaderboardPanel />}
        {tab === 'historique' && <HistoryPanel items={overview?.history ?? []} />}
      </div>

      <p className="text-center text-xs text-ivory-300/60">Jetons virtuels sans valeur monétaire : aucun achat, aucun gain en argent. Pas d’assurance au croupier dans cette version.</p>
    </div>
  );
}

function Lobby({ prefs, patch, overview, busy, error, inProgress, onResume, onStart, sound }: { prefs: BjPrefs; patch: (p: Partial<BjPrefs>) => void; overview: BjOverview | null; busy: boolean; error: string | null; inProgress: boolean; onResume: () => void; onStart: (table: string, bet: number) => void; sound: boolean }) {
  const level = overview?.profile.level ?? 1;
  const chips = overview?.profile.chips ?? 0;
  const tables: (TablePreset | { id: 'libre'; name: string; description: string; rules: TableRules; limits: { minBet: number; maxBet: number }; minLevel: number })[] = useMemo(
    () => [...(overview?.tables.filter((t) => t.id !== FREE_ID) ?? []), { id: FREE_ID, name: 'Table libre', description: 'Vous fixez vous-même les règles : nombre de jeux, croupier, Blackjack, doublement, abandon.', rules: prefs.rules, limits: FREE_LIMITS, minLevel: 1 }],
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
            <p className="font-display text-lg text-ivory-50">Manche en cours</p>
            <p className="text-xs text-ivory-300/80">Elle a été interrompue : reprenez-la exactement où vous l’aviez laissée.</p>
          </div>
          <Button onClick={onResume}>Reprendre la manche</Button>
        </Panel>
      )}

      <Panel className="p-4 sm:p-5">
        <Eyebrow>Tables</Eyebrow>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Tables disponibles">
          {tables.map((t) => {
            const isLocked = level < t.minLevel;
            const selected = t.id === table.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => !isLocked && patch({ table: t.id })}
                  aria-pressed={selected}
                  aria-disabled={isLocked}
                  className={`h-full w-full rounded-2xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${selected ? 'border-gold-400 bg-gold-500/15' : 'border-ivory-100/12 bg-ink-900/60 hover:border-ivory-100/30'} ${isLocked ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-lg text-ivory-50">{t.name}</span>
                    {isLocked ? <Badge tone="amber">Niveau {t.minLevel}</Badge> : <span className="text-xs text-gold-300">{t.id === FREE_ID ? '1' : t.limits.minBet} – {formatChips(t.limits.maxBet)}</span>}
                  </span>
                  <span className="mt-1 block text-xs text-ivory-200/80">{t.description}</span>
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
            <legend className="px-1 text-sm font-semibold text-gold-300">Règles de la table libre</legend>
            <Field label="Nombre de jeux">
              <Segmented<number> value={prefs.rules.decks} options={[1, 2, 4, 6, 8]} onChange={(v) => setRule('decks', v)} label="Nombre de jeux" />
            </Field>
            <Field label="Croupier sur 17 soft">
              <Segmented<string> value={prefs.rules.dealerHitsSoft17 ? 'tire' : 'reste'} options={['reste', 'tire']} onChange={(v) => setRule('dealerHitsSoft17', v === 'tire')} label="Croupier sur 17 soft" format={(v) => (v === 'tire' ? 'Tire' : 'Reste')} />
            </Field>
            <Field label="Blackjack payé">
              <Segmented<'3:2' | '6:5'> value={prefs.rules.blackjackPays} options={['3:2', '6:5']} onChange={(v) => setRule('blackjackPays', v)} label="Blackjack payé" format={(v) => (v === '3:2' ? '3 contre 2' : '6 contre 5')} />
            </Field>
            <Field label="Doublement">
              <Segmented<'any' | '9-11' | '10-11'> value={prefs.rules.doubleOn} options={['any', '9-11', '10-11']} onChange={(v) => setRule('doubleOn', v)} label="Doublement" format={(v) => (v === 'any' ? 'Tout' : v.replace('-', ' à '))} />
            </Field>
            <Field label="Mains maximum après séparation">
              <Segmented<number> value={prefs.rules.maxHands} options={[2, 3, 4]} onChange={(v) => setRule('maxHands', v)} label="Mains maximum" />
            </Field>
            <div className="grid grid-cols-1 gap-2 text-sm text-ivory-100">
              {(
                [
                  ['doubleAfterSplit', 'Doublement après séparation'],
                  ['resplitAces', 'Séparer à nouveau les As'],
                  ['surrender', 'Abandon autorisé'],
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
        <Eyebrow>Mise</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ajouter des jetons">
            {CHIP_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => addChip(v)}
                disabled={bet >= cap}
                aria-label={`Ajouter ${v} jetons`}
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
                Min
              </button>
              <button type="button" className="rounded px-1.5 py-0.5 text-gold-300 underline-offset-2 hover:underline" onClick={() => setBet(cap)}>
                Max
              </button>
            </div>
          </div>
          <div className="w-28">
            <label htmlFor="bj-bet" className="sr-only">
              Montant de la mise
            </label>
            <input id="bj-bet" type="number" inputMode="numeric" min={minBet} max={Math.max(cap, minBet)} value={bet} onChange={(e) => setBet(Number(e.target.value) || minBet)} className={inputClass} />
          </div>
        </div>
        {locked && <p className="mt-2 text-sm text-amber-200">Cette table s’ouvre au niveau {table.minLevel}. Jouez, relevez des défis et montez en niveau.</p>}
        {!locked && overview && chips < minBet && <p className="mt-2 text-sm text-amber-200">Solde insuffisant pour cette table. Une recharge gratuite est accordée quand le solde est trop bas.</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Niveau pédagogique" hint={PEDAGOGIES.find((p) => p.id === prefs.pedagogy)?.text}>
            <Segmented<Pedagogy> value={prefs.pedagogy} options={PEDAGOGIES.map((p) => p.id)} onChange={(v) => patch({ pedagogy: v })} label="Niveau pédagogique" format={(v) => PEDAGOGIES.find((p) => p.id === v)!.label} />
          </Field>
          <Field label="Vitesse des animations">
            <Segmented<Speed> value={prefs.speed} options={SPEEDS} onChange={(v) => patch({ speed: v })} label="Vitesse des animations" format={(v) => v[0]!.toUpperCase() + v.slice(1)} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-ruby-500/50 bg-ruby-500/10 px-4 py-2 text-sm text-ruby-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onStart(table.id, bet)} disabled={!canDeal} className="min-w-[10rem]">
            Distribuer · {formatChips(bet)}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !overview || chips < 5}
            onClick={() => {
              const q = Math.max(5, Math.min(100, prefs.bet, chips));
              patch({ table: 'decouverte', bet: q });
              onStart('decouverte', q);
            }}
          >
            Partie rapide
          </Button>
        </div>
      </Panel>
    </div>
  );
}
