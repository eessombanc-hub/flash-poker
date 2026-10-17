import { useEffect, useRef, useState } from 'react';
import { PlayingCard, type CardSize } from './Card';
import { useSettings } from '../lib/settings';

/**
 * Brouillon de sélection (cartes à jeter, à changer, paire désignée).
 * Le serveur garde le brouillon (il survit à une reconnexion) : l'état local est réaligné à chaque NOUVELLE phase.
 */
export function useDraft(serverDraft: readonly string[], phaseKey: string, send: (cards: string[]) => void) {
  const [draft, setDraftState] = useState<string[]>([...serverDraft]);
  // Référence synchrone : deux tapotements dans le même cycle de rendu (double-tap mobile) s'additionnent
  // au lieu de lire tous deux l'ancien brouillon.
  const latest = useRef<string[]>(draft);
  const setDraft = (next: string[]) => {
    latest.current = next;
    setDraftState(next);
  };
  const lastKey = useRef(phaseKey);
  useEffect(() => {
    if (lastKey.current !== phaseKey) {
      lastKey.current = phaseKey;
      setDraft([...serverDraft]);
    }
  }, [phaseKey, serverDraft]);
  // Première apparition (rechargement de page) : reprendre le brouillon conservé par le serveur
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      setDraft([...serverDraft]);
    }
  }, [serverDraft]);

  function toggle(code: string, max: number) {
    const cur = latest.current;
    const next = cur.includes(code) ? cur.filter((c) => c !== code) : cur.length < max ? [...cur, code] : max === 1 ? [code] : cur;
    if (next === cur) return;
    setDraft(next);
    send(next);
  }
  return { draft, toggle };
}

interface HandProps {
  cards: readonly string[];
  selected: readonly string[];
  max: number;
  onToggle: (code: string) => void;
  disabled?: boolean;
  size?: CardSize;
  /** Cartes atténuées (main couchée). */
  dimmed?: boolean;
  label: string;
}

/** Ma main : cartes cliquables, jusqu'à `max` sélectionnées. */
export function SelectableHand({ cards, selected, max, onToggle, disabled = false, size = 'md', dimmed = false, label }: HandProps) {
  const { fourColor } = useSettings();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end justify-center gap-1.5 pt-4 sm:gap-2.5">
      {cards.map((code, i) => {
        const isSel = selected.includes(code);
        return (
          <PlayingCard
            key={code}
            code={code}
            size={size}
            fourColor={fourColor}
            selected={isSel}
            dimmed={dimmed}
            dealIndex={i}
            disabled={disabled || (!isSel && selected.length >= max && max > 1)}
            onClick={() => onToggle(code)}
          />
        );
      })}
    </div>
  );
}

/** Ma main affichée sans interaction (cartes visibles ou non, dans l'ordre de distribution). `code: null` = carte
 * pas encore retournée : ni les adversaires ni le propriétaire n'en connaissent l'identité (6-1, Le 10). */
export function StaticHand({ cards, size = 'md', label, dimmed }: { cards: { code: string | null; visible?: boolean; next?: boolean }[]; size?: CardSize; label: string; dimmed?: boolean }) {
  const { fourColor } = useSettings();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end justify-center gap-1.5 sm:gap-2.5">
      {cards.map((c, i) => (
        <div key={c.code ?? `hidden-${i}`} className="flex flex-col items-center gap-1">
          <PlayingCard code={c.code} size={size} fourColor={fourColor} highlight={c.next} dimmed={dimmed} dealIndex={i} hint={c.code === null ? 'pas encore retournée' : c.visible ? 'visible de tous' : undefined} />
          <span className="text-[10px] text-ivory-300/60">{c.next ? 'prochaine' : i + 1}</span>
        </div>
      ))}
    </div>
  );
}
