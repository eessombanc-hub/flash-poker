import { AdminOverview } from './Staff';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BellIcon, ChipsIcon, JoinIcon, ProfileIcon, StarIcon, StatsIcon, TrophyIcon } from '../components/Icons3D';
import { RecoveryCodeBox } from '../components/RecoveryCode';
import { AvatarUpload } from '../components/AvatarUpload';
import { Avatar, AvatarPicker, Badge, Button, Eyebrow, Field, inputClass, Panel, Segmented } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAccount, useAccountClient } from '../lib/context';
import { formatChips, formatSignedChips } from '../lib/format';
import { variantName } from '../lib/labels';
import type { Device, AccountPublic, Bankroll, InviteOverview, FavoritePlayer, FavoriteRound, GameDetail, GameSummary, VariantStats, Wallet } from '../lib/types';
import { RoundList } from './Overlays';
import { EngagementPanel } from '../components/Engagement';
import { RewardsPanel } from '../components/Rewards';
import { RankingsPanel } from '../components/Rankings';
import { VariantProgress } from '../components/VariantProgress';
import { currentI18n, locale, tr, useI18n } from '../i18n';
import { errorText } from '../lib/tbText';

export type SpaceTab = 'classement' | 'profil' | 'historique' | 'statistiques' | 'manches' | 'bankroll' | 'favoris' | 'inviter' | 'defis' | 'recompenses' | 'admin';
const TABS: { id: SpaceTab; label: string; icon: (size: number) => ReactNode }[] = [
  { id: 'defis', get label() { return tr('eg.tab'); }, icon: (s) => <TrophyIcon size={s} /> },
  { id: 'recompenses', get label() { return tr('rw.tab'); }, icon: (s) => <TrophyIcon size={s} /> },
  { id: 'classement', get label() { return tr('rk.tab'); }, icon: (s) => <TrophyIcon size={s} /> },
  { id: 'profil', get label() { return tr('space.tab.profil'); }, icon: (s) => <ProfileIcon size={s} /> },
  { id: 'historique', get label() { return tr('space.tab.historique'); }, icon: (s) => <TrophyIcon size={s} /> },
  { id: 'statistiques', get label() { return tr('space.tab.statistiques'); }, icon: (s) => <StatsIcon size={s} /> },
  { id: 'manches', get label() { return tr('space.tab.manches'); }, icon: (s) => <StarIcon size={s} /> },
  { id: 'bankroll', get label() { return tr('space.tab.bankroll'); }, icon: (s) => <ChipsIcon size={s} /> },
  { id: 'favoris', get label() { return tr('space.tab.favoris'); }, icon: (s) => <BellIcon size={s} /> },
  { id: 'inviter', get label() { return tr('space.tab.inviter'); }, icon: (s) => <JoinIcon size={s} /> },
];

/** Rubrique réservée aux administrateurs (ajoutée à la liste pour eux seuls). */
const ADMIN_TAB: (typeof TABS)[number] = { id: 'admin', label: 'Administration', icon: (s) => <StatsIcon size={s} /> };

const dateFmt = (): Intl.DateTimeFormat => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayFmt = (): Intl.DateTimeFormat => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
const message = (e: unknown): string => errorText(currentI18n(), e);
const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)} %`);

/** Charge une donnée de l'espace joueur ; `reload` la rafraîchit après une modification. */
function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    let alive = true;
    ref.current().then(
      (d) => alive && (setData(d), setError(null)),
      (e) => alive && setError(message(e)),
    );
    return () => {
      alive = false;
    };
  }, [n]);
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

function State({ error, empty, children }: { error: string | null; empty?: string | false; children?: ReactNode }) {
  if (error) return <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">{error}</p>;
  if (empty) return <p className="rounded-xl border border-dashed border-ivory-100/15 px-4 py-8 text-center text-sm text-ivory-300/75">{empty}</p>;
  return <>{children}</>;
}
const Loading = () => { const { t, tp } = useI18n(); return <p className="py-6 text-center text-sm text-ivory-300/70" role="status">{t('space.chargement')}</p>; };
const Notice = ({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${tone === 'ok' ? 'border border-jade-500/40 bg-jade-950/50 text-jade-100' : 'border border-ruby-500/50 bg-ruby-950/60 text-ruby-100'}`}>
    {children}
  </p>
);

