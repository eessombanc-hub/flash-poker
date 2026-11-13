import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { GameClient } from './lib/client';
import { AccountClient } from './lib/account';
import { AccountProvider } from './lib/context';
import { MAX_TABLES, SlotsProvider, TableSlots } from './lib/slots';
import { ApiError } from './lib/api';
import { LocalSessionStore } from './lib/session';
import { installErrorReporting } from './lib/errorReport';
import { setAvatarBase } from './lib/avatarImage';

// Même origine en production (reverse proxy) ; en développement, Vite relaie /rooms et /socket.io vers le serveur.
const baseUrl = import.meta.env.VITE_SERVER_URL ?? '';
setAvatarBase(baseUrl);
const account = new AccountClient({ baseUrl });
// Jusqu'à quatre tables à la fois : un client (connexion + session conservée) par emplacement. Le premier garde la clé
// historique, pour qu'une table ouverte avant la mise à jour soit retrouvée.
const refuseFifth = () => {
  if (slots.total() >= MAX_TABLES) throw new ApiError('TABLE_LIMIT', 'Quatre tables au maximum.', 'TABLE_LIMIT');
};
const slots: TableSlots = new TableSlots(
  Array.from({ length: MAX_TABLES }, (_, i) => new GameClient({ baseUrl, storage: new LocalSessionStore(i === 0 ? 'poker.session.v1' : `poker.session.v1.${i}`), accountToken: () => account.token, beforeNewTable: refuseFifth })),
);
account.beforeNewTable = refuseFifth;

// Erreurs non rattrapées : signalées au serveur (une seule fois chacune, au plus cinq par session) pour diagnostiquer
// les affichages cassés vus sur des appareils que nous n'avons pas sous la main.
installErrorReporting(baseUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SlotsProvider slots={slots}>
      <AccountProvider account={account}>
        <App />
      </AccountProvider>
    </SlotsProvider>
  </StrictMode>,
);
