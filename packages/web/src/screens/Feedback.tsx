import { useEffect, useState } from 'react';
import { Button, Eyebrow, Field, inputClass, Panel, Segmented, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { useAccountClient } from '../lib/context';
import type { FeedbackItem, FeedbackKind } from '../lib/types';

export const FEEDBACK_HASH = '#un-bug';
export const ADMIN_HASH = '#admin-bugs';
const KINDS: readonly FeedbackKind[] = ['bug', 'idea', 'comment'];
const MAX = 2000;
const MIN = 10;

/** « Un bug ? » : un formulaire pour signaler un défaut, proposer une idée ou laisser un commentaire. */
export function FeedbackScreen({ from, onBack, onLegal }: { from: string; onBack: () => void; onLegal?: () => void }) {
  const { t } = useI18n();
  const client = useAccountClient();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const tooShort = message.trim().length < MIN;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!client) throw new Error(t('fb.erreur'));
      await client.sendFeedback({ kind, message: message.trim(), contact: contact.trim() || undefined, where: from });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fb.erreur'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-1 py-4">
      <Button variant="secondary" onClick={onBack}>{t('legal.retour')}</Button>
      <Panel className="p-5 sm:p-8">
        <Eyebrow>Flash Poker</Eyebrow>
        <Title className="mt-1">{t('fb.title')}</Title>
        {sent ? (
          <div role="status" className="mt-5 space-y-4">
            <p className="font-semibold text-jade-300">{t('fb.sent.title')}</p>
            <p className="text-sm text-ivory-100/90">{t('fb.sent.text')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => { setSent(false); setMessage(''); }}>{t('fb.again')}</Button>
              <Button onClick={onBack}>{t('fb.done')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-5" noValidate>
            <p className="text-sm leading-relaxed text-ivory-100/90">{t('fb.intro')}</p>
            <Segmented value={kind} options={KINDS} onChange={setKind} label={t('fb.kind')} format={(k) => t(`fb.kind.${k}` as const)} />
            <Field label={t('fb.message')} htmlFor="fb-message" hint={t('fb.message.hint')}>
              <textarea id="fb-message" className={`${inputClass} min-h-[9rem] resize-y`} value={message} maxLength={MAX} onChange={(e) => setMessage(e.target.value)} />
              <p className="text-right text-xs text-ivory-300/70">{message.length}/{MAX}</p>
            </Field>
            <Field label={t('fb.contact')} htmlFor="fb-contact" hint={t('fb.contact.hint')}>
              <input id="fb-contact" type="email" autoComplete="email" className={inputClass} value={contact} maxLength={254} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <p className="text-xs leading-relaxed text-ivory-300/80">
              {t('fb.privacy')}{' '}
              {onLegal && (
                <button type="button" onClick={onLegal} className="text-gold-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('fb.privacy.lien')}</button>
              )}
            </p>
            {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
            <Button type="submit" disabled={tooShort || busy} className="w-full disabled:opacity-50">{busy ? t('fb.sending') : t('fb.send')}</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}

const KIND_FR: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idée', comment: 'Commentaire' };

/** Messages « Un bug ? » reçus (administrateurs). `token` : jeton d'administration saisi, ou null pour la session du compte. */
export function FeedbackList({ token }: { token: string | null }) {
  const client = useAccountClient();
  const account = client as NonNullable<typeof client>;
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open');

  const load = async () => {
    setError('');
    try {
      setItems(await account.adminFeedback(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const shown = (items ?? []).filter((i) => show === 'all' || i.status === show);

  return (
    <div className="space-y-4">
      <Segmented value={show} options={['open', 'done', 'all'] as const} onChange={setShow} label="Afficher" format={(v) => (v === 'open' ? 'À traiter' : v === 'done' ? 'Traités' : 'Tous')} />
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      {items && shown.length === 0 && <p className="text-sm text-ivory-300/80">Aucun message.</p>}
      <ul className="space-y-3">
        {shown.map((i) => (
          <li key={i.id} className="rounded-2xl border border-ivory-100/10 bg-ink-900/70 p-4">
            <p className="text-xs text-ivory-300/80">
              <strong className="text-gold-300">{KIND_FR[i.kind]}</strong> · {new Date(i.createdAt).toLocaleString('fr-FR')}
              {i.nickname ? ` · ${i.nickname}` : ' · invité'}
              {i.contact ? <> · <a className="text-gold-300 underline" href={`mailto:${i.contact}`}>{i.contact}</a></> : null}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ivory-50">{i.message}</p>
            {i.context && <p className="mt-2 break-words text-[11px] text-ivory-300/60">{i.context}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="!min-h-[36px] !py-1.5" onClick={() => act(() => account.adminFeedbackStatus(token, i.id, i.status === 'open' ? 'done' : 'open'))}>
                {i.status === 'open' ? 'Marquer traité' : 'Rouvrir'}
              </Button>
              <Button variant="ghost" className="!min-h-[36px] !py-1.5" onClick={() => { if (window.confirm('Supprimer ce message ?')) void act(() => account.adminFeedbackDelete(token, i.id)); }}>Supprimer</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