/** Espace personnel du joueur inscrit. */
export function Space({ onBack, initialTab = 'profil', onStaff }: { onBack: () => void; initialTab?: SpaceTab; onStaff?: () => void }) {
  const { t, tp } = useI18n();
  const me = useAccount((s) => s.account);
  const [tab, setTab] = useState<SpaceTab>(initialTab);
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!me) return null;
  const tabs = me.role === 'admin' ? [...TABS, ADMIN_TAB] : TABS;

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length]!;
    setTab(t.id);
    refs.current[t.id]?.focus();
  };

  return (
    <div className="min-h-[calc(100dvh-3rem)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Button variant="ghost" onClick={onBack} className="-ml-3">
          {t('space.accueil')}</Button>
        <span className="flex min-w-0 items-center gap-2 text-sm text-ivory-200">
          <Avatar nickname={me.nickname} avatar={me.avatar} size={32} />
          <span className="truncate">{me.nickname}</span>
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-12">
        <Eyebrow>{t('space.mon_espace')}</Eyebrow>
        <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">{t('space.bonjour', { nickname: me.nickname })}</h1>
        <div className="mt-6 grid gap-5 lg:grid-cols-[15rem_1fr]">
          <div role="tablist" aria-label={t('space.rubriques_de_mon')} aria-orientation="vertical" onKeyDown={onKey} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
            {tabs.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${id}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[13px] font-semibold sm:text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${
                  tab === t.id ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ivory-100/10 bg-ink-800/60 text-ivory-200 hover:border-ivory-100/30'
                }`}
              >
                {t.icon(28)}
                {t.label}
              </button>
            ))}
          </div>
          <Panel className="min-w-0 p-5 sm:p-6" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
            {tab === 'defis' && <EngagementPanel />}
            {tab === 'recompenses' && <RewardsPanel />}
            {tab === 'classement' && <RankingsPanel />}
            {tab === 'profil' && <ProfileTab />}
            {tab === 'historique' && <HistoryTab />}
            {tab === 'statistiques' && <StatsTab />}
            {tab === 'manches' && <FavoriteRoundsTab />}
            {tab === 'bankroll' && <BankrollTab />}
            {tab === 'favoris' && <FavoritesTab />}
            {tab === 'inviter' && <InviteTab />}
            {tab === 'admin' && me.role === 'admin' && <AdminOverview onOpenPanel={() => onStaff?.()} />}
          </Panel>
        </div>
      </main>
    </div>
  );
}

const H2 = ({ children }: { children: ReactNode }) => <h2 className="font-display text-2xl text-ivory-50">{children}</h2>;
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold-400">{children}</h3>;

// ---------- Profil ----------
/** Appareils de confiance : où le compte est connecté, avec déconnexion à distance. */
function DevicesSection() {
  const { t } = useI18n();
  const account = useAccountClient()!;
  const [list, setList] = useState<Device[] | null>(null);
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const load = useCallback(() => {
    account.devices().then(setList, () => setList([]));
  }, [account]);
  useEffect(load, [load]);
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  async function revoke(id: string) {
    setState(null);
    try {
      await account.revokeDevice(id);
      setState({ tone: 'ok', text: t('dev.revoked') });
      load();
    } catch (err) {
      setState({ tone: 'error', text: message(err) });
    }
  }
  async function revokeOthers() {
    setState(null);
    try {
      await account.revokeOtherDevices();
      setState({ tone: 'ok', text: t('dev.revoked') });
      load();
    } catch (err) {
      setState({ tone: 'error', text: message(err) });
    }
  }
  return (
    <section className="space-y-3 border-t border-ivory-100/10 pt-6" aria-labelledby="sp-dev">
      <H3>{t('dev.title')}</H3>
      <p id="sp-dev" className="text-sm text-ivory-200/80">{t('dev.intro')}</p>
      {list && (
        <ul className="space-y-2" aria-label={t('dev.title')}>
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ivory-100/10 bg-ink-900/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-ivory-50">
                  {d.label} {d.current && <Badge>{t('dev.current')}</Badge>}
                </p>
                <p className="text-xs text-ivory-300/80">
                  {t('dev.lastSeen', { date: fmt(d.lastSeen || d.createdAt) })} · {d.trusted ? t('dev.trusted', { date: fmt(d.expiresAt) }) : t('dev.short')}
                </p>
              </div>
              {!d.current && (
                <Button variant="secondary" onClick={() => void revoke(d.id)} aria-label={`${t('dev.revoke')} ${d.label}`}>
                  {t('dev.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {state && <Notice tone={state.tone}>{state.text}</Notice>}
      {list && list.length > 1 && (
        <Button variant="secondary" onClick={() => void revokeOthers()}>
          {t('dev.revokeOthers')}
        </Button>
      )}
    </section>
  );
}

function ProfileTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const me = useAccount((s) => s.account)!;
  const [nickname, setNick] = useState(me.nickname);
  const [club, setClub] = useState(me.club ?? '');
  const [avatar, setAvatar] = useState(me.avatar ?? 'or');
  const [avState, setAvState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // Un changement d'avatar (modèle ou avatar personnalisé) est enregistré aussitôt : plus besoin du bouton du profil.
  async function saveAvatar(next: string) {
    setAvState(null);
    try {
      await account.updateProfile({ avatar: next });
      setAvState({ tone: 'ok', text: t('sp.av.saved') });
    } catch (err) {
      setAvState({ tone: 'error', text: message(err) });
    }
  }
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [mail, setMail] = useState({ email: me.email, password: '' });
  const [mailState, setMailState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pwd, setPwd] = useState({ current: '', next: '' });
  const [pwdState, setPwdState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [rec, setRec] = useState<{ password: string; code: string | null; exists: boolean | null; error: string | null }>({ password: '', code: null, exists: null, error: null });
  useEffect(() => {
    let alive = true;
    account.hasRecoveryCode().then((exists) => alive && setRec((r) => ({ ...r, exists })), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);
  async function newCode(e: FormEvent) {
    e.preventDefault();
    try {
      const code = await account.newRecoveryCode(rec.password);
      setRec({ password: '', code, exists: true, error: null });
    } catch (err) {
      setRec((r) => ({ ...r, error: message(err) }));
    }
  }
  const [del, setDel] = useState({ open: false, password: '' });
  const [dataState, setDataState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function downloadData() {
    try {
      const data = await account.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flash-poker-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
      setDataState({ tone: 'ok', text: t('space.le_fichier_de') });
    } catch (err) {
      setDataState({ tone: 'error', text: message(err) });
    }
  }
  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    try {
      await account.deleteAccount(del.password);
    } catch (err) {
      setDataState({ tone: 'error', text: message(err) });
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await account.updateProfile({ nickname: nickname.trim(), avatar, club: club.trim() || null });
      setState({ tone: 'ok', text: t('space.profil_enregistre_il') });
    } catch (err) {
      setState({ tone: 'error', text: message(err) });
    }
  }
  async function saveMail(e: FormEvent) {
    e.preventDefault();
    try {
      await account.changeEmail(mail.email.trim(), mail.password);
      setMail((m) => ({ ...m, password: '' }));
      setMailState({ tone: 'ok', text: t('space.adresse_e_mail3') });
    } catch (err) {
      setMailState({ tone: 'error', text: message(err) });
    }
  }
  async function savePwd(e: FormEvent) {
    e.preventDefault();
    try {
      await account.changePassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '' });
      setPwdState({ tone: 'ok', text: t('space.mot_de_passe4') });
    } catch (err) {
      setPwdState({ tone: 'error', text: message(err) });
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={saveProfile} className="space-y-4">
        <H2>{t('space.profil')}</H2>
        <Field label={t('space.pseudo')} htmlFor="sp-nick">
          <input id="sp-nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
        </Field>
        <Field label={t('club.label')} htmlFor="sp-club" hint={t('club.hint')}>
          <input id="sp-club" className={inputClass} value={club} maxLength={30} placeholder={t('club.placeholder')} onChange={(e) => setClub(e.target.value)} autoComplete="organization" />
        </Field>
        <section aria-label={t('sp.av.title')} className="space-y-4 rounded-2xl border border-gold-500/25 bg-ink-900/40 p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <Avatar nickname={nickname || me.nickname} avatar={avatar} size={88} />
            <div className="min-w-0">
              <h3 className="font-display text-lg text-ivory-50">{t('sp.av.title')}</h3>
              <p className="text-sm text-ivory-200/80">{t('sp.av.text')}</p>
            </div>
          </div>
          <Field label={t('space.avatar')}>
            <AvatarPicker value={avatar} onChange={(v) => { setAvatar(v); void saveAvatar(v); }} />
          </Field>
          <Field label={t('avu.label')}>
            <AvatarUpload
              current={avatar}
              upload={async (jpeg) => {
                const updated = await account.uploadAvatar(jpeg);
                setAvatar(updated.avatar ?? 'or');
              }}
              onRemove={async () => {
                await account.updateProfile({ avatar: 'or' });
                setAvatar('or');
              }}
            />
          </Field>
          {avState && <Notice tone={avState.tone}>{avState.text}</Notice>}
        </section>
        {state && <Notice tone={state.tone}>{state.text}</Notice>}
        <Button type="submit" disabled={nickname.trim().length < 2}>
          {t('space.enregistrer_le_profil')}</Button>
      </form>

      <section className="space-y-3 border-t border-ivory-100/10 pt-6" aria-label={t('space.alertes_par_e')}>
        <H3>{t('space.alertes_par_e')}</H3>
        <p className="text-sm text-ivory-200/80">{t('space.quand_un_de')}</p>
        <Segmented label={t('space.alertes_par_e')} value={me.notifyEmail ? 'oui' : 'non'} options={['oui', 'non'] as const} format={(v) => (v === 'oui' ? t('space.activees') : t('space.desactivees'))} onChange={(v) => void account.updateProfile({ notifyEmail: v === 'oui' }).catch(() => undefined)} />
      </section>

      <form onSubmit={saveMail} className="space-y-4 border-t border-ivory-100/10 pt-6">
        <H3>{t('space.adresse_e_mail')}</H3>
        <Field label={t('space.adresse_e_mail')} htmlFor="sp-mail">
          <input id="sp-mail" type="email" className={inputClass} value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label={t('space.mot_de_passe')} htmlFor="sp-mail-pwd">
          <input id="sp-mail-pwd" type="password" className={inputClass} value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} autoComplete="current-password" />
        </Field>
        {mailState && <Notice tone={mailState.tone}>{mailState.text}</Notice>}
        <Button type="submit" variant="secondary" disabled={!mail.password || mail.email.trim() === me.email}>
          {t('space.changer_d_adresse')}</Button>
      </form>

      <form onSubmit={savePwd} className="space-y-4 border-t border-ivory-100/10 pt-6">
        <H3>{t('space.mot_de_passe2')}</H3>
        <Field label={t('space.mot_de_passe3')} htmlFor="sp-cur">
          <input id="sp-cur" type="password" className={inputClass} value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label={t('space.nouveau_mot_de')} htmlFor="sp-next" hint={t('space.au_moins_8')}>
          <input id="sp-next" type="password" className={inputClass} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" />
        </Field>
        {pwdState && <Notice tone={pwdState.tone}>{pwdState.text}</Notice>}
        <Button type="submit" variant="secondary" disabled={!pwd.current || pwd.next.length < 8}>
          {t('space.changer_le_mot')}</Button>
      </form>

      <DevicesSection />

      <form onSubmit={newCode} className="space-y-4 border-t border-ivory-100/10 pt-6" aria-labelledby="sp-rec">
        <H3>{t('rec.space_title')}</H3>
        <p id="sp-rec" className="text-sm text-ivory-200/80">
          {rec.exists === false ? t('rec.space_none') : t('rec.space_intro')}
        </p>
        {rec.code ? (
          <div className="space-y-3" role="status">
            <RecoveryCodeBox code={rec.code} />
            <p className="text-sm text-ivory-300/80">{t('rec.issued_warn')}</p>
          </div>
        ) : (
          <>
            <Field label={t('space.mot_de_passe3')} htmlFor="sp-rec-pwd">
              <input id="sp-rec-pwd" type="password" className={inputClass} value={rec.password} onChange={(e) => setRec({ ...rec, password: e.target.value, error: null })} autoComplete="current-password" />
            </Field>
            {rec.error && <Notice tone="error">{rec.error}</Notice>}
            <Button type="submit" variant="secondary" disabled={!rec.password}>
              {rec.exists === false ? t('rec.space_make') : t('rec.space_renew')}
            </Button>
          </>
        )}
      </form>

      <section className="space-y-4 border-t border-ivory-100/10 pt-6" aria-labelledby="sp-data">
        <H3>{t('space.mes_donnees')}</H3>
        <p id="sp-data" className="text-sm text-ivory-100/70">
          {t('space.vous_pouvez_recuperer')}</p>
        <Button variant="secondary" onClick={() => void downloadData()}>
          {t('space.telecharger_mes_donnees')}</Button>
        {!del.open ? (
          <div>
            <Button variant="danger" onClick={() => setDel({ open: true, password: '' })}>
              {t('space.supprimer_mon_compte')}</Button>
          </div>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-3 rounded-lg border border-red-400/30 p-4">
            <p className="text-sm text-ivory-100/80">{t('space.cette_action_est')}</p>
            <Field label={t('space.mot_de_passe2')} htmlFor="sp-del">
              <input id="sp-del" type="password" className={inputClass} value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} autoComplete="current-password" />
            </Field>
            <div className="flex gap-3">
              <Button type="submit" variant="danger" disabled={!del.password}>
                {t('space.supprimer_definitivement')}</Button>
              <Button type="button" variant="secondary" onClick={() => setDel({ open: false, password: '' })}>
                {t('space.annuler')}</Button>
            </div>
          </form>
        )}
        {dataState && <Notice tone={dataState.tone}>{dataState.text}</Notice>}
      </section>

      <div className="border-t border-ivory-100/10 pt-6">
        <Button variant="danger" onClick={() => void account.logout()}>
          {t('space.se_deconnecter')}</Button>
      </div>
    </div>
  );
}

// ---------- Historique ----------
function HistoryTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.games);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <H2>{t('space.historique_des_parties')}</H2>
      <p className="mt-1 text-sm text-ivory-300/80">{t('space.parties_terminees_de')}</p>
      <div className="mt-4">
        {data === null && !error ? (
          <Loading />
        ) : (
          <State error={error} empty={data?.length === 0 && t('space.aucune_partie_terminee')}>
            <ul className="space-y-2">
              {data?.map((g) => (
                <li key={g.id}>
                  <GameRow game={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />
                </li>
              ))}
            </ul>
          </State>
        )}
      </div>
    </div>
  );
}

function GameRow({ game, open, onToggle }: { game: GameSummary; open: boolean; onToggle: () => void }) {
  const { t, tp } = useI18n();
  return (
    <div className="rounded-xl border border-ivory-100/10 bg-ink-900/50">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
        <span className="min-w-0">
          <span className="block font-semibold text-ivory-50">
            {game.name} {game.won && <span className="align-middle"><Badge tone="gold">{t('space.victoire')}</Badge></span>}
          </span>
          <span className="block text-xs text-ivory-300/75">
            {tp('space.manche', game.rounds, { format: dateFmt().format(game.endedAt), opponents: game.opponents.join(', ') || '—' })}
          </span>
        </span>
        <span className={`font-display text-lg ${game.netChips > 0 ? 'text-jade-300' : game.netChips < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedChips(game.netChips)}</span>
      </button>
      {open && <GameDetailView id={game.id} />}
    </div>
  );
}

