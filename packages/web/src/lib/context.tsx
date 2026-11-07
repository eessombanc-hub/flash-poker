import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AccountClient, AccountState } from './account';
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

// ---------- Compte joueur (facultatif : absent, l'application fonctionne en invité uniquement) ----------
const AccountContext = createContext<AccountClient | null>(null);

export function AccountProvider({ account, children }: { account: AccountClient | null; children: ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
export function useAccountClient(): AccountClient | null {
  return useContext(AccountContext);
}
const NO_ACCOUNT: AccountState = { token: null, account: null, ready: true, passwordRecovery: false, wallet: null };
const noStore = { getState: () => NO_ACCOUNT, getInitialState: () => NO_ACCOUNT, subscribe: () => () => undefined, setState: () => undefined };
export function useAccount<T>(selector: (s: AccountState) => T): T {
  const a = useAccountClient();
  return useStore((a?.store ?? noStore) as AccountClient['store'], selector);
}
