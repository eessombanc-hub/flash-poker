import { useEffect, useState } from 'react';
import type { LiveStats } from './api';
import type { GameClient } from './client';

const EVERY_MS = 20_000;

/** Identifiant aléatoire propre à l'onglet : jamais enregistré, jamais relié à un compte. */
function visitorId(): string {
  const bytes = new Uint8Array(12);
  (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

/**
 * Fréquentation du site : se signale toutes les 20 secondes (onglet visible) et renvoie les derniers chiffres,
 * ou null tant qu'ils ne sont pas connus (serveur injoignable, par exemple).
 */
export function useLiveStats(client: Pick<GameClient, 'stats'>, everyMs: number = EVERY_MS): LiveStats | null {
  const [stats, setStats] = useState<LiveStats | null>(null);
  useEffect(() => {
    if (typeof client.stats !== 'function') return;
    const id = visitorId();
    let alive = true;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      client.stats(id).then(
        (s) => alive && setStats(s),
        () => alive && setStats(null),
      );
    };
    tick();
    const timer = setInterval(tick, everyMs);
    document.addEventListener?.('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener?.('visibilitychange', tick);
    };
  }, [client, everyMs]);
  return stats;
}
