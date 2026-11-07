import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useAccount, useClient } from '../lib/context';
import { formatChips } from '../lib/format';
import { Avatar, AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Segmented, Title } from '../components/ui';
import type { AccountPrivate } from '../lib/types';

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
  const wallet = useAccount((s) => s.wallet);
  const [stakeChoice, setStake] = useState(10);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [assistance, setAssistance] = useState(false);
  const [privateRoom, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sans compte, la table se joue sans jetons (les mises exigent un portefeuille).
  const stakeChips = me ? stakeChoice : 0;
  const errors = {
    name: name.trim() ? '' : 'Donnez un nom à la table.',
    nickname: me || NICK_RE.test(nickname.trim()) ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).',
    stake: !wallet || stakeChips <= wallet.chips ? '' : `Vous avez ${formatChips(wallet.chips)} : choisissez une mise plus petite.`,
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
          {me ? (
            <Field
              label="Mise par joueur (jetons)"
              hint={errors.stake ? undefined : stakeChips === 0 ? 'Partie amicale, sans jetons : ouverte aussi aux joueurs sans compte.' : `Cagnotte : ${formatChips(stakeChips * maxPlayers)} à ${maxPlayers} joueurs. Chaque joueur doit avoir un compte.${wallet ? ` Votre solde : ${formatChips(wallet.chips)}.` : ''}`}
              error={errors.stake}
            >
              <Segmented label="Mise par joueur" value={stakeChoice} options={[0, 10, 25, 50, 100, 250]} onChange={setStake} format={(v) => (v === 0 ? 'Sans' : String(v))} />
            </Field>
          ) : (
            <p className="rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2.5 text-sm text-ivory-200">
              Sans compte, la partie se joue sans jetons. Créez un compte gratuit pour recevoir 100 jetons et jouer avec des mises.
            </p>
          )}
          <Field label="Niveau de la partie" hint={assistance ? 'Chaque joueur devra approuver l’assistance dans la salle d’attente ; sans l’accord de tous, la partie se jouera sans assistance.' : 'Aucune indication : chacun juge seul la force de sa main.'}>
            <Segmented label="Niveau de la partie" value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? 'Avec assistance' : 'Sans assistance')} />
          </Field>
          <Field label="Visibilité" hint={privateRoom ? 'Salle privée : absente des « Parties ouvertes ». Seules les personnes à qui vous donnez le code ou le lien d’invitation peuvent entrer.' : 'Salle publique : visible de tous dans « Parties ouvertes ».'}>
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