function GameDetailView({ id }: { id: string }) {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error } = useLoad(() => account.game(id));
  const [favs, setFavs] = useState<Set<number>>(new Set());
  const [favPlayers, setFavPlayers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data) setFavs(new Set(data.favoriteRounds));
  }, [data]);
  useEffect(() => {
    account.favorites().then((f) => setFavPlayers(new Set(f.map((p) => p.nickname.toLowerCase()))), () => undefined);
  }, [account]);
  if (error) return <div className="px-4 pb-4"><State error={error} /></div>;
  if (!data) return <Loading />;
  const nameOf = (pid: string) => data.players.find((p) => p.playerId === pid)?.nickname ?? t('space.un_joueur');
  const toggle = (roundNo: number) => {
    const on = favs.has(roundNo);
    const next = new Set(favs);
    if (on) next.delete(roundNo);
    else next.add(roundNo);
    setFavs(next);
    (on ? account.removeFavoriteRound(id, roundNo) : account.addFavoriteRound(id, roundNo)).catch(() => setFavs(favs));
  };
  return (
    <div className="border-t border-ivory-100/10 px-4 pb-4 pt-3">
      <Standings game={data} nameOf={nameOf} favPlayers={favPlayers} onFavorite={(n) => account.addFavorite(n).then(() => setFavPlayers(new Set([...favPlayers, n.toLowerCase()])), () => undefined)} />
      <RoundList history={data.history} nameOf={nameOf} star={{ isOn: (n) => favs.has(n), toggle }} />
    </div>
  );
}

