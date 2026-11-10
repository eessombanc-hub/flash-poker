import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useAccount, useClient } from '../lib/context';
import { formatChips, STARTING_CHIPS } from '../lib/format';
import { Avatar, AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Segmented, Title } from '../components/ui';
import { VARIANTS } from '../lib/labels';
import type { AccountPrivate, VariantId } from '../lib/types';

/** Joueur inscrit : il joue sous le pseudo et l'avatar de son compte (modifiables dans « Mon espace »). */
function AccountIdentity({ me }: { me: AccountPrivate }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2.5">
      <Avatar nickname={me.nickname} avatar={me.avatar} size={40} />
      <p className="text-sm text-ivory-200">
        Vous jouez sous le pseudo <strong className="text-ivory-50">{me.nickname}</strong>. La partie sera ajoutée à votre historique.
      </p>
    </div>
  );
}

const NICK_RE = /^[\p{L}\p{N} _.'-]{1,20}$/u;

/** « 7k2m » ou « poker-7K2M » → « POKER-7K2M ». */
export function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[2-9A-Z]{4}$/.test(s) ? `POKER-${s}` : s;
}

export function CreateRoom({ onBack }: { onBack: () => void }) {
  const client = useClient();
  const me = useAccount((s) => s.account);
  const [name, setName] = useState('');
  const [maxPlayers, setMax] = useState(4);
  const [target, setTarget] = useState(3);
  const [stakeChips, setStake] = useState(100);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [assistance, setAssistance] = useState(false);
  const [privateRoom, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = {
    name: name.trim() ? '' : 'Donnez un nom à la table.',
    nickname: me || NICK_RE.test(nickname.trim()) ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).',
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.createRoom({ name: name.trim(), maxPlayers, targetPoints: target, stakeChips, assistance, private: privateRoom, nickname: me ? me.nickname : nickname.trim(), avatar: me?.avatar ?? avatar });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        ← Retour
      </Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>Nouvelle table</Eyebrow>
        <Title className="mb-6 mt-1 text-3xl">Créer une partie</Title>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Nom de la table" htmlFor="name" error={name === '' ? '' : errors.name}>
            <input id="name" className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Vendredi soir" autoComplete="off" />
          </Field>
          <Field label="Nombre de joueurs (maximum)" hint="Vous pouvez démarrer dès 2 joueurs ; ce maximum limite aussi les arrivées en cours de partie.">
            <Segmented label="Nombre de joueurs" value={maxPlayers} options={[2, 3, 4, 5, 6]} onChange={setMax} />
          </Field>
          <Field label="Objectif en points" hint="Le premier à atteindre l’objectif remporte la cagnotte.">
            <Segmented label="Objectif en points" value={target} options={[1, 2, 3, 4, 5]} onChange={setTarget} />
          </Field>
          <Field
            label="Mise par joueur (jetons)"
            hint={`Chaque joueur reçoit ${formatChips(STARTING_CHIPS)} au début de la partie ; la mise est prise sur cette cave.${stakeChips > 0 ? ` Cagnotte de ${formatChips(stakeChips * maxPlayers)} à ${maxPlayers} joueurs.` : ' Sans mise, la partie se joue pour les points seulement.'}`}
          >
            <Segmented label="Mise par joueur" value={stakeChips} options={[0, 50, 100, 200, 500, 1000]} onChange={setStake} format={(v) => (v === 0 ? 'Sans' : v.toLocaleString('fr-FR'))} />
          </Field>
          <Field label="Niveau de la partie" hint={assistance ? 'Chaque joueur devra approuver l’assistance dans la salle d’attente ; sans l’accord de tous, la partie se jouera sans assistance.' : 'Aucune indication. Chacun juge seul la force de sa main.'}>
            <Segmented label="Niveau de la partie" value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? 'Avec assistance' : 'Sans assistance')} />
          </Field>
          <Field label="Visibilité" hint={privateRoom ? 'Salle privée. Absente des « Parties ouvertes ». Seules les personnes à qui vous donnez le code ou le lien d’invitation peuvent entrer.' : 'Salle publique. Visible de tous dans « Parties ouvertes ».'}>
            <Segmented label="Visibilité" value={privateRoom ? 'privee' : 'publique'} options={['publique', 'privee'] as const} onChange={(v) => setPrivate(v === 'privee')} format={(v) => (v === 'privee' ? 'Privée' : 'Publique')} />
          </Field>
          {me ? (
            <AccountIdentity me={me} />
          ) : (
            <>
              <Field label="Votre pseudo" htmlFor="nick" error={nickname === '' ? '' : errors.nickname}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
              <Field label="Avatar">
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
              {error}
            </p>
          )}
          <Button type="submit" disabled={invalid || busy} className="w-full py-3.5 text-base">
            {busy ? 'Création…' : 'Créer la table'}
          </Button>
        </form>
      </Panel>
    </main>
  );
}

