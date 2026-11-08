import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AMBIANCE_OPTIONS } from './theme';

export type FeltColor = 'vert' | 'bleu' | 'bordeaux' | 'anthracite';
export type Ambiance = 'saphir' | 'emeraude' | 'cuir' | 'carbone' | 'bordeaux' | 'violet';
export type CardBack = 'losange' | 'rayures' | 'etoile';

interface Settings {
  /** Couleurs de cartes distinctes (trèfle vert, carreau bleu) : lecture facilitée. */
  fourColor: boolean;
  setFourColor: (v: boolean) => void;
  /** Sons courts (sélection, retournement, votre tour) et vibration mobile aux 5 dernières secondes. Activé par défaut. */
  sound: boolean;
  setSound: (v: boolean) => void;
  /** Couleur du tapis de table. */
  feltColor: FeltColor;
  setFeltColor: (v: FeltColor) => void;
  /** Motif du dos des cartes. */
  cardBack: CardBack;
  setCardBack: (v: CardBack) => void;
  /** Ambiance générale (teinte du fond de l'interface). */
  ambiance: Ambiance;
  setAmbiance: (v: Ambiance) => void;
}
const KEY = 'poker.settings.v1';
const DEFAULTS: Stored = { fourColor: false, sound: true, feltColor: 'vert', cardBack: 'losange', ambiance: 'saphir' };
const Ctx = createContext<Settings>({
  ...DEFAULTS,
  setFourColor: () => undefined,
  setSound: () => undefined,
  setFeltColor: () => undefined,
  setCardBack: () => undefined,
  setAmbiance: () => undefined,
});

interface Stored {
  fourColor: boolean;
  sound: boolean;
  feltColor: FeltColor;
  cardBack: CardBack;
  ambiance: Ambiance;
}
const AMBIANCES: Ambiance[] = ['saphir', 'emeraude', 'cuir', 'carbone', 'bordeaux', 'violet'];
const FELT_COLORS: FeltColor[] = ['vert', 'bleu', 'bordeaux', 'anthracite'];
const CARD_BACKS: CardBack[] = ['losange', 'rayures', 'etoile'];
function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      fourColor: s.fourColor === true,
      sound: s.sound !== false,
      feltColor: FELT_COLORS.includes(s.feltColor) ? s.feltColor : DEFAULTS.feltColor,
      cardBack: CARD_BACKS.includes(s.cardBack) ? s.cardBack : DEFAULTS.cardBack,
      ambiance: AMBIANCES.includes(s.ambiance) ? s.ambiance : DEFAULTS.ambiance,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
function save(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);
  const update = useCallback((patch: Partial<Stored>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);
  // L'ambiance s'applique à toute la page (variables CSS) et à la barre du navigateur sur téléphone.
  useEffect(() => {
    document.documentElement.dataset.ambiance = state.ambiance;
    const meta = AMBIANCE_OPTIONS.find((a) => a.id === state.ambiance)?.meta;
    if (meta) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta);
  }, [state.ambiance]);
  const value = useMemo<Settings>(
    () => ({
      ...state,
      setFourColor: (v) => update({ fourColor: v }),
      setSound: (v) => update({ sound: v }),
      setFeltColor: (v) => update({ feltColor: v }),
      setCardBack: (v) => update({ cardBack: v }),
      setAmbiance: (v) => update({ ambiance: v }),
    }),
    [state, update],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = (): Settings => useContext(Ctx);
