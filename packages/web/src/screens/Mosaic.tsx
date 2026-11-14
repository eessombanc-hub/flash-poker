import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '../components/ui';
import { useI18n } from '../i18n';
import { paneUrl, type Pane } from '../lib/embed';
import { MAX_TABLES, type TableSlots } from '../lib/slots';

export interface MosaicTable {
  id: string;
  pane: Pane;
  game: 'poker' | 'blackjack' | 'tableau';
  code: string;
}

/** Tables que le joueur tient en ce moment : poker d'abord (un emplacement chacune), puis Blackjack et Tableau. */
export function useHeldTables(slots: TableSlots): MosaicTable[] {
  const external = useStore(slots.store, (s) => s.externalTables);
  const [, tick] = useState(0);
  useEffect(() => {
    const offs = slots.clients.map((c) => c.store.subscribe(() => tick((n) => n + 1)));
    return () => offs.forEach((off) => off());
  }, [slots]);
  // Les emplacements de poker changent d'état sans que le magasin des emplacements le sache : on les relit à l'affichage.
  const poker = slots.clients.flatMap((c, i): MosaicTable[] => (c.state.session ? [{ id: `poker:${i}`, pane: { kind: 'poker', slot: i }, game: 'poker', code: c.state.session.code }] : []));
  const rest = external.map((e): MosaicTable => (e.game === 'blackjack' ? { id: 'blackjack', pane: { kind: 'blackjack' }, game: 'blackjack', code: e.code } : { id: `tableau:${e.code}`, pane: { kind: 'tableau', code: e.code }, game: 'tableau', code: e.code }));
  return [...poker, ...rest].slice(0, MAX_TABLES);
}

interface Props {
  slots: TableSlots;
  onClose: () => void;
  /** Ouvre une table en plein écran. */
  onOpen: (t: MosaicTable) => void;
}

/** Hauteur minimale d'une table : en dessous, la mise en page d'une table serait rognée ; l'écran défile alors. */
const MIN_PANE = 640;
const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2' };

/**
 * Vue mosaïque : jusqu'à quatre tables côte à côte, jouables en même temps. Chaque table tourne dans son propre cadre
 * (une copie de l'application réduite à cette table), donc avec sa mise en page d'écran réduit et ses fenêtres propres.
 * La page principale coupe ses connexions pendant ce temps et les reprend à la fermeture.
 */
export function Mosaic({ slots, onClose, onOpen }: Props) {
  const { t } = useI18n();
  const tables = useHeldTables(slots);
  const byId = useMemo(() => new Map(tables.map((x) => [x.id, x])), [tables]);

  useEffect(() => {
    slots.suspendForMosaic();
    return () => slots.resumeFromMosaic();
  }, [slots]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; pane?: string } | null;
      if (!d || typeof d.pane !== 'string') return;
      if (d.type === 'mosaic:focus') {
        const hit = byId.get(d.pane);
        if (hit) onOpen(hit);
      } else if (d.type === 'mosaic:gone') {
        slots.clients.forEach((c) => c.syncFromStorage());
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [byId, onOpen, slots]);

  const n = tables.length;
  return (
    <div className="flex h-[100dvh] flex-col bg-ink-950">
      <header className="flex items-center justify-between gap-3 px-3 py-2">
        <Button variant="ghost" onClick={onClose} className="-ml-2">
          {t('mosaic.back')}
        </Button>
        <h1 className="font-display text-xl text-ivory-50">{t('mosaic.title')}</h1>
        <span className="w-20 text-right text-xs text-ivory-300/70">{n}/{MAX_TABLES}</span>
      </header>
      {n < 2 ? (
        <p className="m-auto max-w-sm px-4 text-center text-sm text-ivory-200/85">{t('mosaic.empty')}</p>
      ) : (
        <ul className={`grid min-h-0 flex-1 gap-2 overflow-y-auto px-2 pb-2 ${COLS[n]} ${n > 3 ? 'auto-rows-min' : 'grid-rows-1'}`}>
          {tables.map((x) => (
            <li key={x.id} style={{ minHeight: MIN_PANE, height: n > 3 ? `max(${MIN_PANE}px, calc((100dvh - 4.5rem) / 2))` : undefined }} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gold-500/30 bg-ink-900">
              <div className="flex items-center justify-between gap-2 border-b border-gold-500/20 px-3 py-1 text-xs">
                <span className="truncate font-semibold text-ivory-50">
                  {t(`dock.game.${x.game}` as never)} · <span className="font-mono">{x.code}</span>
                </span>
                <button type="button" onClick={() => onOpen(x)} aria-label={`${t('mosaic.enlarge')} ${t(`dock.game.${x.game}` as never)} ${x.code}`} className="shrink-0 rounded px-2 py-0.5 font-semibold text-gold-300 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                  {t('mosaic.enlarge')}
                </button>
              </div>
              <iframe title={`${t(`dock.game.${x.game}` as never)} ${x.code}`} src={paneUrl(x.pane)} className="min-h-0 w-full flex-1 border-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