function Standings({ game, nameOf, favPlayers, onFavorite }: { game: GameDetail; nameOf: (id: string) => string; favPlayers: Set<string>; onFavorite: (nickname: string) => void }) {
  const { t, tp } = useI18n();
  const winner = game.outcome.winner;
  const others = game.players.filter((p) => p.playerId !== game.you && p.accountId && game.seated.includes(p.playerId));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ivory-100">
        <TrophyIcon size={22} className="mr-1 inline align-[-5px]" />  {t('space.vainqueur')} <strong className="text-gold-200">{nameOf(winner)}</strong>{t('space.cagnotte', { formatChips: formatChips(game.outcome.settlement.potChips) })}</p>
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-ivory-300/80">
          {t('space.joueurs_inscrits')} {others.map((p) =>
            favPlayers.has(p.nickname.toLowerCase()) ? (
              <Badge key={p.playerId} tone="gold">★ {p.nickname}</Badge>
            ) : (
              <button key={p.playerId} type="button" onClick={() => onFavorite(p.nickname)} className="rounded-full border border-gold-500/50 px-2.5 py-0.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                {t('space.ajouter_aux_favoris', { nickname: p.nickname })}</button>
            ),
          )}
        </p>
      )}
    </div>
  );
}

// ---------- Statistiques ----------
function StatsTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.stats);
  const best = data?.variants.reduce<VariantStats | null>((b, v) => (v.played >= 3 && (!b || v.won / v.played > b.won / b.played) ? v : b), null);
  return (
    <div>
      <H2>{t('vi.progression_title')}</H2>
      {data === null && !error ? (
        <Loading />
      ) : (
        <State error={error} empty={data?.games === 0 && t('space.vos_statistiques_apparaitront')}>
          {data && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label={t('space.parties')} value={String(data.games)} />
                <Kpi label={t('space.parties_gagnees')} value={`${data.gamesWon} (${pct(data.gamesWon, data.games)})`} />
                <Kpi label={t('space.manches_jouees')} value={String(data.variants.reduce((a, v) => a + v.played, 0))} />
                <Kpi label={t('space.meilleure_variante')} value={best ? variantName(best.variant) : '—'} hint={best ? undefined : t('space.des_3_manches')} />
              </dl>
              <ul className="mt-5 grid gap-3 md:grid-cols-2" aria-label={t('space.manches_jouees_gagnees')}>
                {data.variants.map((v) => (
                  <li key={v.variant} className="rounded-2xl border border-ivory-100/10 bg-ink-900/50 p-4">
                    <h3 className="mb-3 font-display text-xl text-ivory-50">{variantName(v.variant)}</h3>
                    <VariantProgress stats={v} />
                    <p className="mt-3 text-xs text-ivory-300/65">{tp('vi.pts', v.points)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ivory-300/65">{t('space.une_manche_compte')}</p>
            </>
          )}
        </State>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2.5">
      <dt className="text-xs text-ivory-300/75">{label}</dt>
      <dd className="mt-0.5 font-display text-xl text-ivory-50">{value}</dd>
      {hint && <dd className="text-[11px] text-ivory-300/60">{hint}</dd>}
    </div>
  );
}

// ---------- Manches favorites ----------
function FavoriteRoundsTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error, reload } = useLoad(account.favoriteRounds);
  return (
    <div>
      <H2>{t('space.manches_favorites')}</H2>
      <p className="mt-1 text-sm text-ivory-300/80">{t('space.marquez_une_manche')}</p>
      <div className="mt-4">
        {data === null && !error ? (
          <Loading />
        ) : (
          <State error={error} empty={data?.length === 0 && t('space.aucune_manche_favorite')}>
            <ul className="space-y-3">
              {data?.map((f: FavoriteRound) => (
                <li key={`${f.gameId}-${f.round.roundNo}`} className="rounded-xl border border-ivory-100/10 bg-ink-900/40 px-3 pb-3 pt-2">
                  <p className="text-xs text-ivory-300/75">
                    {f.gameName} · {dayFmt().format(f.endedAt)}
                  </p>
                  <RoundList
                    history={[f.round]}
                    nameOf={(pid) => f.players.find((p) => p.playerId === pid)?.nickname ?? t('space.un_joueur')}
                    star={{ isOn: () => true, toggle: () => void account.removeFavoriteRound(f.gameId, f.round.roundNo).then(reload, () => undefined) }}
                  />
                </li>
              ))}
            </ul>
          </State>
        )}
      </div>
    </div>
  );
}

// ---------- Bankroll ----------
function BankrollTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.bankroll);
  const { data: wallet } = useLoad(account.wallet);
  return (
    <div>
      <H2>{t('space.bankroll')}</H2>
      {wallet && <WalletCard wallet={wallet} />}
      <p className="mt-1 text-sm text-ivory-300/80">{t('space.bilan_de_vos')}</p>
      {data === null && !error ? (
        <Loading />
      ) : (
        <State error={error} empty={data?.games === 0 && t('space.votre_courbe_demarrera')}>
          {data && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Kpi label={t('space.bilan_total')} value={formatSignedChips(data.totalChips)} />
                <Kpi label={t('space.parties')} value={String(data.games)} />
                <Kpi label={t('space.meilleure_partie')} value={formatSignedChips(Math.max(...data.series.map((s) => s.netChips)))} />
              </dl>
              <BankrollChart bankroll={data} />
            </>
          )}
        </State>
      )}
    </div>
  );
}

