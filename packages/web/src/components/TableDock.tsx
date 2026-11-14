import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useI18n } from '../i18n';
import type { AccountClient } from '../lib/account';
import { MAX_TABLES, type TableSlots } from '../lib/slots';
import { useMediaQuery } from '../lib/media';
import { Sound } from '../lib/sound';

const BJ_KEY = 'poker.bj.table.v1';

export type DockGame = 'poker' | 'blackjack' | 'tableau';
type DockState = 'connecting' | 'waiting' | 'ready' | 'playing' | 'watching' | 'cancelled';

interface Row {
  key: string;
  game: DockGame;
  code: string;
  state: DockState;
  /** « 2/4 » pour une table de poker en attente. */
  players?: { n: number; max: number };
  /** Emplacement de poker (pour l'ouvrir). */
  slot?: number;
}

interface External {
  game: 'blackjack' | 'tableau';
  code: string;
  state: DockState;
  filled: number;
}

/** Tables de Blackjack et de Tableau que le joueur tient en ce moment, interrogées à intervalle raisonnable. */
function useExternal(account: AccountClient | null, signedIn: boolean, trigger: string, onAlert: (text: string, key: string) => void): External[] {
  const [rows, setRows] = useState<External[]>([]);
  const prev = useRef<Map<string, External>>(new Map());
  const alert = useRef(onAlert);
  alert.current = onAlert;
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const known = rows.length > 0;

  useEffect(() => {
    if (!account) return;
    let off = false;
    const run = async () => {
      const next: External[] = [];
      let code = '';
      try {
        code = localStorage.getItem(BJ_KEY) ?? '';
      } catch {
        code = '';
      }
      if (code) {
        try {
          const r = await account.bjTableGet(code);
          if (!('unchanged' in r) && r.me !== null) {
            const humans = r.seats.filter((s) => s.kind === 'human');
            next.push({ game: 'blackjack', code: r.code, state: r.status === 'LOBBY' ? 'waiting' : 'playing', filled: humans.filter((s) => !s.open).length });
          }
        } catch {
          /* table fermée ou serveur injoignable : elle n'est plus comptée */
        }
      }
      {
        try {
          const a = await account.tbActive();
          if (a) next.push({ game: 'tableau', code: a.code, state: a.status === 'waiting' ? 'waiting' : a.status === 'finished' ? 'cancelled' : 'playing', filled: 0 });
        } catch {
          /* ignoré */
        }
      }
      if (off) return;
      // Arrivée d'un joueur : une alerte, une seule, pour chaque table.
      for (const row of next) {
        const before = prev.current.get(`${row.game}:${row.code}`);
        if (before && before.state === 'waiting' && (row.state === 'playing' || row.filled > before.filled)) alert.current(tRef.current('dock.alert.opponent', { code: row.code }), `${row.game}:${row.code}`);
      }
      prev.current = new Map(next.map((r) => [`${r.game}:${r.code}`, r]));
      setRows((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    void run();
    // Tant qu'une table existe, on la surveille ; sinon, un simple contrôle à chaque changement d'écran suffit.
    const id = known ? setInterval(() => { if (!document.hidden) void run(); }, 5000) : null;
    return () => {
      off = true;
      if (id) clearInterval(id);
    };
  }, [account, signedIn, trigger, known]);
  return rows.filter((r) => r.state !== 'cancelled');
}

interface Props {
  slots: TableSlots;
  account: AccountClient | null;
  signedIn: boolean;
  /** Écran affiché : sert à relancer l'inventaire des tables hors poker. */
  trigger: string;
  /** Vrai quand une table occupe déjà l'écran (réduit le bandeau à une pastille). */
  compact: boolean;
  /** Emplacement de poker affiché en ce moment, ou -1. */
  shownSlot: number;
  onOpenPoker: (slot: number) => void;
  /** Ouvre la vue mosaïque (deux tables ou plus, écran assez large). */
  onMosaic?: () => void;
  onOpenExternal: (game: 'blackjack' | 'tableau', code: string) => void;
}

/** Bandeau « Mes tables » : jusqu'à quatre tables ouvertes, en poker, Blackjack ou Tableau, une pression pour y revenir. */
export function TableDock({ slots, account, signedIn, trigger, compact, shownSlot, onOpenPoker, onMosaic, onOpenExternal }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const mark = (text: string, key: string) => {
    slots.client.toast('info', text);
    Sound.confirm();
    setPulse((p) => new Set(p).add(key));
  };
  const wide = useMediaQuery('(min-width: 900px)');
  const external = useExternal(account, signedIn, trigger, mark);
  useEffect(() => slots.setExternal(external.length), [slots, external.length]);
  useEffect(() => slots.setExternalTables(external.map((e) => ({ game: e.game, code: e.code }))), [slots, external]);

  // L'état de chaque emplacement de poker : réévalué à chaque message reçu du serveur.
  const [, tick] = useState(0);
  useEffect(() => {
    const offs = slots.clients.map((c) => c.store.subscribe(() => tick((n) => n + 1)));
    return () => offs.forEach((off) => off());
  }, [slots]);
  useStore(slots.store, (s) => s.active);

  // Arrivées dans les tables de poker qu'on ne regarde pas.
  const seen = useRef<Map<number, { ids: Set<string>; status: string }>>(new Map());
  const rows: Row[] = [];
  slots.clients.forEach((c, i) => {
    const s = c.state;
    if (!s.session) {
      seen.current.delete(i);
      return;
    }
    const view = s.view;
    const key = `poker:${s.session.code}`;
    if (!view) {
      rows.push({ key, game: 'poker', code: s.session.code, state: 'connecting', slot: i });
      return;
    }
    const ids = new Set(view.players.map((p) => p.id));
    const before = seen.current.get(i);
    if (before && i !== shownSlot) {
      if (view.you.role !== 'SPECTATOR') for (const p of view.players) if (!before.ids.has(p.id) && p.id !== view.you.playerId) queueMicrotask(() => mark(t('dock.alert.joined', { nickname: p.nickname, code: view.code }), key));
      if (view.you.role !== 'SPECTATOR' && before.status === 'WAITING' && view.status === 'RUNNING') queueMicrotask(() => mark(t('dock.alert.started', { code: view.code }), key));
    }
    seen.current.set(i, { ids, status: view.status });
    const state: DockState = view.you.role === 'SPECTATOR' ? 'watching' : view.status === 'CANCELLED' ? 'cancelled' : view.status === 'WAITING' ? (view.players.length >= 2 ? 'ready' : 'waiting') : 'playing';
    rows.push({ key, game: 'poker', code: view.code, state, players: view.status === 'WAITING' ? { n: view.players.length, max: view.config.maxPlayers } : undefined, slot: i });
  });
  for (const e of external) rows.push({ key: `${e.game}:${e.code}`, game: e.game, code: e.code, state: e.state, slot: undefined });

  const hidden = rows.length === 0 || (rows.length === 1 && shownSlot >= 0 && rows[0]!.slot === shownSlot);
  if (hidden) return null;

  const stateText = (r: Row): string =>
    r.state === 'connecting' ? t('dock.state.connecting')
      : r.state === 'watching' ? t('dock.state.watching') : r.state === 'playing' ? t('dock.state.playing')
        : r.state === 'cancelled' ? t('dock.state.cancelled')
          : r.state === 'ready' && r.players ? t('dock.state.players', r.players)
            : t('dock.state.waiting');
  const go = (r: Row) => {
    setPulse((p) => {
      const n = new Set(p);
      n.delete(r.key);
      return n;
    });
    setOpen(false);
    if (r.game === 'poker') onOpenPoker(r.slot!);
    else onOpenExternal(r.game, r.code);
  };
  const alerting = pulse.size > 0;
  const expanded = !compact || open;

  if (!expanded)
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={t('dock.expand')} className={`fixed bottom-3 left-3 z-40 flex items-center gap-2 rounded-full border bg-ink-900/95 px-3 py-2 text-xs font-semibold text-ivory-50 shadow-lg backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${alerting ? 'border-jade-400 ring-2 ring-jade-400/50' : 'border-gold-500/50'}`}>
        <span className={`h-2 w-2 rounded-full ${alerting ? 'animate-pulseRing bg-jade-400' : 'bg-gold-400'}`} />
        {t('dock.count', { n: rows.length, max: MAX_TABLES })}
      </button>
    );

  return (
    <>
      {!compact && <div aria-hidden="true" className="h-20" />}
      <nav aria-label={t('dock.title')} className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-500/30 bg-ink-900/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="shrink-0 text-xs font-semibold text-gold-300">{t('dock.title')} · {rows.length}/{MAX_TABLES}</p>
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">
            {rows.map((r) => {
              const shown = r.slot !== undefined && r.slot === shownSlot;
              const hot = pulse.has(r.key) || r.state === 'ready';
              return (
                <li key={r.key} className="shrink-0">
                  <button type="button" onClick={() => go(r)} disabled={shown} aria-current={shown ? 'true' : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${shown ? 'border-gold-400 bg-gold-500/15' : hot ? 'border-jade-400 bg-jade-500/15 hover:bg-jade-500/25' : 'border-ivory-100/20 bg-ink-800/80 hover:border-gold-500/60'}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${r.state === 'playing' ? 'bg-ruby-400' : hot ? 'animate-pulseRing bg-jade-400' : 'bg-amber-400'}`} />
                    <span>
                      <span className="block font-semibold text-ivory-50">{t(`dock.game.${r.game}` as never)} · <span className="font-mono">{r.code}</span></span>
                      <span className="block text-ivory-200/80">{stateText(r)}</span>
                    </span>
                    <span className="ml-1 font-semibold text-gold-300">{shown ? t('dock.shown') : t('dock.open')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {onMosaic && rows.length >= 2 && wide && (
            <button type="button" onClick={() => { setOpen(false); onMosaic(); }} className="shrink-0 rounded-lg border border-gold-500/50 px-3 py-1.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
              {t('dock.mosaic')}
            </button>
          )}
          {compact && (
            <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
              {t('dock.collapse')}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
