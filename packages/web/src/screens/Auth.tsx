import { useState, type FormEvent, type ReactNode } from 'react';
import { ProfileIcon } from '../components/Icons3D';
import { AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Title } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAccount, useAccountClient } from '../lib/context';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const NICK_RE = /^[\p{L}\p{N} _.'-]{2,20}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
      {children}
    </p>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={shown ? 'text' : 'password'} className={`${inputClass} pr-24`} value={value} maxLength={128} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {shown ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  );
}

/**
 * Connexion, inscription, mot de passe oublié et nouveau mot de passe (lien reçu par e-mail).
 * `onDone` est appelé une fois connecté.
 */
export function AuthScreen({ mode: initialMode, resetToken, onBack, onDone }: { mode: AuthMode; resetToken?: string; onBack: () => void; onDone: () => void }) {
  const account = useAccountClient();
  const recovery = useAccount((s) => s.passwordRecovery);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [login, setLogin] = useState('');
  const [nickname, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const errors = {
    nickname: NICK_RE.test(nickname.trim()) ? '' : 'Pseudo de 2 à 20 caractères (lettres, chiffres, espace, _ . \' -).',
    email: EMAIL_RE.test(email.trim()) ? '' : 'Adresse e-mail invalide.',
    password: password.length >= 8 ? '' : 'Au moins 8 caractères.',
  };
  const invalid =
    mode === 'login' ? !login.trim() || !password : mode === 'register' ? Boolean(errors.nickname || errors.email || errors.password) : mode === 'forgot' ? Boolean(errors.email) : Boolean(errors.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!account || invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await account.login(login.trim(), password);
      else if (mode === 'register') await account.register({ nickname: nickname.trim(), email: email.trim(), password, avatar });
      else if (mode === 'reset') await account.reset(resetToken ?? '', password);
      else {
        await account.forgot(email.trim());
        setSent(true);
        setBusy(false);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur inattendue est survenue.');
      setBusy(false);
    }
  }

  const titles: Record<AuthMode, [string, string]> = {
    login: ['Mon compte', 'Se connecter'],
    register: ['Nouveau joueur', 'Créer un compte'],
    forgot: ['Mot de passe oublié', 'Recevoir un lien'],
    reset: ['Sécurité', 'Nouveau mot de passe'],
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        ← Retour
      </Button>
      <Panel className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <ProfileIcon size={56} />
          <div>
            <Eyebrow>{titles[mode][0]}</Eyebrow>
            <Title className="mt-1 text-3xl">{titles[mode][1]}</Title>
          </div>
        </div>

        {mode === 'forgot' && sent ? (
          <div className="space-y-4" role="status">
            <p className="text-ivory-100">Si un compte existe avec l’adresse {email.trim()}, un e-mail vient de partir avec un lien valable une heure.</p>
            <p className="text-sm text-ivory-300/80">Pensez à regarder dans les courriers indésirables.</p>
            <Button variant="secondary" className="w-full" onClick={() => switchTo('login')}>
              Revenir à la connexion
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            {mode === 'login' && (
              <Field label="Pseudo ou adresse e-mail" htmlFor="login">
                <input id="login" className={inputClass} value={login} maxLength={254} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
              </Field>
            )}
            {mode === 'register' && (
              <Field label="Pseudo" htmlFor="nick" hint="Il vous est réservé : personne d’autre ne pourra jouer sous ce nom." error={nickname === '' ? '' : errors.nickname}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
            )}
            {(mode === 'register' || mode === 'forgot') && (
              <Field
                label="Adresse e-mail"
                htmlFor="email"
                hint={mode === 'register' ? 'Pour récupérer votre mot de passe et être prévenu quand vos joueurs favoris se connectent. Elle n’est jamais montrée aux autres joueurs.' : undefined}
                error={email === '' ? '' : errors.email}
              >
                <input id="email" type="email" inputMode="email" className={inputClass} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
            )}
            {mode !== 'forgot' && (
              <Field label={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'} htmlFor="password" hint={mode === 'login' ? undefined : 'Au moins 8 caractères.'} error={mode === 'login' || password === '' ? '' : errors.password}>
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>
            )}
            {mode === 'register' && (
              <Field label="Avatar">
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" disabled={invalid || busy} className="w-full py-3.5 text-base">
              {busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : mode === 'forgot' ? 'Envoyer le lien' : 'Enregistrer et me connecter'}
            </Button>
          </form>
        )}

        <div className="mt-6 space-y-2 border-t border-ivory-100/10 pt-5 text-center text-sm">
          {mode === 'login' && (
            <>
              <p className="text-ivory-200/80">
                Pas encore de compte ?{' '}
                <button type="button" className="font-semibold text-gold-300 underline-offset-4 hover:underline" onClick={() => switchTo('register')}>
                  Créer un compte
                </button>
              </p>
              {recovery ? (
                <button type="button" className="text-ivory-300/80 underline-offset-4 hover:underline" onClick={() => switchTo('forgot')}>
                  Mot de passe oublié ?
                </button>
              ) : (
                <p className="text-xs text-ivory-300/60">La récupération du mot de passe par e-mail n’est pas encore activée sur ce serveur.</p>
              )}
            </>
          )}
          {mode !== 'login' && (
            <p className="text-ivory-200/80">
              Déjà inscrit ?{' '}
              <button type="button" className="font-semibold text-gold-300 underline-offset-4 hover:underline" onClick={() => switchTo('login')}>
                Se connecter
              </button>
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}
