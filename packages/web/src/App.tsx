import { lazy, Suspense, useEffect, useState } from 'react';
import { Avatar, Button, Panel, ToastHost } from './components/ui';
import { ProfileIcon } from './components/Icons3D';
import { useLiveStats } from './lib/liveStats';
import { useAccount, useAccountClient, useClient, useGame } from './lib/context';
import { SettingsProvider, useSettings } from './lib/settings';
import { Sound } from './lib/sound';
import type { AuthMode } from './screens/Auth';
import { CreateRoom, JoinRoom, TrainingRoom } from './screens/Forms';
import { Home } from './screens/Home';
import { Solo } from './screens/Solo';
import type { VariantId } from './lib/types';
import { I18nProvider, LanguageSelect, useI18n } from './i18n';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';

// Écrans de compte chargés à la demande : la première page (accueil, table) s'affiche plus vite sur téléphone.
const loadAuth = () => import('./screens/Auth');
const loadSpace = () => import('./screens/Space');
const loadBlackjack = () => import('./screens/Blackjack');
const loadTableau = () => import('./screens/Tableau');
const loadVariants = () => import('./screens/Variants');
const AuthScreen = lazy(() => loadAuth().then((m) => ({ default: m.AuthScreen })));
const Blackjack = lazy(() => loadBlackjack().then((m) => ({ default: m.Blackjack })));
const Tableau = lazy(() => loadTableau().then((m) => ({ default: m.Tableau })));
const Variants = lazy(() => loadVariants().then((m) => ({ default: m.Variants })));
const Space = lazy(() => loadSpace().then((m) => ({ default: m.Space })));
import type { SpaceTab } from './screens/Space';

type Screen = 'home' | 'create' | 'join' | 'solo' | 'train' | 'space' | 'blackjack' | 'tableau' | 'variants' | { auth: AuthMode };

