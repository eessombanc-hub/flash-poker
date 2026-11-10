import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ProfileIcon } from '../components/Icons3D';
import { Avatar, AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Title } from '../components/ui';
import type { AccountPublic } from '../lib/types';
import { useAccount, useAccountClient } from '../lib/context';
import { currentI18n, useI18n } from '../i18n';
import { errorText } from '../lib/tbText';

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
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={shown ? 'text' : 'password'} className={`${inputClass} pr-24`} value={value} maxLength={128} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? t('auth.masquer_le_mot') : t('auth.afficher_le_mot')}
        className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {shown ? t('auth.masquer') : t('auth.afficher')}
      </button>
    </div>
  );
}

/**
 * Connexion, inscription, mot de passe oublié et nouveau mot de passe (lien reçu par e-mail).
 * `onDone` est appelé une fois connecté.
 */
export function AuthScreen({ mode: initialMode, resetToken, invite, onBack, onDone }: { mode: AuthMode; resetToken?: string; invite?: string; onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
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
  const [inviter, setInviter] = useState<AccountPublic | null>(null);

  useEffect(() => {
    if (!account || !invite) return;
    let alive = true;
    account.inviteInfo(invite).then((who) => alive && setInviter(who), () => undefined); // lien périmé : inscription normale
    return () => {
      alive = false;
    };
  }, [account, invite]);

  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const errors = {
    nickname: NICK_RE.test(nickname.trim()) ? '' : t('auth.pseudo_de_2'),
    email: EMAIL_RE.test(email.trim()) ? '' : t('auth.adresse_e_mail2'),
    password: password.length >= 8 ? '' : t('auth.au_moins_8'),
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
      else if (mode === 'register') await account.register({ nickname: nickname.trim(), email: email.trim(), password, avatar, ...(invite ? { invite } : {}) });
      else if (mode === 'reset') await account.reset(resetToken ?? '', password);
      else {
        await account.forgot(email.trim());
        setSent(true);
        setBusy(false);
        return;
      }
      onDone();
    } catch (err) {
      setError(errorText(currentI18n(), err, t('auth.une_erreur_inattendue')));
      setBusy(false);
    }
  }

  const titles: Record<AuthMode, [string, string]> = {
    login: [t('auth.mon_compte'), t('auth.se_connecter')],
    register: [t('auth.nouveau_joueur'), t('auth.creer_un_compte')],
    forgot: [t('auth.mot_de_passe2'), t('auth.recevoir_un_lien')],
    reset: [t('auth.securite'), t('auth.nouveau_mot_de')],
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('auth.retour')}</Button>
      <Panel className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <ProfileIcon size={56} />
          <div>
            <Eyebrow>{titles[mode][0]}</Eyebrow>
            <Title className="mt-1 text-3xl">{titles[mode][1]}</Title>
          </div>
        </div>

        {inviter && mode === 'register' && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-3" role="note">
            <Avatar nickname={inviter.nickname} avatar={inviter.avatar} size={40} />
            <p className="text-sm text-ivory-100">
              <strong className="text-gold-200">{inviter.nickname}</strong>  {t('auth.vous_invite_a')}</p>
          </div>
        )}
        {mode === 'forgot' && sent ? (
          <div className="space-y-4" role="status">
            <p className="text-ivory-100">{t('auth.si_un_compte', { trim: email.trim() })}</p>
            <p className="text-sm text-ivory-300/80">{t('auth.pensez_a_regarder')}</p>
            <Button variant="secondary" className="w-full" onClick={() => switchTo('login')}>
              {t('auth.revenir_a_la')}</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            {mode === 'login' && (
              <Field label={t('auth.pseudo_ou_adresse')} htmlFor="login">
                <input id="login" className={inputClass} value={login} maxLength={254} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
              </Field>
            )}
            {mode === 'register' && (
              <Field label={t('auth.pseudo')} htmlFor="nick" hint={t('auth.il_vous_est')} error={nickname === '' ? '' : errors.nickname}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
            )}
            {(mode === 'register' || mode === 'forgot') && (
              <Field
                label={t('auth.adresse_e_mail')}
                htmlFor="email"
                hint={mode === 'register' ? t('auth.pour_recuperer_votre') : undefined}
                error={email === '' ? '' : errors.email}
              >
                <input id="email" type="email" inputMode="email" className={inputClass} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
            )}
            {mode !== 'forgot' && (
              <Field label={mode === 'reset' ? t('auth.nouveau_mot_de') : t('auth.mot_de_passe3')} htmlFor="password" hint={mode === 'login' ? undefined : t('auth.au_moins_8')} error={mode === 'login' || password === '' ? '' : errors.password}>
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>
            )}
            {mode === 'register' && (
              <Field label={t('auth.avatar')}>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" disabled={invalid || busy} className="w-full py-3.5 text-base">
              {busy ? t('auth.un_instant') : mode === 'login' ? t('auth.se_connecter') : mode === 'register' ? t('auth.creer_mon_compte') : mode === 'forgot' ? t('auth.envoyer_le_lien') : t('auth.enregistrer_et_me')}
            </Button>
          </form>
        )}

        <div className="mt-6 space-y-2 border-t border-ivory-100/10 pt-5 text-center text-sm">
          {mode === 'login' && (
            <>
              <p className="text-ivory-200/80">
                {t('auth.pas_encore_de')}{' '}
                <button type="button" className="font-semibold text-gold-300 underline-offset-4 hover:underline" onClick={() => switchTo('register')}>
                  {t('auth.creer_un_compte')}</button>
              </p>
              {recovery ? (
                <button type="button" className="text-ivory-300/80 underline-offset-4 hover:underline" onClick={() => switchTo('forgot')}>
                  {t('auth.mot_de_passe')}</button>
              ) : (
                <p className="text-xs text-ivory-300/60">{t('auth.la_recuperation_du')}</p>
              )}
            </>
          )}
          {mode !== 'login' && (
            <p className="text-ivory-200/80">
              {t('auth.deja_inscrit')}{' '}
              <button type="button" className="font-semibold text-gold-300 underline-offset-4 hover:underline" onClick={() => switchTo('login')}>
                {t('auth.se_connecter')}</button>
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}
