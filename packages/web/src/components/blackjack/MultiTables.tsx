import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Eyebrow, Field, inputClass, Panel, Segmented } from '../ui';
import { PlayingCard } from '../Card';
import { FeltMark } from '../FeltMark';
import { EmblemBadge, FramedAvatar, TitleTag } from '../Cosmetics';
import { ChipStack, HandView, type HelpData } from './BjTable';
import { FairnessProof } from './Panels';
import { ApiError } from '../../lib/api';
import { useAccount, useAccountClient } from '../../lib/context';
import { formatChips, formatSignedChips } from '../../lib/format';
import { ACTION_LABEL, CHIP_COLORS, CHIP_VALUES, DOUBLE_LABEL, totalText, paysText, decksText, type Pedagogy, type Speed } from '../../lib/blackjack';
import { useSettings } from '../../lib/settings';
import { Sound } from '../../lib/sound';
import type { BjAction, BjSeatDto, BjTableDto, SeatKind, TablePreset, TableRules } from '../../lib/types';
import { currentI18n, tr, trp, useI18n } from '../../i18n';
import { errorText } from '../../lib/tbText';

const KEY = 'poker.bj.table.v1';
const NICK_KEY = 'poker.bj.nick.v1';
const POLL_MS = 1000;
const ORDER: BjAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER'];
const read = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string): void => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* ignoré */
  }
};
const pct = (x: number): string => `${Math.round(x * 100)} %`;

type Slot = 'none' | SeatKind;
const SLOT_LABEL: Record<Slot, string> = {
  get none() { return tr('bjmulti.slot.none'); },
  get human() { return tr('bjmulti.slot.human'); },
  get cpu() { return tr('bjmulti.slot.cpu'); },
};

interface Props {
  tables: TablePreset[];
  freeRules: TableRules;
  pedagogy: Pedagogy;
  speed: Speed;
  chips: number;
  onSettled: () => void;
  /** Code d'une table ouverte choisie sur l'accueil : un joueur connecté la rejoint aussitôt. */
  joinCode?: string;
}

/** Jeu à plusieurs : créer une table (1 à 6 places, humaines ou CPU), la rejoindre avec un code, jouer. */
export function MultiTables({ tables, freeRules, pedagogy, speed, chips, onSettled, joinCode }: Props) {
  const [code, setCode] = useState<string>(() => read(KEY));
  const choose = (c: string) => {
    write(KEY, c);
    setCode(c);
  };
  if (code) return <SharedTable code={code} pedagogy={pedagogy} speed={speed} onClose={() => choose('')} onSettled={onSettled} />;
  return <Entry tables={tables} freeRules={freeRules} chips={chips} onEnter={choose} initialJoin={joinCode} />;
}

