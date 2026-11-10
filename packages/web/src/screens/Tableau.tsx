import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingCard } from '../components/Card';
import { CoinRain, SpinTrophy } from '../components/Scene3D';
import { LeagueBadge, ProgressPanel } from '../components/tableau/Progress';
import { ColumnStack, MiniHand, ResultsTable, VerdictRow } from '../components/tableau/Board';
import { Avatar, Badge, Button, CountdownRing, Eyebrow, Modal, Panel, Segmented, inputClass } from '../components/ui';
import type { AccountClient } from '../lib/account';
import { useAccount, useAccountClient } from '../lib/context';
import { useSettings } from '../lib/settings';
import { useSound } from '../lib/sound';
import { FitToScreen } from '../components/FitToScreen';
import { VictoryTitle, WinnerSpotlight } from '../components/Winner';
import { announce, clockSkew, COMBOS, inviteUrl, LEVELS, outcomeKey, ROMAN, secondsLeft, VARIANT_OPTIONS } from '../lib/tableau';
import { adviceText, columnLabel, errorText, handLabel } from '../lib/tbText';
import { useI18n, type Key } from '../i18n';
import type { AiLevel, ColumnHand, TableauVariant, TbGameDto, TbHistoryEntry, TbQueueDto } from '../lib/types';

const NICK_KEY = 'poker.tb.nick.v1';
const CONFIRM_KEY = 'poker.tb.confirm.v1';

const readStore = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const writeStore = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : simple confort */
  }
};
/** Nom de l'adversaire contrôlé par l'ordinateur, selon son niveau, dans la langue choisie. */
const cpuName = (t: (k: Key) => string, level: AiLevel | null): string => t(`tb.cpu.${level ?? 'intermediate'}` as Key);