/** Entraînement : une table privée contre des adversaires CPU, démarrée tout de suite (aucune salle d'attente). */
/** Variantes injouables à 6 joueurs (donc avec 5 adversaires CPU). */
const NOT_AT_SIX: readonly VariantId[] = ['CLOSED_2', 'LE10'];

export function TrainingRoom({ onBack, variant }: { onBack: () => void; variant?: VariantId }) {
  const client = useClient();
  const info = variant ? VARIANTS.find((v) => v.id === variant) : undefined;
  const maxCpu = variant && NOT_AT_SIX.includes(variant) ? 4 : 5;
  const [teats, setTeats] = useState(0);
  const [sideBets, setSideBets] = useState(false);
  const [cpu, setCpu] = useState(3);
  const [target, setTarget] = useState(3);
  const [assistance, setAssistance] = useState(false);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nickOk = NICK_RE.test(nickname.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.createRoom({ name: 'Entraînement', maxPlayers: cpu + 1, targetPoints: target, stakeChips: 0, assistance, cpu, nickname: nickname.trim(), avatar, ...(variant ? { variant, ...(variant === 'V6_3' ? { teats, sideBets } : {}) } : {}) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        ← Retour
      </Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>Entraînement</Eyebrow>
        <Title className="mb-2 mt-1 text-3xl">{info ? `Solo, ${info.name}` : 'S’entraîner contre le CPU'}</Title>
        <p className="mb-6 text-sm text-ivory-200/85">
          {info
            ? `${info.tagline}. Chaque manche se joue dans cette variante, sans mise, contre des adversaires gérés par l’ordinateur. Ils jouent avec les mêmes règles que vous et ne voient jamais vos cartes.`
            : 'Une table privée, prête tout de suite et sans mise. Les CPU jouent avec les mêmes règles que vous et ne voient jamais vos cartes. Ils choisissent la variante au hasard quand vient leur tour et refusent toute assurance.'}
        </p>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Adversaires CPU" hint={variant ? (maxCpu === 4 ? 'Cette variante se joue jusqu’à 5 joueurs.' : undefined) : cpu === 5 ? 'À 6 joueurs, Le 10 et le Poker fermé à 2 changes ne sont pas jouables.' : `À ${cpu + 1} joueurs, toutes les variantes sont jouables.`}>
            <Segmented label="Adversaires CPU" value={cpu} options={[1, 2, 3, 4, 5].slice(0, maxCpu)} onChange={setCpu} />
          </Field>
          {variant === 'V6_3' && (
            <>
              <Field label="Tétines" hint="Cartes supplémentaires qui glissent de ligne en ligne.">
                <Segmented label="Tétines" value={teats} options={[0, 1, 2]} onChange={setTeats} />
              </Field>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ivory-100">
                <input type="checkbox" checked={sideBets} onChange={(e) => setSideBets(e.target.checked)} className="mt-1" />
                Paris extérieurs sur les lignes
              </label>
            </>
          )}
          <Field label="Objectif en points" hint="Le premier à atteindre l’objectif gagne la partie.">
            <Segmented label="Objectif en points" value={target} options={[1, 2, 3, 4, 5]} onChange={setTarget} />
          </Field>
          <Field label="Niveau de la partie" hint={assistance ? 'Le nom de votre combinaison s’affiche pendant que vous choisissez vos cartes.' : 'Aucune indication. Vous jugez seul la force de votre main.'}>
            <Segmented label="Niveau de la partie" value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? 'Avec assistance' : 'Sans assistance')} />
          </Field>
          <Field label="Votre pseudo" htmlFor="nick" error={nickname === '' || nickOk ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).'}>
            <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
          </Field>
          <Field label="Avatar">
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!nickOk || busy} className="w-full py-3.5 text-base">
            {busy ? 'Création…' : 'Lancer l’entraînement'}
          </Button>
        </form>
      </Panel>
    </main>
  );
}

export function JoinRoom({ onBack, initialCode = '' }: { onBack: () => void; initialCode?: string }) {
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codeOk || !nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.joinRoom(normalized, { nickname: me ? me.nickname : nickname.trim(), avatar: me?.avatar ?? avatar });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de rejoindre la partie.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        ← Retour
      </Button>
      <Panel className="p-6 sm:p-8">
        <Eyebrow>Invitation</Eyebrow>
        <Title className="mb-6 mt-1 text-3xl">Rejoindre une partie</Title>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Code de la partie" htmlFor="code" hint="Format POKER-XXXX, communiqué par l’hôte.">
            <input id="code" className={`${inputClass} font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="POKER-7K2M" autoCapitalize="characters" autoComplete="off" />
          </Field>
          {me ? (
            <AccountIdentity me={me} />
          ) : (
            <>
              <Field label="Votre pseudo" htmlFor="nick" error={nickname === '' || nickOk ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).'}>
                <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
              </Field>
              <Field label="Avatar">
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
            {busy ? 'Connexion…' : 'Rejoindre la table'}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
