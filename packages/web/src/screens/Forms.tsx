import { useState, type FormEvent, useEffect, useRef } from 'react';
import { useAccount, useClient } from '../lib/context';
import { formatChips, STARTING_CHIPS } from '../lib/format';
import { Avatar, AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Segmented, Title } from '../components/ui';
import { VARIANTS } from '../lib/labels';
import type { AccountPrivate, VariantId } from '../lib/types';
import { currentI18n, useI18n } from '../i18n';
import { errorText } from '../lib/tbText';
import { markOnboarded } from '../lib/onboarding';

/** Joueur inscrit : il joue sous le pseudo et l'avatar de son compte (modifiables dans « Mon espace »). */
function AccountIdentity({ me }: { me: AccountPrivate }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2.5">
      <Avatar nickname={me.nickname} avatar={me.avatar} size={40} />
      <p className="text-sm text-ivory-200">
        {t('forms.vous_jouez_sous')} <strong className="text-ivory-50">{me.nickname}</strong>{t('forms.la_partie_sera')}</p>
    </div>
  );
}

/** Variantes injouables à 6 joueurs (donc avec 5 adversaires CPU). */
const NOT_AT_SIX: readonly VariantId[] = ['CLOSED_2', 'LE10'];

const NICK_RE = /^[\p{L}\p{N} _.'-]{1,20}$/u;

/** « 7k2m » ou « poker-7K2M » → « POKER-7K2M ». */
export function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[2-9A-Z]{4}$/.test(s) ? `POKER-${s}` : s;
}