/** Point d'entrée : menu des modes, puis la partie. Ouvert à tous (invité ou connecté). */
export function Tableau({ onBack, onLogin, initialCode, initialVariant = 'classic' }: { onBack: () => void; onLogin: () => void; initialCode?: string; initialVariant?: TableauVariant }) {
  const { t } = useI18n();
  const client = useAccountClient();
  const me = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  const [game, setGame] = useState<TbGameDto | null>(null);
  return (
    <div className="min-h-[calc(100dvh-3rem)]">
      <header className={`mx-auto flex items-center justify-between px-4 py-4 ${game ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <button type="button" onClick={game ? () => setGame(null) : onBack} className="rounded-lg px-2 py-1 text-sm text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
          {game ? t('tb.back.menu') : t('common.backHome')}
        </button>
        <p className="font-display text-xl tracking-wide text-ivory-50">{t('tb.title')}</p>
        <span className="w-16" aria-hidden="true" />
      </header>
      <main className={`mx-auto px-4 pb-12 ${game ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {!client || !ready ? (
          <p className="py-10 text-center text-sm text-ivory-300/70">{client ? t('common.loading') : t('tb.noServer')}</p>
        ) : game ? (
          <GameScreen key={game.code} client={client} initial={game} onExit={() => setGame(null)} />
        ) : (
          <>
            {!me && (
              <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-2.5 text-xs text-ivory-100">
                <span>{t('tb.guestNote')}</span>
                <button type="button" onClick={onLogin} className="font-semibold text-gold-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                  {t('common.login')}
                </button>
              </p>
            )}
            <Menu client={client} guest={!me} initialCode={initialCode} initialVariant={initialVariant} onGame={setGame} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Menu

function Menu({ client, guest, initialCode, initialVariant, onGame }: { client: AccountClient; guest: boolean; initialCode?: string; initialVariant: TableauVariant; onGame: (g: TbGameDto) => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const [level, setLevel] = useState<AiLevel>('intermediate');
  const [variant, setVariant] = useState<TableauVariant>(initialVariant);
  const [nick, setNick] = useState(() => readStore(NICK_KEY));
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<{ code: string; mode: string } | null>(null);
  const [history, setHistory] = useState<TbHistoryEntry[]>([]);
  const [help, setHelp] = useState(false);
  const [queue, setQueue] = useState<TbQueueDto | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const queueSince = useRef(0);

  // Duel classé : reprise d'une attente en cours à l'ouverture du menu.
  useEffect(() => {
    if (guest) return;
    let off = false;
    client.tbQueueStatus().then((q) => {
      if (off || q.status !== 'waiting') return;
      queueSince.current = Date.now() - q.waitedMs;
      setQueue(q);
    }).catch(() => undefined);
    return () => {
      off = true;
    };
  }, [client, guest]);

  // Tant qu'on attend : interrogation toutes les 2 s (la fenêtre d'appariement s'élargit à chaque appel) et compteur.
  const waiting = queue?.status === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    let off = false;
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const poll = setInterval(() => {
      client.tbQueueStatus().then(async (q) => {
        if (off) return;
        if (q.status === 'matched' && q.code) {
          off = true;
          setQueue(null);
          try {
            onGame(await client.tbGet(q.code));
          } catch (e) {
            setError(errorText(i18n, e));
          }
        } else if (q.status !== 'waiting') {
          setQueue(q);
        }
      }).catch(() => undefined);
    }, 2000);
    return () => {
      off = true;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [waiting, client, onGame, i18n]);

  const joinQueue = async () => {
    setBusy(true);
    setError('');
    try {
      const q = await client.tbQueueJoin(variant);
      if (q.status === 'matched' && q.code) {
        onGame(await client.tbGet(q.code));
        return;
      }
      queueSince.current = Date.now();
      setClock(Date.now());
      setQueue(q);
    } catch (e) {
      setError(errorText(i18n, e));
    } finally {
      setBusy(false);
    }
  };
  const cancelQueue = () => {
    setQueue(null);
    client.tbQueueCancel().catch(() => undefined);
  };

  useEffect(() => {
    let off = false;
    client.tbActive().then((a) => !off && setActive(a)).catch(() => undefined);
    client.tbHistory().then((h) => !off && setHistory(h)).catch(() => undefined);
    return () => {
      off = true;
    };
  }, [client]);

  const run = async (f: () => Promise<TbGameDto>) => {
    setBusy(true);
    setError('');
    try {
      if (guest && nick.trim()) writeStore(NICK_KEY, nick.trim());
      onGame(await f());
    } catch (e) {
      setError(errorText(i18n, e));
    } finally {
      setBusy(false);
    }
  };
  const nickname = guest && nick.trim() ? nick.trim() : undefined;
  const wins = history.filter((h) => h.outcome === 'win').length;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-gold-500/40 bg-gradient-to-br from-felt-800 via-felt-900 to-ink-900 p-5">
        <Eyebrow>{t('tb.eyebrow')}</Eyebrow>
        <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">{t('tb.title')}</h1>
        <p className="mt-2 max-w-xl text-sm text-ivory-200/90">
          {t('tb.intro')}
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => setHelp(true)}>
          {t('tb.rules.btn')}
        </Button>
      </section>

      <Panel className="p-4">
        <p className="mb-2 text-sm font-medium text-ivory-100">{t('tb.variant.heading')}</p>
        <Segmented value={variant} options={VARIANT_OPTIONS.map((v) => v.id)} format={(v) => t(`tb.variant.${v}` as Key)} onChange={setVariant} label={t('tb.variant.label')} />
        <p className="mt-2 text-xs text-ivory-300/85">{t(`tb.variant.${variant}.text` as Key)}</p>
      </Panel>

      {active && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-gold-400/60 p-4">
          <p className="text-sm text-ivory-100">
            {t(`tb.resume.${active.mode === 'ranked' || active.mode === 'duel' || active.mode === 'training' ? active.mode : 'friendly'}` as Key, { code: active.code })}
          </p>
          <Button disabled={busy} onClick={() => void run(() => client.tbGet(active.code))}>
            {t('tb.resume.btn')}
          </Button>
        </Panel>
      )}

      {guest && (
        <div className="max-w-xs">
          <label htmlFor="tb-nick" className="mb-1 block text-sm font-medium text-ivory-100">
            {t('tb.nick')}
          </label>
          <input id="tb-nick" className={inputClass} value={nick} maxLength={20} placeholder={t('tb.nick.ph')} onChange={(e) => setNick(e.target.value)} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-ruby-500/50 bg-ruby-950/60 px-4 py-2.5 text-sm text-ruby-100">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-display text-xl text-ivory-50">{t('tb.vs.cpu')}</h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('tb.vs.cpu.text')}</p>
          <div className="mt-3">
            <Segmented value={level} options={LEVELS.map((l) => l.id)} format={(id) => t(`tb.level.${id}` as Key)} onChange={setLevel} label={t('tb.level.aria')} />
          </div>
          <p className="mt-2 min-h-[2.5rem] text-xs text-ivory-300/80">{t(`tb.level.${level}.text` as Key)}</p>
          <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(() => client.tbCreate({ mode: 'training', level, variant, nickname }))}>
            {t('tb.start.cpu')}
          </Button>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-xl text-ivory-50">{t('tb.vs.human')}</h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('tb.vs.human.text')}</p>
          <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={() => void run(() => client.tbCreate({ mode: 'friendly', variant, nickname }))}>
            {t('tb.create.friendly')}
          </Button>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void run(() => client.tbJoin(code.trim().toUpperCase(), nickname));
            }}
          >
            <label htmlFor="tb-code" className="sr-only">
              {t('tb.code.label')}
            </label>
            <input id="tb-code" className={inputClass} value={code} placeholder="TB-XXXX" maxLength={8} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Button type="submit" disabled={busy || !code.trim()}>
              {t('tb.join')}
            </Button>
          </form>
        </Panel>

        <Panel className="p-5" data-testid="tb-ranked">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl text-ivory-50">
            {t('tb.ranked')} <Badge tone="neutral">{t(`tb.variant.${variant}` as Key)}</Badge>
          </h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('tb.ranked.text')}</p>
          {guest ? (
            <p className="mt-3 text-sm text-gold-200">{t('tb.ranked.guest')}</p>
          ) : (
            <>
              <div className="mt-3">
                <Segmented value={level} options={LEVELS.map((l) => l.id)} format={(id) => t(`tb.level.${id}` as Key)} onChange={setLevel} label={t('tb.level.aria')} />
              </div>
              <p className="mt-2 text-xs text-ivory-300/80">{t('tb.ranked.rules')}</p>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(() => client.tbCreate({ mode: 'ranked', level, variant }))}>
                {t('tb.ranked.start')}
              </Button>
            </>
          )}
        </Panel>
        <Panel className="p-5" data-testid="tb-duel">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl text-ivory-50">
            {t('tb.duel')} <Badge tone="neutral">{t(`tb.variant.${variant}` as Key)}</Badge>
          </h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('tb.duel.text')}</p>
          {guest ? (
            <p className="mt-3 text-sm text-gold-200">{t('tb.ranked.guest')}</p>
          ) : waiting ? (
            <div className="mt-3 space-y-2" role="status" aria-live="polite">
              <p className="text-sm text-gold-200" data-testid="tb-queue-wait">
                {t('tb.duel.waiting', { s: Math.max(0, Math.floor((clock - queueSince.current) / 1000)) })}
              </p>
              <p className="text-xs text-ivory-300/80">{t('tb.duel.range')}</p>
              <Button variant="secondary" className="w-full" onClick={cancelQueue}>
                {t('tb.duel.cancel')}
              </Button>
            </div>
          ) : (
            <>
              {queue?.status === 'expired' && <p className="mt-3 text-sm text-ivory-100" role="status">{t('tb.duel.expired')}</p>}
              <p className="mt-2 text-xs text-ivory-300/80">{t('tb.duel.rules')}</p>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void joinQueue()}>
                {t('tb.duel.start')}
              </Button>
            </>
          )}
        </Panel>
        <Panel className="border-dashed p-5 opacity-80">
          <h2 className="font-display text-xl text-ivory-50">
            {t('tb.tournaments')} <Badge tone="amber">{t('tb.soon')}</Badge>
          </h2>
          <p className="mt-1 text-sm text-ivory-200/85">{t('tb.tournaments.text')}</p>
        </Panel>
      </div>

      {!guest && <ProgressPanel client={client} variant={variant} refreshKey={history.length} />}

      {history.length > 0 && (
        <Panel className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl text-ivory-50">{t('tb.history')}</h2>
            <p className="text-xs text-ivory-300/80">
              {tp('tb.winsOf', wins, { w: wins, n: history.length })}
            </p>
          </div>
          <ul className="mt-2 divide-y divide-ivory-100/10">
            {history.slice(0, 8).map((h) => (
              <li key={h.code} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate text-ivory-100">
                  {t(`tb.mode.${h.mode}` as Key)}{h.variant === 'hand5' ? t('tb.hist.hand5') : ''}{h.straightFlush ? t('tb.hist.sf') : ''} · {h.opponentLevel ? cpuName(t, h.opponentLevel) : h.opponent}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-ivory-300">
                    {h.score[0]}–{h.score[1]}
                  </span>
                  <Badge tone={h.outcome === 'win' ? 'green' : h.outcome === 'loss' ? 'red' : 'amber'}>{t(outcomeKey(h.outcome))}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t('tb.help.title')} onClose={onClose} wide>
      <h2 className="font-display text-2xl text-ivory-50">{t('tb.help.title')}</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ivory-100">
        {(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'] as const).map((r) => (
          <li key={r}>{t(`tb.help.${r}` as Key)}</li>
        ))}
      </ul>
      <h3 className="mt-4 font-display text-lg text-ivory-50">{t('tb.help.combos')}</h3>
      <ol className="mt-2 space-y-2">
        {COMBOS.map((c, i) => (
          <li key={c.example} className="flex items-center gap-3 rounded-xl bg-ink-900/60 p-2">
            <span className="w-5 shrink-0 text-center text-xs text-ivory-300/70">{i + 1}</span>
            <span className="flex shrink-0 gap-0.5" aria-hidden="true">
              {c.example.split(' ').map((k) => (
                <PlayingCard key={k} code={k} size="xs" />
              ))}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-gold-300">{t(`tb.combo.${i}` as Key)}</span>
              <span className="block text-xs text-ivory-200/85">{t(`tb.combo.${i}.text` as Key)}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button className="mt-4 w-full" onClick={onClose}>
        {t('common.close')}
      </Button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Partie

function GameScreen({ client, initial, onExit }: { client: AccountClient; initial: TbGameDto; onExit: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const { fourColor, cardBack, sound } = useSettings();
  const snd = useSound(sound);
  const [dto, setDto] = useState(initial);
  const skew = useRef(clockSkew(initial));
  const latest = useRef(initial);
  const [left, setLeft] = useState(() => secondsLeft(initial, skew.current));
  const [pending, setPending] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advice, setAdvice] = useState<{ col: number; card: string; kind: 'improve' | 'empty' | 'dump'; after: ColumnHand | null; afterCodes: string[]; fromHand: boolean } | null>(null);
  const [confirm, setConfirm] = useState(() => (readStore(CONFIRM_KEY) ? readStore(CONFIRM_KEY) === '1' : typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches));
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((d: TbGameDto) => {
    if (d.code !== latest.current.code || d.version < latest.current.version) return;
    latest.current = d;
    skew.current = clockSkew(d);
    setDto(d);
  }, []);

  const view = dto.view;
  const you = dto.you;
  const opp = (1 - you) as 0 | 1;
  const myTurn = dto.status === 'playing' && view?.turn === you && !dto.paused;
  const hand5 = view?.variant === 'hand5';
  // Carte à jouer : celle que vous avez touchée, sinon la piochée, sinon la première de la main.
  const options = view ? [...(view.yourCard ? [view.yourCard] : []), ...view.hand] : [];
  const card = picked && options.includes(picked) ? picked : (options[0] ?? null);

  // Sondage : serré quand on attend l'adversaire, plus lent pendant notre tour.
  useEffect(() => {
    if (dto.status === 'finished') return;
    let off = false;
    const poll = () =>
      client
        .tbGet(dto.code)
        .then((d) => !off && apply(d))
        .catch((e) => !off && setError(errorText(i18n, e)));
    const id = setInterval(poll, myTurn ? 2500 : 1000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [client, dto.code, dto.status, myTurn, apply]);

  // Compte à rebours local, recalé sur l'horloge du serveur.
  useEffect(() => {
    setLeft(secondsLeft(dto, skew.current));
    if (dto.deadline === null) return;
    const id = setInterval(() => setLeft(secondsLeft(latest.current, skew.current)), 250);
    return () => clearInterval(id);
  }, [dto]);

  // Sons et réinitialisations à chaque évolution de la partie.
  const seenPly = useRef(view?.ply ?? 0);
  const wasMyTurn = useRef(myTurn);
  const wasStatus = useRef(dto.status);
  useEffect(() => {
    if (view && view.ply !== seenPly.current) {
      if (dto.lastMove && dto.lastMove.seat !== you) snd.play('place');
      seenPly.current = view.ply;
      setPending(null);
      setPicked(null);
      setAdvice(null);
    }
    if (myTurn && !wasMyTurn.current) {
      snd.play('yourTurn');
      snd.buzz(40);
      window.setTimeout(() => snd.play('deal'), 420); // la carte piochée glisse vers vous
    }
    wasMyTurn.current = myTurn;
    if (dto.status === 'finished' && wasStatus.current !== 'finished') snd.play(dto.winner === you ? 'victory' : 'error');
    wasStatus.current = dto.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto]);

  const place = async (col: number) => {
    if (!myTurn || busy) return;
    if (confirm && pending !== col) {
      setPending(col);
      snd.play('select');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const d = await client.tbPlace(dto.code, col, hand5 ? (card ?? undefined) : undefined);
      snd.play('place');
      apply(d);
      setPending(null);
      setPicked(null);
      setAdvice(null);
    } catch (e) {
      setError(errorText(i18n, e));
      snd.play('error');
      client.tbGet(dto.code).then(apply).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const toggleConfirm = (v: boolean) => {
    setConfirm(v);
    setPending(null);
    writeStore(CONFIRM_KEY, v ? '1' : '0');
  };

  const leave = async () => {
    try {
      await client.tbLeave(dto.code);
    } catch {
      /* déjà terminée ou supprimée */
    }
    onExit();
  };

  // ----- Salle d'attente (partie amicale) -----
  if (dto.status === 'waiting' || !view) {
    const url = inviteUrl(dto.code);
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <Eyebrow>{t('tb.wait.eyebrow', { variant: t(`tb.variant.${dto.variant}` as Key) })}</Eyebrow>
        <h1 className="mt-1 font-display text-2xl text-ivory-50">{t('tb.wait.title')}</h1>
        <p className="mt-3 text-sm text-ivory-200/90">{t('tb.wait.send')}</p>
        <p className="my-3 font-display text-4xl tracking-[0.2em] text-gold-300" data-testid="tb-code">
          {dto.code}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined);
            }}
          >
            {copied ? t('tb.wait.copied') : t('tb.wait.copy')}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button variant="secondary" onClick={() => void navigator.share({ title: t('tb.title'), text: t('tb.wait.shareText', { code: dto.code }), url }).catch(() => undefined)}>
              {t('tb.wait.share')}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ivory-300/80">{t('tb.wait.note')}</p>
        <Button variant="ghost" className="mt-3" onClick={() => void leave()}>
          {t('tb.wait.cancel')}
        </Button>
        {error && <p role="alert" className="mt-2 text-sm text-ruby-300">{error}</p>}
      </Panel>
    );
  }

  const finished = dto.status === 'finished';
  const look = { fourColor, back: cardBack };
  const opponent = dto.players[opp];
  const mine = dto.players[you];
  const score = view.provisional.score;
  const myScore = you === 0 ? score[0] : score[1];
  const theirScore = you === 0 ? score[1] : score[0];
  const lastMove = dto.lastMove;
  const outcome = dto.winner === null ? 'draw' : dto.winner === you ? 'win' : 'loss';
  const oppName = opponent?.kind === 'cpu' ? cpuName(t, opponent.level) : (opponent?.nickname ?? t('tb.opponent'));

  return (
    <FitToScreen enabled={!finished}>
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-x-5">
      <p className="sr-only" role="status" aria-live="polite">
        {announce(dto, t)}
      </p>

      {/* Adversaire */}
      <div className="lg:col-start-1 lg:row-start-1">
      <PlayerBar name={oppName} avatar={opponent?.avatar ?? null} badge={`${opponent?.kind === 'cpu' ? t('tb.badge.level', { level: t(`tb.level.${opponent.level ?? 'intermediate'}` as Key) }) : opponent?.rating != null ? t('tb.badge.rated', { r: opponent.rating }) : t('tb.badge.friend')}${hand5 ? t('tb.badge.hand', { n: view.handCount[opp] }) : ''}`} remaining={view.remaining[opp]} score={theirScore} active={view.turn === opp} />
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        <Board dto={dto} seat={opp} side="theirs" look={look} owner={oppName} selectable={false} pending={null} onPick={() => undefined} />
      </div>

      {/* Bande centrale (à droite des deux plateaux sur grand écran) */}
      <div className="rounded-2xl border border-gold-500/25 bg-felt-900/70 p-3 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <VerdictRow verdicts={dto.verdicts} you={you} final={finished} />
        {!finished ? (
          <div className="mt-3 flex items-center justify-center gap-4">
            {dto.deadline !== null && myTurn ? <CountdownRing secondsLeft={left} total={dto.turnMs / 1000} label={t('tb.timeLeft')} /> : <span className="w-14" aria-hidden="true" />}
            <div className="flex min-h-[7.2rem] min-w-[5.5rem] items-center justify-center" data-testid="tb-drawn">
              {myTurn && view.yourCard ? (
                <PlayingCard code={view.yourCard} size="lg" fourColor={fourColor} highlight selected={pending !== null} hint={t('tb.drawnCard')} />
              ) : (
                <PlayingCard code={null} size="lg" back={cardBack} dimmed />
              )}
            </div>
            <div className="w-28 text-sm leading-snug text-ivory-100" aria-live="polite">
              {dto.paused ? (
                <span className="text-amber-200">{t('tb.paused')}</span>
              ) : myTurn ? (
                <span className="font-semibold text-gold-200">{hand5 ? t('tb.turn.hand5') : confirm ? t('tb.turn.confirm') : t('tb.turn.tap')}</span>
              ) : (
                <span className="text-ivory-300">{opponent?.kind === 'cpu' ? t('tb.thinks', { name: oppName }) : t('tb.oppPlays')}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-sm text-ivory-200">{t('tb.over')}</p>
        )}
        {myTurn && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {pending !== null && (
              <Button disabled={busy} onClick={() => void place(pending)}>
                {t('tb.placeIn', { c: ROMAN[pending]! })}
              </Button>
            )}
            {dto.mode === 'training' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void client
                    .tbAdvice(dto.code)
                    .then((a) => {
                      setAdvice({ col: a.col, card: a.card, kind: a.kind, after: a.after, afterCodes: [...(view.columns[you]![a.col] ?? []), a.card], fromHand: view.hand.includes(a.card) });
                      if (hand5) setPicked(a.card);
                    })
                    .catch((e) => setError(errorText(i18n, e)))
                }
              >
                {t('tb.advice')}
              </Button>
            )}
          </div>
        )}
        {advice && (
          <p className="mt-2 rounded-xl bg-gold-500/15 px-3 py-2 text-center text-sm text-gold-100" role="note">
            {adviceText(i18n, advice, advice.fromHand)}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-ruby-300">
            {error}
          </p>
        )}
        {lastMove?.auto && !finished && <p className="mt-2 text-center text-xs text-amber-200">{lastMove.seat === you ? t('tb.auto.me') : t('tb.auto.opp')}</p>}
      </div>

      {/* Vous */}
      <div className="lg:col-start-1 lg:row-start-3">
        <Board dto={dto} seat={you} side="mine" look={look} owner={t('tb.you')} selectable={myTurn && !busy} pending={pending} onPick={(c) => void place(c)} />
      </div>
      {hand5 && (
        <div className="rounded-2xl border border-gold-500/25 bg-ink-800/70 p-2 lg:col-start-2 lg:row-start-4" data-testid="tb-hand">
          <p className="mb-1 text-center text-xs text-ivory-300/85">
            {view.pile[you] === 0 ? t('tb.hand.title.noPile') : tp('tb.hand.title.pile', view.pile[you])}
          </p>
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {view.hand.map((c) => (
              <PlayingCard key={c} code={c} size="md" fourColor={fourColor} selected={myTurn && card === c} disabled={!myTurn} onClick={myTurn ? () => { setPicked(c); setPending(null); } : undefined} hint={t('tb.handCard')} />
            ))}
          </div>
        </div>
      )}
      <div className="lg:col-start-1 lg:row-start-4">
        <PlayerBar name={mine?.nickname ?? t('tb.you')} avatar={mine?.avatar ?? null} badge={t('tb.you')} remaining={view.remaining[you]} score={myScore} active={myTurn} />
      </div>

      <div className="lg:col-span-2 lg:row-start-5">
      {finished ? (
        <Finished dto={dto} outcome={outcome} oppName={oppName} onExit={onExit} onAgain={dto.mode === 'training' ? () => client.tbCreate({ mode: 'training', level: (dto.players[opp]?.level ?? 'intermediate') as AiLevel, variant: dto.variant }).then((d) => { latest.current = d; skew.current = clockSkew(d); seenPly.current = 0; setDto(d); setError(''); }).catch((e) => setError(errorText(i18n, e))) : undefined} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-ivory-200">
            <input type="checkbox" checked={confirm} onChange={(e) => toggleConfirm(e.target.checked)} className="h-4 w-4 accent-[#c9a25a]" />
            {t('tb.confirm')}
          </label>
          <Button variant="ghost" onClick={() => setLeaving(true)}>
            {t('tb.quit')}
          </Button>
        </div>
      )}
      </div>

      {leaving && (
        <Modal title={t('tb.quit')} onClose={() => setLeaving(false)}>
          <h2 className="font-display text-xl text-ivory-50">{t('tb.quit.title')}</h2>
          <p className="mt-2 text-sm text-ivory-200">{t(`tb.quit.${dto.mode}` as Key)}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLeaving(false)}>
              {t('tb.quit.continue')}
            </Button>
            <Button className="flex-1" onClick={() => void leave()}>
              {t('tb.quit.confirm')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
    </FitToScreen>
  );
}

function PlayerBar({ name, avatar, badge, remaining, score, active }: { name: string; avatar: string | null; badge: string; remaining: number; score: number; active: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${active ? 'border-gold-400/70 bg-gold-500/10' : 'border-ivory-100/10 bg-ink-800/70'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Avatar nickname={name} avatar={avatar} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ivory-50">{name}</p>
          <Badge tone={active ? 'gold' : 'neutral'}>{badge}</Badge>
        </div>
      </div>
      <dl className="flex shrink-0 gap-4 text-center">
        <div>
          <dt className="text-[10px] text-ivory-300/80">{t('tb.remaining')}</dt>
          <dd className="font-display text-lg tabular-nums text-ivory-50" data-testid="tb-remaining">
            {remaining}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-ivory-300/80">{t('tb.columns')}</dt>
          <dd className="font-display text-lg tabular-nums text-gold-300">{score}</dd>
        </div>
      </dl>
    </div>
  );
}

function Board({ dto, seat, side, look, owner, selectable, pending, onPick }: { dto: TbGameDto; seat: 0 | 1; side: 'mine' | 'theirs'; look: { fourColor: boolean; back: 'losange' | 'rayures' | 'etoile' }; owner: string; selectable: boolean; pending: number | null; onPick: (c: number) => void }) {
  const i18n = useI18n();
  const view = dto.view!;
  const cols = view.columns[seat]!;
  const finished = dto.status === 'finished';
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-2" data-testid={`tb-board-${side}`}>
      {cols.map((cards, i) => (
        <ColumnStack
          key={i}
          index={i}
          side={side}
          cards={cards}
          label={columnLabel(i18n, cards, dto.made?.[seat]?.[i])}
          fresh={dto.lastMove?.seat === seat && dto.lastMove.col === i}
          selectable={selectable && view.legal.includes(i)}
          pending={pending === i}
          onPick={() => onPick(i)}
          forming={finished ? dto.made?.[seat]?.[i]?.forming : undefined}
          look={look}
          owner={owner}
        />
      ))}
    </div>
  );
}

function Finished({ dto, outcome, oppName, onExit, onAgain }: { dto: TbGameDto; outcome: 'win' | 'loss' | 'draw'; oppName: string; onExit: () => void; onAgain?: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const you = dto.you;
  const r = dto.result;
  const [check, setCheck] = useState<'idle' | 'ok' | 'ko' | 'na'>('idle');
  const verify = async () => {
    try {
      const data = new TextEncoder().encode(`flashpoker-tableau-v1:commit:${dto.reveal!.seed}`);
      const buf = await crypto.subtle.digest('SHA-256', data);
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      setCheck(hex === dto.commitment ? 'ok' : 'ko');
    } catch {
      setCheck('na');
    }
  };
  const sf = r?.straightFlush ?? null;
  const mine = r ? r.score[you] : dto.forfeit === you ? 0 : 3;
  const theirs = r ? r.score[(1 - you) as 0 | 1] : dto.forfeit === you ? 3 : 0;
  return (
    <section className="relative space-y-3 rounded-3xl border border-gold-500/40 bg-ink-800/90 p-4" aria-label={t('tb.fin.aria')}>
      {outcome === 'win' && <CoinRain />}
      <div className="text-center">
        {outcome === 'win' && (
          <WinnerSpotlight className="mx-auto mb-1 flex w-28 justify-center">
            <SpinTrophy size={84} />
          </WinnerSpotlight>
        )}
        <Eyebrow>{t('tb.fin.eyebrow')}</Eyebrow>
        {outcome === 'win' ? (
          <VictoryTitle testId="tb-outcome" className="mt-1 font-display text-3xl text-ivory-50">
            {t('tb.fin.win')}
          </VictoryTitle>
        ) : (
          <h2 className="mt-1 font-display text-3xl text-ivory-50" data-testid="tb-outcome">
            {outcome === 'loss' ? t('tb.fin.loss') : t('tb.fin.draw')}
          </h2>
        )}
        {sf ? (
          <p className="mt-1 text-sm text-gold-200" data-testid="tb-sf">
            {t(sf.seat === you ? 'tb.fin.sf.win' : 'tb.fin.sf.loss', { c: ROMAN[sf.col]!, hand: handLabel(i18n, sf.hand) })}
            <span className="mt-2 flex justify-center"><MiniHand hand={sf.hand} /></span>
          </p>
        ) : (
          <p className="mt-1 text-lg tabular-nums text-gold-300">
            {mine} – {theirs}
            {r && r.ties > 0 ? <span className="ml-2 text-sm text-ivory-300">{tp('tb.fin.ties', r.ties)}</span> : null}
          </p>
        )}
        {dto.forfeit !== null && <p className="mt-1 text-sm text-ivory-200">{dto.forfeit === you ? t('tb.fin.youForfeit') : t('tb.fin.oppForfeit')}</p>}
        {dto.rating && <RatingNote change={dto.rating} />}
      </div>
      <ResultsTable dto={dto} opponentName={oppName} />
      <details className="rounded-xl bg-ink-900/60 p-3 text-xs text-ivory-200">
        <summary className="cursor-pointer font-semibold text-ivory-100">{t('tb.fair.summary')}</summary>
        <p className="mt-2">{t('tb.fair.intro')}</p>
        <p className="mt-2 break-all">{t('tb.fair.commit')} <code>{dto.commitment}</code></p>
        <p className="mt-1 break-all">{t('tb.fair.seed')} <code>{dto.reveal?.seed}</code></p>
        <p className="mt-1 break-all">{t('tb.fair.order')} <code>{dto.reveal?.order.join(' ')}</code></p>
        <Button variant="secondary" className="mt-2" onClick={() => void verify()}>
          {t('tb.fair.check')}
        </Button>
        {check === 'ok' && <p className="mt-1 text-jade-300" role="status">{t('tb.fair.ok')}</p>}
        {check === 'ko' && <p className="mt-1 text-ruby-300" role="alert">{t('tb.fair.ko')}</p>}
        {check === 'na' && <p className="mt-1 text-amber-200" role="status">{t('tb.fair.na')}</p>}
      </details>
      <div className="flex flex-col gap-2 sm:flex-row">
        {onAgain && (
          <Button className="flex-1" onClick={() => void onAgain()}>
            {t('tb.again')}
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={onExit}>
          {t('tb.toMenu')}
        </Button>
      </div>
    </section>
  );
}

/** Variation du score d'une partie classée, et changement de ligue le cas échéant. */
function RatingNote({ change }: { change: { before: number; after: number; delta: number; leagueBefore: number; leagueAfter: number } }) {
  const { t } = useI18n();
  const from = change.leagueBefore;
  const to = change.leagueAfter;
  const text = change.delta > 0 ? t('tb.rating.up', { d: change.delta, r: change.after }) : change.delta < 0 ? t('tb.rating.down', { d: -change.delta, r: change.after }) : t('tb.rating.same', { r: change.after });
  return (
    <div className="mt-2 space-y-1" data-testid="tb-rating">
      <p className={`text-sm ${change.delta > 0 ? 'text-emerald-300' : change.delta < 0 ? 'text-ruby-200' : 'text-ivory-200'}`}>{text}</p>
      {to > from && (
        <p className="text-sm text-gold-200">
          {t('tb.rating.league', { league: t(`tb.league.${to}` as Key) })} <LeagueBadge id={to} />
        </p>
      )}
    </div>
  );
}
