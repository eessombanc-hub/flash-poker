import { Suspense, lazy, useEffect } from 'react';
import { ToastHost } from '../components/ui';
import { useI18n } from '../i18n';
import { tellParent, type Pane } from '../lib/embed';
import { useAccountClient, useClient, useGame } from '../lib/context';
import { SettingsProvider } from '../lib/settings';
import { Lobby } from './Lobby';
import { Table } from './Table';

const Blackjack = lazy(() => import('./Blackjack').then((m) => ({ default: m.Blackjack })));
const Tableau = lazy(() => import('./Tableau').then((m) => ({ default: m.Tableau })));

/**
 * Cadre de la vue mosaïque : une seule table, sans barre ni bandeau. « Retour » ou « Se connecter » demandent à la page
 * principale d'ouvrir cette table en plein écran (le cadre n'a pas d'accueil).
 */
export function EmbedPane({ pane }: { pane: Pane }) {
  const { t } = useI18n();
  const id = pane.kind === 'poker' ? `poker:${pane.slot}` : pane.kind === 'tableau' ? `tableau:${pane.code}` : 'blackjack';
  const focus = () => tellParent({ type: 'mosaic:focus', pane: id });
  const account = useAccountClient();
  useEffect(() => {
    void account?.init();
    return () => account?.dispose();
  }, [account]);
  return (
    <SettingsProvider>
      <div data-pane={id} className="min-h-[100dvh]">
        <Suspense fallback={<p className="p-6 text-center text-sm text-ivory-300/70" role="status">{t('common.loading')}</p>}>
          {pane.kind === 'poker' ? <PokerPane id={id} onFocus={focus} /> : pane.kind === 'blackjack' ? <Blackjack onBack={focus} onLogin={focus} initialTab="plusieurs" /> : <Tableau onBack={focus} onLogin={focus} resumeCode={pane.code} />}
        </Suspense>
      </div>
    </SettingsProvider>
  );
}

function PokerPane({ id, onFocus }: { id: string; onFocus: () => void }) {
  const { t } = useI18n();
  const client = useClient();
  const session = useGame((s) => s.session);
  const view = useGame((s) => s.view);
  const toasts = useGame((s) => s.toasts);
  useEffect(() => {
    if (!session) tellParent({ type: 'mosaic:gone', pane: id });
  }, [session, id]);
  if (!session)
    return <p className="p-6 text-center text-sm text-ivory-200/80">{t('mosaic.gone')}</p>;
  return (
    <>
      {!view ? (
        <p className="p-6 text-center text-sm text-ivory-300/70" role="status">{t('app.connexion_a_la', { code: session.code })}</p>
      ) : view.status === 'WAITING' || view.status === 'CANCELLED' ? (
        <Lobby onAway={onFocus} />
      ) : (
        <Table onRegister={onFocus} />
      )}
      <ToastHost toasts={toasts} onDismiss={client.dismissToast} />
    </>
  );
}
