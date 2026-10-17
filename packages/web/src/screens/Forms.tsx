import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useClient } from '../lib/context';
import { formatEuros } from '../lib/format';
import { AvatarPicker, Button, Eyebrow, Field, inputClass, Panel, Segmented, Title } from '../components/ui';

const NICK_RE = /^[\p{L}\p{N} _.'-]{1,20}$/u;

/** « 7k2m » ou « poker-7K2M » → « POKER-7K2M ». */
export function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[2-9A-Z]{4}$/.test(s) ? `POKER-${s}` : s;
}

export function CreateRoom({ onBack }: { onBack: () => void }) {
  const client = useClient();
  const [name, setName] = useState('');
  const [maxPlayers, setMax] = useState(4);
  const [target, setTarget] = useState(3);
  const [stake, setStake] = useState('20');
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('or');
  const [assistance, setAssistance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stakeNumber = Number(stake.replace(',', '.'));
  const stakeCents = Math.round(stakeNumber * 100);
  const errors = {
    name: name.trim() ? '' : 'Donnez un nom à la table.',
    nickname: NICK_RE.test(nickname.trim()) ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).',
    stake: stake.trim() !== '' && Number.isFinite(stakeNumber) && stakeCents >= 0 && stakeCents <= 1_000_000 ? '' : 'Mise de 0 à 10 000 €.',
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.createRoom({ name: name.trim(), maxPlayers, targetPoints: target, stakeCents, assistance, nickname: nickname.trim(), avatar });
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
          <Field label="Mise par joueur (€)" htmlFor="stake" hint={errors.stake ? undefined : `Cagnotte virtuelle : ${formatEuros(stakeCents * maxPlayers)} à ${maxPlayers} joueurs. Aucun paiement réel.`} error={errors.stake}>
            <input id="stake" className={inputClass} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
          </Field>
          <Field label="Niveau de la partie" hint={assistance ? 'Chaque joueur devra approuver l’assistance dans la salle d’attente ; sans l’accord de tous, la partie se jouera sans assistance.' : 'Aucune indication : chacun juge seul la force de sa main.'}>
            <Segmented label="Niveau de la partie" value={assistance ? 'avec' : 'sans'} options={['sans', 'avec'] as const} onChange={(v) => setAssistance(v === 'avec')} format={(v) => (v === 'avec' ? 'Avec assistance' : 'Sans assistance')} />
          </Field>
          <Field label="Votre pseudo" htmlFor="nick" error={nickname === '' ? '' : errors.nickname}>
            <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
          </Field>
          <Field label="Avatar">
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-100">
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
  const [code, setCode] = useState(initialCode);
  const [nickname, setNick] = useState('');
  const [avatar, setAvatar] = useState('emeraude');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = normalizeCode(code);
  const codeOk = /^POKER-[2-9A-Z]{4}$/.test(normalized);
  const nickOk = NICK_RE.test(nickname.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codeOk || !nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.joinRoom(normalized, { nickname: nickname.trim(), avatar });
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
          <Field label="Votre pseudo" htmlFor="nick" error={nickname === '' || nickOk ? '' : 'Pseudo de 1 à 20 caractères (lettres, chiffres, espace, _ . \' -).'}>
            <input id="nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
          </Field>
          <Field label="Avatar">
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg border border-ruby-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-100">
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