export function CreateRoom({ onBack, initialVariant }: { onBack: () => void; initialVariant?: VariantId }) {
  const { t, tp } = useI18n();
  const client = useClient();
  const me = useAccount((s) => s.account);
  const [name, setName] = useState('');
  const [variant, setVariant] = useState<VariantId | ''>(initialVariant ?? '');
  const [maxPlayers, setMax] = useState(4);
  const [target, setTarget] = useState(3);
  const [stakeChips, setStake] = useState(100);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [assistance, setAssistance] = useState(false);
  const [privateRoom, setPrivate] = useState(true);
  const [teats, setTeats] = useState(0);
  const [sideBets, setSideBets] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = variant ? VARIANTS.find((v) => v.id === variant) : undefined;
  const maxAllowed = variant && NOT_AT_SIX.includes(variant) ? 5 : 6;
  const sizes = [2, 3, 4, 5, 6].filter((n) => n <= maxAllowed);
  const players = Math.min(maxPlayers, maxAllowed);
  const who = me ? me.nickname : nickname.trim();
  const defaultName = who ? t('forms.table_de', { nickname: who }) : t('forms.ma_table');

  const errors = {
    nickname: me || NICK_RE.test(nickname.trim()) ? '' : t('forms.pseudo_de_1'),
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.createRoom({
        name: name.trim() || defaultName,
        maxPlayers: players,
        targetPoints: target,
        stakeChips,
        assistance,
        private: privateRoom,
        nickname: me ? me.nickname : nickname.trim(),
        avatar: me?.avatar ?? avatar,
        ...(variant ? { variant, ...(variant === 'V6_3' ? { teats, sideBets } : {}) } : {}),
      });
    } catch (err) {
      setError(errorText(currentI18n(), err, t('forms.creation_impossible')));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('forms.retour')}</Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>{t('forms.nouvelle_table')}</Eyebrow>
        <Title className="mb-6 mt-1 text-3xl">{t('forms.creer_une_partie')}</Title>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label={t('forms.jeu')} htmlFor="game" hint={info ? `${info.tagline}. ${maxAllowed < 6 ? t('forms.jeu.max5') : ''}`.trim() : t('forms.jeu.libre.hint')}>
            <select
              id="game"
              className={inputClass}
              value={variant}
              onChange={(e) => {
                const v = e.target.value as VariantId | '';
                setVariant(v);
                if (v && NOT_AT_SIX.includes(v)) setMax((m) => Math.min(m, 5));
              }}
            >
              <option value="">{t('forms.jeu.libre')}</option>
              {VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('forms.nombre_de_joueurs')} hint={t('forms.vous_pouvez_demarrer')}>
            <Segmented label={t('forms.nombre_de_joueurs2')} value={players} options={sizes} onChange={setMax} />
          </Field>
          <Field label={t('forms.visibilite')} hint={privateRoom ? t('forms.salle_privee_absente') : t('forms.salle_publique_visible')}>
            <Segmented label={t('forms.visibilite')} value={privateRoom ? 'privee' : 'publique'} options={['privee', 'publique'] as const} onChange={(v) => setPrivate(v === 'privee')} format={(v) => (v === 'privee' ? t('forms.privee') : t('forms.publique'))} />
          </Field>

          <div className="rounded-xl border border-ivory-100/12 bg-ink-900/40">
            <button
              type="button"
              aria-expanded={more}
              aria-controls="create-more"
              onClick={() => setMore((m) => !m)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
            >
              <span>
                <span className="block text-sm font-semibold text-ivory-50">{t('forms.personnaliser')}</span>
                {!more && (
                  <span className="mt-0.5 block text-xs text-ivory-200/85">
                    {t('forms.recap', { goal: tp('lobby.point', target), stake: stakeChips > 0 ? t('forms.recap.stake', { amount: formatChips(stakeChips) }) : t('forms.recap.nostake'), assist: assistance ? t('forms.recap.assist') : t('forms.recap.noassist') })}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className={`text-gold-300 transition ${more ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {more && (
              <div id="create-more" className="space-y-5 border-t border-ivory-100/10 px-4 py-5">
                <Field label={t('forms.nom_de_la')} htmlFor="name" hint={t('forms.nom.hint')}>
                  <input id="name" className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={defaultName} autoComplete="off" />
                </Field>
                <Field label={t('forms.objectif_en_points')} hint={t('forms.le_premier_a')}>
                  <Segmented label={t('forms.objectif_en_points')} value={target} options={[1, 2, 3, 4, 5]} onChange={setTarget} />
                </Field>
                <Field
                  label={t('forms.mise_par_joueur')}
                  hint={t('forms.chaque_joueur_recoit', { formatChips: formatChips(STARTING_CHIPS), extra: stakeChips > 0 ? (" " + t('forms.cagnotte_de_a', { formatChips: formatChips(stakeChips * players), maxPlayers: players })) : (" " + t('forms.sans_mise_la')) })}
                >
                  <Segmented label={t('forms.mise_par_joueur2')} value={stakeChips} options={[0, 50, 100, 200, 500, 1000]} onChange={setStake} format={(v) => (v === 0 ? t('forms.sans') : v.toLocaleString('fr-FR'))} />
                </Field>
                <Field label={t('forms.niveau_de_la')} hint={assistance ? t('forms.chaque_joueur_devra') : t('forms.aucune_indication_chacun')}>
                  <Segmented label={t('forms.niveau_de_la')} value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? t('forms.avec_assistance') : t('forms.sans_assistance'))} />
                </Field>
                {variant === 'V6_3' && (
                  <>
                    <Field label={t('forms.tetines')} hint={t('forms.cartes_supplementaires_qui')}>
                      <Segmented label={t('forms.tetines')} value={teats} options={[0, 1, 2]} onChange={setTeats} />
                    </Field>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-ivory-100">
                      <input type="checkbox" checked={sideBets} onChange={(e) => setSideBets(e.target.checked)} className="mt-1" />
                      {t('forms.paris_exterieurs_sur')}</label>
                  </>
                )}
              </div>
            )}
          </div>

          {me ? (
            <AccountIdentity me={me} />
          ) : (
            <>
              <Field label={t('forms.votre_pseudo')} htmlFor="nick" error={nickname === '' ? '' : errors.nickname}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
              <Field label={t('forms.avatar')}>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
              {error}
            </p>
          )}
          <Button type="submit" disabled={invalid || busy || (!me && !nickname.trim())} className="w-full py-3.5 text-base">
            {busy ? t('forms.creation') : t('forms.creer_la_table')}
          </Button>
        </form>
      </Panel>
    </main>
  );
}

/** Entraînement : une table privée contre des adversaires CPU, démarrée tout de suite (aucune salle d'attente). */

export function TrainingRoom({ onBack, variant, guided = false }: { onBack: () => void; variant?: VariantId; guided?: boolean }) {
  const { t } = useI18n();
  const client = useClient();
  const info = variant ? VARIANTS.find((v) => v.id === variant) : undefined;
  const maxCpu = variant && NOT_AT_SIX.includes(variant) ? 4 : 5;
  const [teats, setTeats] = useState(0);
  const [sideBets, setSideBets] = useState(false);
  const [cpu, setCpu] = useState(guided ? 2 : 3);
  const [target, setTarget] = useState(guided ? 1 : 3);
  const [assistance, setAssistance] = useState(guided);
  const me = useAccount((s) => s.account);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Joueur connecté : son pseudo et son avatar sont repris du compte, rien à saisir.
  const nickOk = Boolean(me) || NICK_RE.test(nickname.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      markOnboarded();
      await client.createRoom({ name: t('forms.entrainement'), maxPlayers: cpu + 1, targetPoints: target, stakeChips: 0, assistance, cpu, nickname: me ? me.nickname : nickname.trim(), avatar: me?.avatar ?? avatar, ...(variant ? { variant, ...(variant === 'V6_3' ? { teats, sideBets } : {}) } : {}) });
    } catch (err) {
      setError(errorText(currentI18n(), err, t('forms.creation_impossible')));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('forms.retour')}</Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>{t('forms.entrainement')}</Eyebrow>
        <Title className="mb-2 mt-1 text-3xl">{info ? t('forms.solo', { name: info.name }) : t('forms.s_entrainer_contre')}</Title>
        <p className="mb-6 text-sm text-ivory-200/85">
          {info
            ? t('forms.chaque_manche_se', { tagline: info.tagline })
            : t('forms.une_table_privee')}
        </p>
        {guided && (
          <div className="mb-6 rounded-xl border border-gold-500/40 bg-ink-900/60 p-4">
            <p className="font-display text-lg text-ivory-50">{t('ob.guide.title')}</p>
            <ol className="mt-3 space-y-2.5">
              {(['ob.step1', 'ob.step2', 'ob.step3'] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-3 text-sm text-ivory-200/90">
                  <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-500/90 text-xs font-bold text-ink-950">{i + 1}</span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label={t('forms.adversaires_cpu')} hint={variant ? (maxCpu === 4 ? t('forms.cette_variante_se') : undefined) : cpu === 5 ? t('forms.a_6_joueurs') : t('forms.a_joueurs_toutes', { n: cpu + 1 })}>
            <Segmented label={t('forms.adversaires_cpu')} value={cpu} options={[1, 2, 3, 4, 5].slice(0, maxCpu)} onChange={setCpu} />
          </Field>
          {variant === 'V6_3' && (
            <>
              <Field label={t('forms.tetines')} hint={t('forms.cartes_supplementaires_qui')}>
                <Segmented label={t('forms.tetines')} value={teats} options={[0, 1, 2]} onChange={setTeats} />
              </Field>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ivory-100">
                <input type="checkbox" checked={sideBets} onChange={(e) => setSideBets(e.target.checked)} className="mt-1" />
                {t('forms.paris_exterieurs_sur')}</label>
            </>
          )}
          <Field label={t('forms.objectif_en_points')} hint={t('forms.le_premier_a2')}>
            <Segmented label={t('forms.objectif_en_points')} value={target} options={[1, 2, 3, 4, 5]} onChange={setTarget} />
          </Field>
          <Field label={t('forms.niveau_de_la')} hint={assistance ? t('forms.le_nom_de') : t('forms.aucune_indication_vous')}>
            <Segmented label={t('forms.niveau_de_la')} value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? t('forms.avec_assistance') : t('forms.sans_assistance'))} />
          </Field>
          {me ? (
            <AccountIdentity me={me} />
          ) : (
            <>
              <Field label={t('forms.votre_pseudo')} htmlFor="nick" error={nickname === '' || nickOk ? '' : t('forms.pseudo_de_1')}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
              <Field label={t('forms.avatar')}>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!nickOk || busy} className="w-full py-3.5 text-base">
            {busy ? t('forms.creation') : t('forms.lancer_l_entrainement')}
          </Button>
        </form>
      </Panel>
    </main>
  );
}

export function JoinRoom({ onBack, initialCode = '' }: { onBack: () => void; initialCode?: string }) {
  const { t } = useI18n();
  const client = useClient();
  const me = useAccount((s) => s.account);
  const [code, setCode] = useState(initialCode);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('emeraude');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = normalizeCode(code);
  const codeOk = /^POKER-[2-9A-Z]{4}$/.test(normalized);
  const nickOk = Boolean(me) || NICK_RE.test(nickname.trim());

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!codeOk || !nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.joinRoom(normalized, { nickname: me ? me.nickname : nickname.trim(), avatar: me?.avatar ?? avatar });
    } catch (err) {
      setError(errorText(currentI18n(), err, t('forms.impossible_de_rejoindre')));
      setBusy(false);
    }
  }

  // Joueur connecté arrivant avec un code valide (salle ouverte, lien d'invitation, code saisi) : il rejoint tout de
  // suite sous son pseudo et son avatar. En cas d'échec (table pleine, code périmé), le formulaire reste là avec l'erreur.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !me || !/^POKER-[2-9A-Z]{4}$/.test(normalizeCode(initialCode))) return;
    auto.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('forms.retour')}</Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>{t('forms.invitation')}</Eyebrow>
        <Title className="mb-6 mt-1 text-3xl">{t('forms.rejoindre_une_partie')}</Title>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label={t('forms.code_de_la')} htmlFor="code" hint={t('forms.format_poker_xxxx')}>
            <input id="code" className={`${inputClass} font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('forms.poker_7k2m')} autoCapitalize="characters" autoComplete="off" />
          </Field>
          {me ? (
            <AccountIdentity me={me} />
          ) : (
            <>
              <Field label={t('forms.votre_pseudo')} htmlFor="nick" error={nickname === '' || nickOk ? '' : t('forms.pseudo_de_1')}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
              <Field label={t('forms.avatar')}>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!codeOk || !nickOk || busy} className="w-full py-3.5 text-base">
            {busy ? t('forms.connexion') : t('forms.rejoindre_la_table')}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