/** Solde du portefeuille et, sous le seuil, heure de la prochaine recharge. */
export function WalletCard({ wallet }: { wallet: Wallet }) {
  const { t, tp } = useI18n();
  const low = wallet.nextRefillAt !== null;
  const when = low ? new Date(wallet.nextRefillAt!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <section aria-label={t('space.portefeuille')} className="mt-3 rounded-xl border border-gold-500/40 bg-gold-500/10 p-3">
      <p className="text-xs text-gold-300">{t('space.portefeuille')}</p>
      <p className="font-display text-2xl text-ivory-50" data-testid="wallet-balance">{formatChips(wallet.balance)}</p>
      <p className="mt-1 text-xs text-ivory-200/85">
        {low
          ? t('space.solde_sous_recharge', { formatChips: formatChips(wallet.threshold), formatChips2: formatChips(wallet.refillTo), when: when ?? '', hours: wallet.refillDelayMs / 3_600_000 })
          : t('space.vous_avez_recu', { formatChips: formatChips(wallet.startingChips), formatChips2: formatChips(wallet.threshold), formatChips3: formatChips(wallet.refillTo), hours: wallet.refillDelayMs / 3_600_000 })}
      </p>
    </section>
  );
}

/** Courbe du bilan cumulé, partie après partie (ligne zéro marquée). */
export function BankrollChart({ bankroll }: { bankroll: Bankroll }) {
  const { t, tp } = useI18n();
  const pts = [{ cumulativeChips: 0, endedAt: 0, name: t('space.depart'), netChips: 0 }, ...bankroll.series];
  const W = 640;
  const H = 220;
  const P = { l: 56, r: 12, t: 12, b: 28 };
  const vals = pts.map((p) => p.cumulativeChips);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 100;
  const x = (i: number) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cumulativeChips).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = bankroll.totalChips;
  const color = last >= 0 ? '#5bc79f' : '#ef6a73';
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tp('space.bilan_cumule_sur', bankroll.games, { games: bankroll.games, formatSignedChips: formatSignedChips(last) })}>
        <defs>
          <linearGradient id="bk-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[max, (max + min) / 2, min].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity="0.07" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#c9c2b2">
              {formatChips(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="#c9a25a" strokeOpacity="0.6" strokeDasharray="4 4" />
        <path d={area} fill="url(#bk-area)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (i === 0 ? null : <circle key={i} cx={x(i)} cy={y(p.cumulativeChips)} r="3.5" fill={color} />))}
        <text x={P.l} y={H - 8} fontSize="11" fill="#c9c2b2">
          {t('space.depart')}</text>
        <text x={W - P.r} y={H - 8} fontSize="11" fill="#c9c2b2" textAnchor="end">
          {pts.length > 1 ? dayFmt().format(pts[pts.length - 1]!.endedAt) : ''}
        </text>
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>{t('space.bilan_partie_par')}</caption>
          <tbody>
            {bankroll.series.map((s, i) => (
              <tr key={i}>
                <td>{s.name}</td>
                <td>{formatSignedChips(s.netChips)}</td>
                <td>{formatSignedChips(s.cumulativeChips)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

// ---------- Joueurs favoris ----------
function FavoritesTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const { data, error, reload } = useLoad(account.favorites);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AccountPublic[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => account.search(q.trim()).then(setResults, () => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q, account]);

  useEffect(() => {
    const id = setInterval(reload, 30_000); // statut « en ligne » rafraîchi
    return () => clearInterval(id);
  }, [reload]);

  const add = async (nickname: string) => {
    setAddError(null);
    try {
      await account.addFavorite(nickname);
      setQ('');
      reload();
    } catch (e) {
      setAddError(message(e));
    }
  };
  const known = new Set((data ?? []).map((f) => f.id));

  return (
    <div>
      <H2>{t('space.joueurs_favoris')}</H2>
      <p className="mt-1 text-sm text-ivory-300/80">{t('space.vous_etes_prevenu')}</p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void add(q.trim());
        }}
      >
        <Field label={t('space.ajouter_un_joueur')} htmlFor="fav-q" hint={t('space.tapez_au_moins')}>
          <input id="fav-q" className={inputClass} value={q} maxLength={20} onChange={(e) => setQ(e.target.value)} autoComplete="off" role="combobox" aria-expanded={results.length > 0} aria-controls="fav-results" aria-autocomplete="list" />
        </Field>
        {results.length > 0 && (
          <ul id="fav-results" role="listbox" aria-label={t('space.joueurs_trouves')} className="mt-2 divide-y divide-ivory-100/10 rounded-xl border border-ivory-100/10 bg-ink-900/70">
            {results.map((u) => (
              <li key={u.id} role="option" aria-selected={false} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2">
                  <Avatar nickname={u.nickname} avatar={u.avatar} size={28} />
                  {u.nickname}
                </span>
                {known.has(u.id) ? (
                  <Badge tone="gold">{t('space.deja_favori')}</Badge>
                ) : (
                  <Button variant="secondary" className="min-h-[36px] px-3 py-1" onClick={() => void add(u.nickname)}>
                    {t('space.ajouter')}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {addError && <div className="mt-2"><Notice tone="error">{addError}</Notice></div>}
      </form>
      <div className="mt-5">
        {data === null && !error ? (
          <Loading />
        ) : (
          <State error={error} empty={data?.length === 0 && t('space.aucun_favori_pour')}>
            <ul className="space-y-2" aria-label={t('space.mes_joueurs_favoris')}>
              {data?.map((f: FavoritePlayer) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative">
                      <Avatar nickname={f.nickname} avatar={f.avatar} size={36} />
                      <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-ink-900 ${f.online ? 'bg-jade-400' : 'bg-ink-500'}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ivory-50">{f.nickname}</span>
                      <span className={`block text-xs ${f.online ? 'text-jade-300' : 'text-ivory-300/70'}`}>{f.online ? t('space.en_ligne') : t('space.hors_ligne')}</span>
                    </span>
                  </span>
                  <Button variant="ghost" className="min-h-[36px] px-3 py-1 text-ruby-300" onClick={() => void account.removeFavorite(f.id).then(reload, () => undefined)} aria-label={t('space.retirer_des_favoris', { nickname: f.nickname })}>
                    {t('space.retirer')}</Button>
                </li>
              ))}
            </ul>
          </State>
        )}
      </div>
    </div>
  );
}

// ---------- Inviter des amis ----------
function InviteTab() {
  const { t, tp } = useI18n();
  const account = useAccountClient()!;
  const me = useAccount((s) => s.account)!;
  const { data, error, reload } = useLoad(account.invites);
  const [overview, setOverview] = useState<InviteOverview | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const info = overview ?? data;
  const link = info ? `${window.location.origin}/?invitation=${info.code}` : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  const share = () =>
    void navigator.share({ title: t('space.flash_poker'), text: t('space.vous_invite_a', { nickname: me.nickname }), url: link }).catch(() => undefined);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setState(null);
    try {
      setOverview(await account.inviteByEmail(email.trim()));
      setState({ tone: 'ok', text: t('space.invitation_envoyee_a', { trim: email.trim() }) });
      setEmail('');
    } catch (err) {
      setState({ tone: 'error', text: message(err) });
      reload();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <H2>{t('space.inviter_des_amis')}</H2>
        <p className="mt-1 text-sm text-ivory-300/80">{t('space.votre_invite_cree')}</p>
      </div>
      {!info ? (
        error ? <State error={error} /> : <Loading />
      ) : (
        <>
          <section aria-label={t('space.mon_lien_d')} className="space-y-3">
            <H3>{t('space.mon_lien_d')}</H3>
            <p className="text-sm text-ivory-200/85">{t('space.a_envoyer_par')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={link} aria-label={t('space.lien_d_invitation')} className={`${inputClass} font-mono text-xs sm:text-sm`} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex gap-2">
                <Button onClick={() => void copy()} className="flex-1 sm:flex-none">
                  {copied ? t('space.lien_copie') : t('space.copier')}
                </Button>
                {canShare && (
                  <Button variant="secondary" onClick={share} className="flex-1 sm:flex-none">
                    {t('space.partager')}</Button>
                )}
              </div>
            </div>
            <span role="status" className="sr-only">{copied ? t('space.lien_copie_dans') : ''}</span>
          </section>

          <section aria-label={t('space.invitation_par_e')} className="space-y-3 border-t border-ivory-100/10 pt-6">
            <H3>{t('space.par_e_mail')}</H3>
            {info.mailEnabled ? (
              <form onSubmit={send} className="space-y-3" noValidate>
                <Field label={t('space.adresse_e_mail2')} htmlFor="inv-mail" hint={tp('space.flash_poker_lui', info.remainingToday, { remainingToday: info.remainingToday })}>
                  <input id="inv-mail" type="email" inputMode="email" className={inputClass} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                </Field>
                {state && <Notice tone={state.tone}>{state.text}</Notice>}
                <Button type="submit" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || info.remainingToday === 0}>
                  {busy ? t('space.envoi') : t('space.envoyer_l_invitation')}
                </Button>
              </form>
            ) : (
              <p className="rounded-xl border border-dashed border-ivory-100/15 px-4 py-3 text-sm text-ivory-300/80">{t('space.l_envoi_d')}</p>
            )}
            {info.sent.length > 0 && (
              <ul className="space-y-1.5" aria-label={t('space.invitations_envoyees')}>
                {info.sent.map((i) => (
                  <li key={`${i.email}-${i.sentAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-900/50 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ivory-100">{i.email}</span>
                    <span className="flex items-center gap-2 text-xs text-ivory-300/75">
                      {dayFmt().format(i.sentAt)}
                      {i.joinedAs ? <Badge tone="green">{t('space.inscrit', { joinedAs: i.joinedAs })}</Badge> : <Badge>{t('space.en_attente')}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t('space.amis_inscrits_grace')} className="space-y-3 border-t border-ivory-100/10 pt-6">
            <H3>{t('space.amis_inscrits_grace2', { n: info.joined.length })}</H3>
            {info.joined.length === 0 ? (
              <p className="text-sm text-ivory-300/75">{t('space.personne_pour_l')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {info.joined.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 rounded-full border border-ivory-100/10 bg-ink-900/50 py-1 pl-1 pr-3 text-sm text-ivory-100">
                    <Avatar nickname={u.nickname} avatar={u.avatar} size={26} />
                    {u.nickname}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

