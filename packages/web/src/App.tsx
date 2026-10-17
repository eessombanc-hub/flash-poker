import { useEffect, useState } from 'react';
import { Button, Panel, ToastHost } from './components/ui';
import { useClient, useGame } from './lib/context';
import { SettingsProvider, useSettings } from './lib/settings';
import { Sound } from './lib/sound';
import { CreateRoom, JoinRoom } from './screens/Forms';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';

type Screen = 'home' | 'create' | 'join';

function initialCode(): string {
  try {
    return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

/** Relie le client réseau au réglage « Sons » de l'utilisateur (un son bref à chaque commande). */
function SoundBridge() {
  const client = useClient();
  const { sound } = useSettings();
  useEffect(() => {
    client.onSound = (kind) => {
      if (!sound) return;
      if (kind === 'select') Sound.select();
      else if (kind === 'confirm') Sound.confirm();
      else Sound.error();
    };
    return () => {
      client.onSound = () => undefined;
    };
  }, [client, sound]);
  return null;
}

function ConnectionBanner() {
  const connection = useGame((s) => s.connection);
  const view = useGame((s) => s.view);
  if (connection === 'online' || connection === 'idle') return null;
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-950/95 px-4 py-2 text-center text-sm text-amber-100 backdrop-blur">
      <span className="h-2 w-2 animate-pulseRing rounded-full bg-amber-400" />
      {connection === 'connecting' && !view ? 'Connexion à la table…' : 'Connexion perdue — reconnexion en cours. Les minuteurs continuent de s’écouler.'}
    </div>
  );
}

export function App() {
  const client = useClient();
  const session = useGame((s) => s.session);
  const view = useGame((s) => s.view);
  const closed = useGame((s) => s.closed);
  const toasts = useGame((s) => s.toasts);
  const [screen, setScreen] = useState<Screen>(() => (initialCode() ? 'join' : 'home'));
  const [joinCode, setJoinCode] = useState<string>(initialCode);

  useEffect(() => {
    client.resume(); // reprise automatique après un rechargement (jeton conservé)
    return () => client.dispose();
  }, [client]);

  let content;
  if (session) {
    if (!view) {
      content = (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <Panel className="w-full p-8">
            <p className="font-display text-2xl text-ivory-50">Connexion à la partie {session.code}…</p>
            <p className="mt-2 text-sm text-ivory-200/80">Votre siège vous attend.</p>
            <Button variant="ghost" className="mt-5" onClick={() => client.leave()}>
              Annuler et revenir à l’accueil
            </Button>
          </Panel>
        </main>
      );
    } else if (view.status === 'WAITING' || view.status === 'CANCELLED') content = <Lobby />;
    else content = <Table />;
  } else if (screen === 'create') content = <CreateRoom onBack={() => setScreen('home')} />;
  else if (screen === 'join') content = <JoinRoom onBack={() => setScreen('home')} initialCode={joinCode} />;
  else
    content = (
      <Home
        onCreate={() => setScreen('create')}
        onJoin={(code) => {
          setJoinCode(code ?? '');
          setScreen('join');
        }}
        notice={closed === 'KICKED' ? 'Vous avez été retiré de la partie par l’hôte.' : closed === 'INVALID_SESSION' ? 'Votre session n’est plus valide (partie expirée ou supprimée).' : null}
      />
    );

  return (
    <SettingsProvider>
      <SoundBridge />
      <ConnectionBanner />
      {content}
      <ToastHost toasts={toasts} onDismiss={client.dismissToast} />
    </SettingsProvider>
  );
}
