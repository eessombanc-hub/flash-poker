import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { GameClient, type ClientState } from './client';

const ClientContext = createContext<GameClient | null>(null);

export function ClientProvider({ client, children }: { client: GameClient; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): GameClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error('ClientProvider manquant');
  return c;
}

export function useGame<T>(selector: (s: ClientState) => T): T {
  return useStore(useClient().store, selector);
}

/** Heure serveur, rafraîchie régulièrement (compteurs). */
export function useServerNow(intervalMs = 250): number {
  const client = useClient();
  const [now, setNow] = useState(() => client.serverNow());
  useEffect(() => {
    setNow(client.serverNow());
    const id = setInterval(() => setNow(client.serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [client, intervalMs]);
  return now;
}

/** Secondes restantes avant une échéance serveur (null si aucune). */
export function useSecondsLeft(deadlineAt: number | null): number | null {
  const now = useServerNow();
  return deadlineAt === null ? null : Math.max(0, (deadlineAt - now) / 1000);
}
