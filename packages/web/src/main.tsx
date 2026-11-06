import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { GameClient } from './lib/client';
import { AccountClient } from './lib/account';
import { AccountProvider, ClientProvider } from './lib/context';
import { LocalSessionStore } from './lib/session';

// Même origine en production (reverse proxy) ; en développement, Vite relaie /rooms et /socket.io vers le serveur.
const baseUrl = import.meta.env.VITE_SERVER_URL ?? '';
const account = new AccountClient({ baseUrl });
const client = new GameClient({ baseUrl, storage: new LocalSessionStore(), accountToken: () => account.token });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientProvider client={client}>
      <AccountProvider account={account}>
        <App />
      </AccountProvider>
    </ClientProvider>
  </StrictMode>,
);