function Entry({ tables, freeRules, chips, onEnter, initialJoin }: { tables: TablePreset[]; freeRules: TableRules; chips: number; onEnter: (code: string) => void; initialJoin?: string }) {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const me = useAccount((s) => s.account);
  const [nick, setNick] = useState(() => read(NICK_KEY) || '');
  const [table, setTable] = useState('decouverte');
  const [slots, setSlots] = useState<Slot[]>(['human', 'cpu', 'cpu', 'none', 'none', 'none']);
  const [joinCode, setJoinCode] = useState(initialJoin?.toUpperCase() ?? '');
  const [isPublic, setPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presets = tables.filter((t) => t.id !== 'libre');
  const seats = slots.filter((s): s is SeatKind => s !== 'none');
  const humans = seats.filter((s) => s === 'human').length;
  const guestNick = me ? undefined : nick.trim() || undefined;

  const run = async (f: () => Promise<BjTableDto>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!me && nick.trim()) write(NICK_KEY, nick.trim());
      const t = await f();
      onEnter(t.code);
    } catch (e) {
      setError(errorText(currentI18n(), e, t('bjmulti.une_erreur_est')));
    } finally {
      setBusy(false);
    }
  };
  // Table ouverte choisie sur l'accueil : le joueur connecté s'assoit tout de suite (invité : code prérempli, pseudo à saisir).
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !me || !initialJoin) return;
    auto.current = true;
    void run(() => account.bjTableJoin(initialJoin.toUpperCase(), undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  const setSlot = (i: number, v: Slot) => setSlots((cur) => cur.map((s, j) => (j === i ? v : s)));
  const preset = (s: Slot[]) => setSlots(s);

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <Eyebrow>{t('bjmulti.creer_une_table')}</Eyebrow>
        <h2 className="mt-1 font-display text-xl text-ivory-50">{t('bjmulti.jouez_de_1')}</h2>
        <p className="mt-1 text-sm text-ivory-200/85">{t('bjmulti.tous_les_joueurs')}</p>

        {!me && (
          <div className="mt-4 max-w-xs">
            <Field label={t('bjmulti.votre_pseudo')} htmlFor="bj-nick">
              <input id="bj-nick" className={inputClass} value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder={t('bjmulti.invite')} autoComplete="nickname" />
            </Field>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-ivory-100">{t('bjmulti.table')}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('bjmulti.table')}>
            {[...presets.map((t) => ({ id: t.id, name: t.name, hint: `${t.limits.minBet} – ${t.limits.maxBet}` })), { id: 'libre', name: t('bjmulti.table_libre'), hint: t('bjmulti.vos_regles') }].map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={table === t.id}
                onClick={() => setTable(t.id)}
                className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${table === t.id ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-ivory-100/15 text-ivory-200 hover:border-ivory-100/35'}`}
              >
                {t.name} <span className="font-normal text-ivory-300/70">· {t.hint}</span>
              </button>
            ))}
          </div>
          {table === 'libre' && <p className="mt-1 text-xs text-ivory-300/75">{t('bjmulti.regles_de_votre', { decks: decksText(freeRules.decks), pays: paysText(freeRules.blackjackPays), double: DOUBLE_LABEL[freeRules.doubleOn].toLowerCase() })}</p>}
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm font-medium text-ivory-100">{t('bjmulti.places_sur_6', { n: seats.length })}</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="flex items-center justify-between rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-sm text-ivory-50">
              <span>{t('bjmulti.place_1')}</span>
              <Badge tone="gold">{t('bjmulti.vous')}</Badge>
            </li>
            {slots.slice(1).map((s, k) => (
              <li key={k} className="rounded-xl border border-ivory-100/12 bg-ink-900/60 px-3 py-2">
                <p className="mb-1 text-xs text-ivory-300/80">{t('bjmulti.place', { v: k + 2 })}</p>
                <Segmented<Slot> value={s} options={['none', 'human', 'cpu']} onChange={(v) => setSlot(k + 1, v)} label={t('bjmulti.place', { v: k + 2 })} format={(v) => SLOT_LABEL[v]} />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Button variant="ghost" className="min-h-[36px] px-3" onClick={() => preset(['human', 'cpu', 'cpu', 'cpu', 'cpu', 'cpu'])}>
              {t('bjmulti.moi_5_cpu')}</Button>
            <Button variant="ghost" className="min-h-[36px] px-3" onClick={() => preset(['human', 'human', 'cpu', 'cpu', 'none', 'none'])}>
              {t('bjmulti.2_humains_2')}</Button>
            <Button variant="ghost" className="min-h-[36px] px-3" onClick={() => preset(['human', 'human', 'human', 'human', 'human', 'human'])}>
              {t('bjmulti.6_humains')}</Button>
            <Button variant="ghost" className="min-h-[36px] px-3" onClick={() => preset(['human', 'none', 'none', 'none', 'none', 'none'])}>
              {t('bjmulti.seul')}</Button>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-ruby-500/50 bg-ruby-500/10 px-4 py-2 text-sm text-ruby-300">
            {error}
          </p>
        )}
        {humans > 1 && (
          <Field label={t('forms.visibilite')} hint={isPublic ? t('ot.hint.public') : t('ot.hint.private')}>
            <Segmented label={t('forms.visibilite')} value={isPublic ? 'publique' : 'privee'} options={['privee', 'publique'] as const} onChange={(v) => setPublic(v === 'publique')} format={(v) => (v === 'privee' ? t('forms.privee') : t('forms.publique'))} />
          </Field>
        )}
        <div className="mt-5">
          <Button disabled={busy || chips < 1} onClick={() => void run(() => account.bjTableCreate({ table, seats, nickname: guestNick, ...(humans > 1 && isPublic ? { public: true } : {}), ...(table === 'libre' ? { rules: freeRules } : {}) }))}>
            {humans > 1 ? tp('bjmulti.creer_attente', humans - 1) : t('bjmulti.creer_la_table')}
          </Button>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <Eyebrow>{t('bjmulti.rejoindre')}</Eyebrow>
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinCode.trim()) void run(() => account.bjTableJoin(joinCode.trim().toUpperCase(), guestNick));
          }}
        >
          <div className="w-44">
            <Field label={t('bjmulti.code_de_la')} htmlFor="bj-join">
              <input id="bj-join" className={inputClass} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={t('bjmulti.bj_xxxx')} maxLength={12} autoComplete="off" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !joinCode.trim()}>
            {t('bjmulti.rejoindre')}</Button>
        </form>
      </Panel>
    </div>
  );
}

