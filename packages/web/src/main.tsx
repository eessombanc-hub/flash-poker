import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { GameClient } from './lib/client';
import { ClientProvider } from './lib/context';
import { LocalSessionStore } from './lib/session';

// Même origine en production (reverse proxy) ; en développement, Vite relaie /rooms et /socket.io vers le serveur.
const client = new GameClient({ baseUrl: import.meta.env.VITE_SERVER_URL ?? '', storage: new LocalSessionStore() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientProvider client={client}>
      <App />
    </ClientProvider>
  </StrictMode>,
);
