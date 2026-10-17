import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Settings {
  /** Couleurs de cartes distinctes (trèfle vert, carreau bleu) : lecture facilitée. */
  fourColor: boolean;
  setFourColor: (v: boolean) => void;
  /** Sons courts (sélection, retournement, votre tour) et vibration mobile aux 5 dernières secondes. Activé par défaut. */
  sound: boolean;
  setSound: (v: boolean) => void;
}
const KEY = 'poker.settings.v1';
const Ctx = createContext<Settings>({ fourColor: false, setFourColor: () => undefined, sound: true, setSound: () => undefined });

interface Stored {
  fourColor: boolean;
  sound: boolean;
}
function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { fourColor: s.fourColor === true, sound: s.sound !== false };
  } catch {
    return { fourColor: false, sound: true };
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
  const setFourColor = useCallback(
    (v: boolean) => {
      setFourColorState(v);
      save({ fourColor: v, sound });
    },
    [sound],
  );
  const setSound = useCallback(
    (v: boolean) => {
      setSoundState(v);
      save({ fourColor, sound: v });
    },
    [fourColor],
  );
  const value = useMemo(() => ({ fourColor, setFourColor, sound, setSound }), [fourColor, setFourColor, sound, setSound]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = (): Settings => useContext(Ctx);