/** Compte à rebours calé sur l'horloge du serveur. */
function useCountdown(deadlineAt: number | null, serverNow: number, receivedAt: number): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (deadlineAt === null) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (deadlineAt === null) return null;
  const now = serverNow + (Date.now() - receivedAt);
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

function SharedTable({ code, pedagogy, speed, onClose, onSettled }: { code: string; pedagogy: Pedagogy; speed: Speed; onClose: () => void; onSettled: () => void }) {
  const { t: tr, tp } = useI18n();
  const account = useAccountClient()!;
  const authed = useAccount((s) => s.account);
  const { sound, fourColor, cardBack } = useSettings();
  const [t, setT] = useState<BjTableDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<HelpData | null>(null);
  const [bet, setBet] = useState(10);
  const receivedAt = useRef(Date.now());
  const version = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  const prevTurn = useRef(false);
  const settledRound = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const apply = useCallback((next: BjTableDto) => {
    version.current = next.version;
    receivedAt.current = Date.now();
    setT(next);
  }, []);

  // Sondage : une réponse légère tant que rien ne change.
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await account.bjTableGet(code, version.current);
        if (!alive.current) return;
        if (!('unchanged' in r)) apply(r);
        setError(null);
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof ApiError && e.code === 'NOT_FOUND') {
          closeRef.current();
          return;
        }
        setError(errorText(currentI18n(), e, tr('bjmulti.connexion_perdue_nouvelle')));
      }
      if (alive.current) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [account, code, apply]);

  // Mon tour : son discret et aide pédagogique.
  const myTurn = !!t && t.status === 'PLAYING' && t.me !== null && t.round?.turnSeat === t.me;
  useEffect(() => {
    if (myTurn && !prevTurn.current && sound) Sound.yourTurn();
    prevTurn.current = myTurn;
  }, [myTurn, sound]);
  const handsSig = t?.round && t.me !== null ? JSON.stringify(t.round.view.seats[t.round.participants.indexOf(t.me)]?.hands.map((h) => h.cards)) : '';
  useEffect(() => {
    setHelp(null);
    if (!myTurn || pedagogy === 'libre') return;
    let cancelled = false;
    account
      .bjTableHelp(code)
      .then((h) => !cancelled && setHelp(h))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [account, code, myTurn, handsSig, pedagogy]);

  // Fin de manche : son, et actualisation du profil (jetons, niveau).
  useEffect(() => {
    if (t?.status !== 'DONE' || settledRound.current === t.roundNo) return;
    settledRound.current = t.roundNo;
    settledRef.current();
    if (sound && t.result) (t.result.net > 0 ? Sound.win : t.result.net < 0 ? Sound.error : Sound.confirm)();
  }, [t?.status, t?.roundNo, t?.result, sound]);

  const call = async (f: () => Promise<BjTableDto>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      apply(await f());
    } catch (e) {
      setError(errorText(currentI18n(), e, tr('bjmulti.une_erreur_est')));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const leave = async () => {
    try {
      await account.bjTableLeave(code);
    } catch {
      /* table déjà fermée */
    }
    closeRef.current();
  };

  const left = useCountdown(t?.round?.deadlineAt ?? t?.phaseDeadlineAt ?? null, t?.now ?? 0, receivedAt.current);
  if (!t) return <p className="py-8 text-center text-sm text-ivory-300/70">{error ?? tr('bjmulti.connexion_a_la')}</p>;

  const mine: BjSeatDto | undefined = t.me !== null ? t.seats[t.me] : undefined;
  const isHost = t.me !== null && t.me === t.hostSeat;
  const openSeats = t.seats.filter((s) => s.open).length;
  const legal = new Set(t.round?.legal ?? []);
  const rv = t.round?.view;
  const compact = (rv?.seats.length ?? 0) > 3;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-lg text-ivory-50">
            {t.tableName} <span className="text-sm text-gold-300">· {t.code}</span>
          </p>
          <p className="text-xs text-ivory-300/80">
            {tr('bjmulti.mises_blackjack', { decks: decksText(t.rules.decks), minBet: t.limits.minBet, formatChips: formatChips(t.limits.maxBet), pays: paysText(t.rules.blackjackPays) })}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void leave()}>
          {tr('bjmulti.quitter_la_table')}</Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-ruby-500/50 bg-ruby-500/10 px-4 py-2 text-sm text-ruby-300">
          {error}
        </p>
      )}

      {/* Salle d'attente */}
      {t.status === 'LOBBY' && (
        <Panel className="space-y-3 p-4 sm:p-5">
          <p className="text-sm text-ivory-200">
            {tr('bjmulti.partagez_le_code')} <strong className="font-display text-lg text-gold-300" data-testid="bj-table-code">{t.code}</strong>  {tr('bjmulti.aux_joueurs_humains')}{openSeats > 0 ? (" " + trp('bjmulti.place_libre', openSeats)) : ''}.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.seats.map((s) => (
              <SeatCard key={s.idx} s={s} />
            ))}
          </ul>
          {isHost ? (
            <Button onClick={() => void call(() => account.bjTableStart(code))} disabled={busy}>
              {tr('bjmulti.lancer_la_partie')}{openSeats > 0 ? (" " + trp('bjmulti.les_place_libre', openSeats)) : ''}
            </Button>
          ) : (
            <p className="text-sm text-ivory-300/80">{tr('bjmulti.en_attente_du')}</p>
          )}
        </Panel>
      )}

      {/* Mises */}
      {t.status === 'BETTING' && (
        <Panel className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg text-ivory-50">{tr('bjmulti.faites_vos_mises')}</p>
            {left !== null && <span className="text-sm text-gold-300" aria-live="off">{left} s</span>}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.seats.map((s) => (
              <SeatCard key={s.idx} s={s} />
            ))}
          </ul>
          {mine && !mine.ready && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {CHIP_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={tr('bjmulti.ajouter_jetons', { v })}
                    onClick={() => setBet((b) => Math.min(t.limits.maxBet, Math.max(t.limits.minBet, b + v)))}
                    className="grid h-12 w-12 place-items-center rounded-full border-4 border-dashed border-white/70 font-display text-xs text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
                    style={{ background: CHIP_COLORS[v] }}
                  >
                    {v}
                  </button>
                ))}
                <ChipStack amount={bet} size={30} />
                <button type="button" className="text-xs text-gold-300 underline-offset-2 hover:underline" onClick={() => setBet(t.limits.minBet)}>
                  {tr('bjmulti.min')}</button>
              </div>
              <Button disabled={busy || bet > mine.chips || bet < t.limits.minBet} onClick={() => void call(() => account.bjTableBet(code, bet))}>
                {tr('bjmulti.miser', { formatChips: formatChips(bet) })}</Button>
              {bet > mine.chips && <p className="text-xs text-amber-200">{tr('bjmulti.solde_insuffisant_disponibles', { formatChips: formatChips(mine.chips) })}</p>}
            </div>
          )}
          {mine?.ready && <p className="text-sm text-ivory-300/80">{tr('bjmulti.mise_enregistree_en', { formatChips: formatChips(mine.bet) })}</p>}
        </Panel>
      )}

      {/* Table en jeu */}
      {rv && (t.status === 'PLAYING' || t.status === 'DONE') && (
        <div className="felt felt-bj relative rounded-[32px] px-3 py-5 sm:px-6" style={{ ['--felt-a' as string]: '#0f4a37', ['--felt-b' as string]: '#093327', ['--felt-c' as string]: '#04170f' }}>
          <FeltMark />
          <div className="flex flex-col items-center">
            <div className="mb-2 rounded-full border border-gold-500/40 bg-black/35 px-3.5 py-1 text-xs text-gold-200">{tr('bjmulti.croupier')} {t.rules.dealerHitsSoft17 ? tr('bjmulti.tire_sur_17') : tr('bjmulti.reste_sur_tous')}</div>
            <div className="flex min-h-[5.6rem] items-center [&>*:not(:first-child)]:-ml-6 sm:[&>*:not(:first-child)]:-ml-8" data-testid="dealer-cards">
              {rv.dealer.map((c, i) => (
                <PlayingCard key={`${i}-${c ?? 'x'}`} code={c} size="md" fourColor={fourColor} back={cardBack} flip={i > 0 && !!c} />
              ))}
            </div>
            <p className="mt-1 h-5 text-sm font-semibold text-ivory-50">{totalText(rv.dealer.filter((c, i) => c !== null && !(t.status === 'PLAYING' && i === 1)))}</p>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="table-seats">
            {rv.seats.map((rs, p) => {
              const seat = t.seats[t.round!.participants[p]!]!;
              const turn = t.status === 'PLAYING' && rv.turn === p;
              return (
                <li key={p} className={`rounded-2xl border p-2 ${turn ? 'border-gold-400 bg-black/30' : 'border-ivory-100/10 bg-black/15'}`} aria-label={tr('bjmulti.place_de', { nickname: seat.nickname })}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-ivory-50">
                      <FramedAvatar nickname={seat.nickname} avatar={seat.avatar} size={24} frame={seat.cosmetics?.frame} />
                      <span className="truncate">{seat.nickname}</span>
                      {seat.cosmetics?.emblem && <EmblemBadge id={seat.cosmetics.emblem} size={16} />}
                      {seat.cosmetics?.title && <span className="hidden truncate sm:inline"><TitleTag id={seat.cosmetics.title} /></span>}
                      {seat.kind === 'cpu' && <Badge>{tr('bjmulti.cpu')}</Badge>}
                      {seat.you && <Badge tone="gold">{tr('bjmulti.vous')}</Badge>}
                    </span>
                    {turn && left !== null && seat.kind === 'human' && <span className="text-xs text-gold-300">{left} s</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rs.hands.map((h, hi) => (
                      <HandView key={hi} hand={h} index={hi} isActive={turn && hi === rs.active} compact settled={t.status === 'DONE'} speed={speed} fourColor={fourColor} cardBack={cardBack} />
                    ))}
                  </div>
                  {t.status === 'DONE' && <p className={`mt-1 text-sm font-semibold ${rs.net > 0 ? 'text-emerald-300' : rs.net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedChips(rs.net)}</p>}
                </li>
              );
            })}
          </ul>
          {compact && <span className="sr-only">{tr('bjmulti.table_de_plus')}</span>}
        </div>
      )}
      {t.seats.some((s) => s.sittingOut && s.you) && t.status === 'PLAYING' && <p className="text-sm text-ivory-300/80">{tr('bjmulti.vous_ne_participez')}</p>}

      {/* Mes actions */}
      {t.status === 'PLAYING' && t.me !== null && (
        <div>
          {myTurn ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={tr('bjmulti.actions')}>
                {ORDER.filter((a) => a !== 'SURRENDER' || t.rules.surrender).map((a) => (
                  <Button key={a} variant={pedagogy === 'coach' && help?.advice?.action === a ? 'primary' : a === 'HIT' || a === 'STAND' ? 'secondary' : 'ghost'} disabled={busy || !legal.has(a)} onClick={() => void call(() => account.bjTableAct(code, a))} className="border border-ivory-100/15">
                    {ACTION_LABEL[a]}
                  </Button>
                ))}
              </div>
              {pedagogy !== 'libre' && help && (
                <div className="mt-3 rounded-2xl border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-ivory-100">
                  {pedagogy === 'coach' && help.advice && (
                    <p className="mb-1.5">
                      <strong className="text-gold-300">{tr('bjmulti.conseil', { v: ACTION_LABEL[help.advice.action] })}</strong> {help.advice.reason}
                    </p>
                  )}
                  <p className="text-ivory-200/90">
                    {tr('bj.odds', { bust: pct(help.odds.bustOnHit), win: pct(help.odds.stand.win), push: pct(help.odds.stand.push), lose: pct(help.odds.stand.lose) })}</p>
                  <p className="mt-1 text-xs text-ivory-300/70">{tr('bjmulti.probabilites_calculees_sans')}</p>
                </div>
              )}
            </>
          ) : (
            t.round && t.round.turnSeat >= 0 && <p className="text-sm text-ivory-300/85" aria-live="polite">{tr('bjmulti.tour_de', { nickname: t.seats[t.round.turnSeat]?.nickname })}</p>
          )}
        </div>
      )}

      {/* Fin de manche */}
      {t.status === 'DONE' && (
        <section aria-label={tr('bjmulti.resultat_de_la')} className="rounded-3xl border border-ivory-100/15 bg-ink-800/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {t.result ? (
                <>
                  <p className="font-display text-2xl text-ivory-50" data-testid="round-net">
                    {t.result.net > 0 ? tr('bj.won', { chips: formatChips(t.result.net) }) : t.result.net < 0 ? tr('bj.lost', { chips: formatChips(-t.result.net) }) : tr('bj.push')}
                  </p>
                  <p className="text-sm text-ivory-200/85">
                    {tr('bjmulti.solde', { formatChips: formatChips(mine?.chips ?? 0) })}{t.result.xpGained > 0 ? `, +${t.result.xpGained} XP` : ''}
                  </p>
                </>
              ) : (
                <p className="font-display text-xl text-ivory-50">{tr('bjmulti.manche_terminee')}</p>
              )}
            </div>
            {t.me !== null && (
              <Button onClick={() => void call(() => account.bjTableNext(code))} disabled={busy}>
                {tr('bjmulti.manche_suivante')}{left !== null ? ` (${left} s)` : ''}
              </Button>
            )}
          </div>
          {t.result?.level && <p className="mt-3 rounded-xl bg-gold-500/15 px-3 py-2 text-sm text-gold-200">{tr('bjmulti.niveau_atteint_recompense', { to: t.result.level.to, formatChips: formatChips(t.result.level.reward) })}</p>}
          {t.result?.challengesDone.map((c) => (
            <p key={c.id} className="mt-2 text-sm text-emerald-200">
              {tr('bjmulti.defi_accompli', { label: c.label })}</p>
          ))}
          {t.result?.achievements.map((a) => (
            <p key={a.id} className="mt-2 text-sm text-gold-200">
              {tr('bjmulti.objectif_debloque', { label: a.label })}</p>
          ))}
          {t.round?.seed && (
            <details className="mt-3 text-xs text-ivory-300/80">
              <summary className="cursor-pointer text-ivory-200">{tr('bjmulti.verifier_l_equite')}</summary>
              <FairnessProof seed={t.round.seed} commitment={t.round.commitment} />
            </details>
          )}
        </section>
      )}

      {!authed && t.me !== null && <p className="text-center text-xs text-ivory-300/60">{tr('bjmulti.vous_jouez_en')}</p>}
    </div>
  );
}

function SeatCard({ s }: { s: BjSeatDto }) {
  const { t, tp } = useI18n();
  return (
    <li className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${s.you ? 'border-gold-500/50 bg-gold-500/10' : 'border-ivory-100/12 bg-ink-900/60'}`}>
      {s.open ? <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-ivory-100/30 text-ivory-300/60" aria-hidden="true">+</span> : <FramedAvatar nickname={s.nickname || '?'} avatar={s.avatar} size={32} frame={s.cosmetics?.frame} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ivory-50">
          {s.open ? t('bjmulti.place_libre_humain') : s.nickname}
          {!s.open && s.cosmetics?.emblem && <span className="ml-1.5 inline-block align-middle"><EmblemBadge id={s.cosmetics.emblem} size={16} /></span>}
          {s.kind === 'cpu' && <span className="ml-1.5"><Badge>{t('bjmulti.cpu')}</Badge></span>}
          {s.you && <span className="ml-1.5"><Badge tone="gold">{t('bjmulti.vous')}</Badge></span>}
        </span>
        {!s.open && s.cosmetics?.title && <span className="block truncate"><TitleTag id={s.cosmetics.title} /></span>}
        {!s.open && <span className="text-xs text-ivory-300/75">{formatChips(s.chips)}{s.ready ? `, mise ${formatChips(s.bet)}` : ''}</span>}
      </span>
      {!s.open && s.ready && <Badge tone="green">{t('bjmulti.pret')}</Badge>}
    </li>
  );
}
