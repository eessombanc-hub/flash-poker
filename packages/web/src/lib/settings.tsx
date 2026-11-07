import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type FeltColor = 'vert' | 'bleu' | 'bordeaux' | 'anthracite';
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
}
const KEY = 'poker.settings.v1';
const DEFAULTS: Stored = { fourColor: false, sound: true, feltColor: 'vert', cardBack: 'losange' };
const Ctx = createContext<Settings>({
  ...DEFAULTS,
  setFourColor: () => undefined,
  setSound: () => undefined,
  setFeltColor: () => undefined,
  setCardBack: () => undefined,
});

interface Stored {
  fourColor: boolean;
  sound: boolean;
  feltColor: FeltColor;
  cardBack: CardBack;
}
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
  const initial = load();
  const [fourColor, setFourColorState] = useState(initial.fourColor);
  const [sound, setSoundState] = useState(initial.sound);
  const [feltColor, setFeltColorState] = useState(initial.feltColor);
  const [cardBack, setCardBackState] = useState(initial.cardBack);
  const setFourColor = useCallback(
    (v: boolean) => {
      setFourColorState(v);
      save({ fourColor: v, sound, feltColor, cardBack });
    },
    [sound, feltColor, cardBack],
  );
  const setSound = useCallback(
    (v: boolean) => {
      setSoundState(v);
      save({ fourColor, sound: v, feltColor, cardBack });
    },
    [fourColor, feltColor, cardBack],
  );
  const setFeltColor = useCallback(
    (v: FeltColor) => {
      setFeltColorState(v);
      save({ fourColor, sound, feltColor: v, cardBack });
    },
    [fourColor, sound, cardBack],
  );
  const setCardBack = useCallback(
    (v: CardBack) => {
      setCardBackState(v);
      save({ fourColor, sound, feltColor, cardBack: v });
    },
    [fourColor, sound, feltColor],
  );
  const value = useMemo(
    () => ({ fourColor, setFourColor, sound, setSound, feltColor, setFeltColor, cardBack, setCardBack }),
    [fourColor, setFourColor, sound, setSound, feltColor, setFeltColor, cardBack, setCardBack],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = (): Settings => useContext(Ctx);