function initialCode(): string {
  try {
    return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

/** Lien d'invitation à une partie amicale du Tableau (`?tableau=TB-XXXX`) : lu une fois, puis retiré de la barre d'adresse. */
function takeTableauCode(): string {
  try {
    const url = new URL(window.location.href);
    const c = (url.searchParams.get('tableau') ?? '').toUpperCase();
    if (c) {
      url.searchParams.delete('tableau');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return /^TB-[A-Z2-9]{4}$/.test(c) ? c : '';
  } catch {
    return '';
  }
}

/** Lien « nouveau mot de passe » reçu par e-mail : lu une fois, puis retiré de la barre d'adresse. */
function takeResetToken(): string {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('reinitialiser') ?? '';
    if (t) {
      url.searchParams.delete('reinitialiser');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return t;
  } catch {
    return '';
  }
}

/** Lien d'invitation (`?invitation=…`) : lu une fois, puis retiré de la barre d'adresse. */
function takeInviteCode(): string {
  try {
    const url = new URL(window.location.href);
    const c = url.searchParams.get('invitation') ?? '';
    if (c) {
      url.searchParams.delete('invitation');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return /^[A-Za-z0-9_-]{6,40}$/.test(c) ? c : '';
  } catch {
    return '';
  }
}

/** En-tête de l'accueil : accès au compte (connexion, inscription, ou « Mon espace »). */
function AccountBar({ onAuth, onSpace }: { onAuth: (mode: AuthMode) => void; onSpace: () => void }) {
  const { t } = useI18n();
  const account = useAccountClient();
  const me = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  if (!account || !ready) return null;
  if (me)
    return (
      <div className="flex items-center gap-2">
      <button type="button" onClick={onSpace} className="flex items-center gap-2 rounded-full border border-gold-500/50 bg-ink-800/70 py-1 pl-1 pr-4 text-sm font-semibold text-ivory-50 transition hover:border-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
        <Avatar nickname={me.nickname} avatar={me.avatar} size={32} />
        <span className="max-w-[9rem] truncate">{me.nickname}</span>
        <span className="hidden text-gold-300 sm:inline">· {t('common.space')}</span>
      </button>
      </div>
    );
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button variant="ghost" className="whitespace-nowrap px-2 sm:px-3" onClick={() => onAuth('login')}>
        <ProfileIcon size={24} />
        <span className="max-[430px]:sr-only">{t('common.login')}</span>
      </Button>
      <Button variant="secondary" className="hidden px-3 sm:inline-flex" onClick={() => onAuth('register')}>
        {t('common.register')}
      </Button>
    </div>
  );
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
  const { t } = useI18n();
  const connection = useGame((s) => s.connection);
  const view = useGame((s) => s.view);
  if (connection === 'online' || connection === 'idle') return null;
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-950/95 px-4 py-2 text-center text-sm text-amber-100 backdrop-blur">
      <span className="h-2 w-2 animate-pulseRing rounded-full bg-amber-400" />
      {connection === 'connecting' && !view ? t('app.connexion_a_la2') : t('app.connexion_perdue_reconnexion')}
    </div>
  );
}

/** Applique la langue choisie à toute l'application ; le sélecteur reste en haut de page. */
export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

/** Bandeau fin en haut de page : choix de la langue (masqué à la table de poker en direct, pour ne pas gêner le jeu). */
function TopBar() {
  return (
    <div className="topbar-lang mx-auto flex max-w-6xl justify-end px-5 pt-3">
      <LanguageSelect />
    </div>
  );
}

function AppContent() {
  const { t } = useI18n();
  const client = useClient();
  const session = useGame((s) => s.session);
  const view = useGame((s) => s.view);
  const live = useLiveStats(client);
  const closed = useGame((s) => s.closed);
  const toasts = useGame((s) => s.toasts);
  const account = useAccountClient();
  const me = useAccount((s) => s.account);
  const [resetToken] = useState(takeResetToken);
  const [invite] = useState(takeInviteCode);
  const [tableauCode] = useState(takeTableauCode);
  const [tableauVariant, setTableauVariant] = useState<'classic' | 'hand5'>('classic');
  const [screen, setScreen] = useState<Screen>(() => (resetToken ? { auth: 'reset' } : invite ? { auth: 'register' } : tableauCode ? 'tableau' : initialCode() ? 'join' : 'home'));
  const [createVariant, setCreateVariant] = useState<VariantId | undefined>(undefined);
  const [trainVariant, setTrainVariant] = useState<VariantId | undefined>(undefined);
  const [guided, setGuided] = useState(false);
  const [spaceTab, setSpaceTab] = useState<SpaceTab>('profil');
  const [joinCode, setJoinCode] = useState<string>(initialCode);

  useEffect(() => {
    if (!account) return;
    account.onFavoriteOnline = (who) => client.toast('info', t('app.un_de_vos', { nickname: who.nickname }));
    void account.init();
    return () => account.dispose();
  }, [account, client]);

  useEffect(() => {
    client.resume(); // reprise automatique après un rechargement (jeton conservé)
    return () => client.dispose();
  }, [client]);
  useEffect(() => {
    // Écrans de compte préchargés en tâche de fond, une fois l'accueil affiché : ils s'ouvrent ensuite sans attente.
    const t = setTimeout(() => void Promise.all([loadAuth(), loadSpace(), loadBlackjack(), loadTableau(), loadVariants()]).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, []);

  let content;
  if (session) {
    if (!view) {
      content = (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <Panel className="w-full p-8">
            <p className="font-display text-2xl text-ivory-50">{t('app.connexion_a_la', { code: session.code })}</p>
            <p className="mt-2 text-sm text-ivory-200/80">{t('app.votre_siege_vous')}</p>
            <Button variant="ghost" className="mt-5" onClick={() => client.leave()}>
              {t('app.annuler_et_revenir')}</Button>
          </Panel>
        </main>
      );
    } else if (view.status === 'WAITING' || view.status === 'CANCELLED') content = <Lobby />;
    else content = <Table />;
  } else if (typeof screen === 'object') content = <AuthScreen mode={screen.auth} resetToken={resetToken} invite={invite || undefined} onBack={() => setScreen('home')} onDone={() => setScreen('home')} />;
  else if (screen === 'space' && me) content = <Space onBack={() => setScreen('home')} initialTab={spaceTab} />;
  else if (screen === 'blackjack') content = <Blackjack onBack={() => setScreen('home')} onLogin={() => setScreen({ auth: 'login' })} />;
  else if (screen === 'tableau') content = <Tableau onBack={() => setScreen('home')} onLogin={() => setScreen({ auth: 'login' })} initialCode={tableauCode || undefined} initialVariant={tableauVariant} />;
  else if (screen === 'variants')
    content = (
      <Variants
        onBack={() => setScreen('home')}
        onPlaySolo={(v) => {
          setTrainVariant(v);
          setScreen('train');
        }}
        onCreate={(v) => {
          setCreateVariant(v);
          setScreen('create');
        }}
        onLogin={() => setScreen({ auth: 'login' })}
      />
    );
  else if (screen === 'create') content = <CreateRoom onBack={() => setScreen('home')} initialVariant={createVariant} />;
  else if (screen === 'solo')
    content = (
      <Solo
        onBack={() => setScreen('home')}
        onPick={(v) => {
          setTrainVariant(v ?? undefined);
          setScreen('train');
        }}
        onBlackjack={() => setScreen('blackjack')}
        onTableau={(v) => { setTableauVariant(v); setScreen('tableau'); }}
      />
    );
  else if (screen === 'train') content = <TrainingRoom onBack={() => { setGuided(false); setScreen(guided ? 'home' : 'solo'); }} variant={trainVariant} guided={guided} />;
  else if (screen === 'join') content = <JoinRoom onBack={() => setScreen('home')} initialCode={joinCode} />;
  else
    content = (
      <Home
        onCreate={() => {
          setCreateVariant(undefined);
          setScreen('create');
        }}
        onTrain={() => setScreen('solo')}
        onChallenges={me ? () => { setSpaceTab('defis'); setScreen('space'); } : undefined}
        onQuickStart={() => { setTrainVariant('CLOSED_1'); setGuided(true); setScreen('train'); }}
        onVariants={() => setScreen('variants')}
        me={me}
        live={live}
        onSpace={(tab) => { setSpaceTab(tab); setScreen('space'); }}
        langSelect={<LanguageSelect />}
        onBlackjack={() => setScreen('blackjack')}
        onTableau={(v) => { setTableauVariant(v); setScreen('tableau'); }}
        onJoin={(code) => {
          setJoinCode(code ?? '');
          setScreen('join');
        }}
        account={<AccountBar onAuth={(mode) => setScreen({ auth: mode })} onSpace={() => { setSpaceTab('profil'); setScreen('space'); }} />}
        notice={closed === 'KICKED' ? t('notice.kicked') : closed === 'INVALID_SESSION' ? t('notice.invalid') : null}
      />
    );

  return (
    <SettingsProvider>
      <SoundBridge />
      <ConnectionBanner />
      {!(session && view && view.status !== 'WAITING' && view.status !== 'CANCELLED') && screen !== 'home' && <TopBar />}
      <Suspense fallback={<p className="p-8 text-center text-sm text-ivory-300/70" role="status">{t('common.loading')}</p>}>{content}</Suspense>
      <ToastHost toasts={toasts} onDismiss={client.dismissToast} />
    </SettingsProvider>
  );
}
