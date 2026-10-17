import { useEffect, useState } from 'react';

/** Vrai si la requête média correspond (ex. `(min-width: 768px)`). Faux hors navigateur. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, set] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => set(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}
