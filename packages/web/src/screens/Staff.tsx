import { useCallback, useEffect, useState } from 'react';
import { Button, Eyebrow, Field, inputClass, Panel, Title } from '../components/ui';
import { useAccount, useAccountClient } from '../lib/context';
import type { StaffChatMessage, StaffLogItem, StaffMe, StaffStats, StaffUser } from '../lib/types';
import { FeedbackList } from './Feedback';

export const STAFF_HASH = '#admin';
const TOKEN_KEY = 'poker.admin';

type Tab = 'chat' | 'users' | 'messages' | 'announce' | 'log' | 'stats';
const TABS: ReadonlyArray<{ id: Tab; label: string; admin?: boolean }> = [
  { id: 'chat', label: 'Salon' },
  { id: 'users', label: 'Joueurs' },
  { id: 'messages', label: 'Un bug ?', admin: true },
  { id: 'announce', label: 'Annonce', admin: true },
  { id: 'log', label: 'Journal', admin: true },
  { id: 'stats', label: 'Chiffres', admin: true },
];
const ROLE_FR = { user: 'Joueur', moderator: 'Modérateur', admin: 'Administrateur' } as const;
const DURATIONS = [10, 60, 24 * 60, 7 * 24 * 60] as const;
const durationLabel = (m: number): string => (m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} j`);
const when = (t: number): string => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const leftLabel = (s: number): string => (s >= 3600 ? `${Math.ceil(s / 3600)} h` : `${Math.max(1, Math.ceil(s / 60))} min`);

const readToken = (): string => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
const keepToken = (v: string): void => { try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignoré */ } };
const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Erreur');

type Call = <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;

/** Espace de l'équipe du site : modération du salon, joueurs, messages, annonce. Jeton d'administration ou compte de l'équipe. */
export function StaffScreen({ onBack, initialTab = 'chat' }: { onBack: () => void; initialTab?: Tab }) {
  const client = useAccountClient();
  const account = client as NonNullable<typeof client>;
  const sessionRole = useAccount((s) => s.account?.role);
  const [token, setToken] = useState(readToken);
  const [typed, setTyped] = useState('');
  const [me, setMe] = useState<StaffMe | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(initialTab);

  const call: Call = useCallback(<T,>(method: string, path: string, body?: unknown) => account.staff<T>(method, `/staff${path}`, body, token || null), [account, token]);

  // Ouverture : session d'un compte de l'équipe, ou jeton déjà saisi dans cet onglet.
  useEffect(() => {
    if (!token && (!sessionRole || sessionRole === 'user')) return;
    let live = true;
    call<StaffMe>('GET', '/me')
      .then((m) => live && (setMe(m), setError('')))
      .catch((e) => { if (!live) return; setMe(null); setError(errText(e)); if (token) { keepToken(''); setToken(''); } });
    return () => { live = false; };
  }, [token, sessionRole, call]);

  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    if (!v) return;
    keepToken(v);
    setTyped('');
    setToken(v);
  };
  const leave = () => { keepToken(''); setToken(''); setMe(null); };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-4">
      <Button variant="secondary" onClick={onBack}>← Retour</Button>
      <Panel className="p-5 sm:p-8">
        <Eyebrow>Équipe du site</Eyebrow>
        <Title className="mt-1">Administration et modération</Title>
        {!me ? (
          <form onSubmit={enter} className="mt-5 space-y-4">
            <p className="text-sm text-ivory-100/90">Connectez-vous avec un compte de l’équipe, ou saisissez le jeton d’administration. Le jeton n’est gardé que le temps de cet onglet.</p>
            <Field label="Jeton d’administration" htmlFor="adm-token">
              <input id="adm-token" type="password" autoComplete="off" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
            <Button type="submit">Ouvrir</Button>
          </form>
        ) : (
          <div className="mt-4 space-y-5">
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-ivory-200">
              <span>{me.name} · <strong className="text-gold-300">{me.role === 'admin' ? ROLE_FR.admin : ROLE_FR.moderator}</strong></span>
              {token && <button type="button" className="text-xs text-gold-300 underline" onClick={leave}>Oublier le jeton</button>}
            </p>
            <nav aria-label="Rubriques" className="flex flex-wrap gap-2">
              {TABS.filter((t) => !t.admin || me.role === 'admin').map((t) => (
                <button key={t.id} type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)} className={`rounded-full border px-3.5 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${t.id === tab ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-ivory-100/15 text-ivory-200 hover:border-gold-500/50'}`}>
                  {t.label}
                </button>
              ))}
            </nav>
            {tab === 'chat' && <ChatTab call={call} />}
            {tab === 'users' && <UsersTab call={call} me={me} />}
            {tab === 'messages' && me.role === 'admin' && <FeedbackList token={token || null} />}
            {tab === 'announce' && me.role === 'admin' && <AnnounceTab call={call} />}
            {tab === 'log' && me.role === 'admin' && <LogTab call={call} />}
            {tab === 'stats' && me.role === 'admin' && <StatsTab call={call} />}
          </div>
        )}
      </Panel>
    </div>
  );
}

function useLoad<T>(call: Call, path: string, pick: (r: never) => T, every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(pick(await call(('GET'), path) as never)); setError(''); } catch (e) { setError(errText(e)); }
  }, [call, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
    if (!every) return;
    const id = setInterval(() => void load(), every);
    return () => clearInterval(id);
  }, [load, every]);
  return { data, error, load, setError };
}

function Muter({ onMute, disabled }: { onMute: (minutes: number, reason: string) => void; disabled?: boolean }) {
  const [minutes, setMinutes] = useState<number>(DURATIONS[0]);
  const [reason, setReason] = useState('');
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select aria-label="Durée du silence" className={`${inputClass} !min-h-[36px] !w-auto !py-1`} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
        {DURATIONS.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
      </select>
      <input aria-label="Motif" placeholder="Motif (facultatif)" maxLength={200} className={`${inputClass} !min-h-[36px] !w-44 !py-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button variant="secondary" className="!min-h-[36px] !py-1.5" disabled={disabled} onClick={() => onMute(minutes, reason)}>Réduire au silence</Button>
    </span>
  );
}

function ChatTab({ call }: { call: Call }) {
  const { data, error, load, setError } = useLoad<StaffChatMessage[]>(call, '/chat', (r: { messages: StaffChatMessage[] }) => r.messages, 10_000);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(errText(e)); } };
  return (
    <div className="space-y-3">
      <p className="text-xs text-ivory-300/80">Derniers messages du salon de l’accueil (gardés en mémoire, rafraîchis toutes les 10 s). Les invités ne peuvent pas être réduits au silence : seul leur message peut être retiré.</p>
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      {data && data.length === 0 && <p className="text-sm text-ivory-300/80">Le salon est vide.</p>}
      <ul className="space-y-2">
        {(data ?? []).map((m) => (
          <li key={m.id} className="rounded-xl border border-ivory-100/10 bg-ink-900/70 p-3">
            <p className="text-xs text-ivory-300/80"><strong className="text-gold-300">{m.nickname}</strong>{m.registered ? '' : ' (invité)'} · {when(m.at)}</p>
            <p className="mt-1 break-words text-sm text-ivory-50">{m.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="!min-h-[36px] !py-1.5" onClick={() => act(() => call('DELETE', `/chat/${m.id}`))}>Supprimer le message</Button>
              {m.authorId && <Muter onMute={(minutes, reason) => act(() => call('POST', `/users/${m.authorId}/mute`, { minutes, reason }))} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsersTab({ call, me }: { call: Call; me: StaffMe }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [error, setError] = useState('');
  const search = useCallback(async () => {
    try { setUsers((await call<{ users: StaffUser[] }>('GET', `/users?q=${encodeURIComponent(q)}`)).users); setError(''); } catch (e) { setError(errText(e)); }
  }, [call, q]);
  useEffect(() => { const id = setTimeout(() => void search(), 250); return () => clearTimeout(id); }, [search]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await search(); } catch (e) { setError(errText(e)); } };
  const admin = me.role === 'admin';
  return (
    <div className="space-y-3">
      <Field label="Rechercher un joueur" htmlFor="staff-q" hint={admin ? 'Par pseudo ou adresse e-mail.' : 'Par pseudo.'}>
        <input id="staff-q" type="search" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-ivory-100/10 bg-ink-900/70 p-3">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <strong className="text-ivory-50">{u.nickname}</strong>
              {u.role !== 'user' && <span className="text-xs font-semibold text-gold-300">{ROLE_FR[u.role]}</span>}
              {u.muteLeft > 0 && <span className="text-xs text-amber-300">silence encore {Number.isFinite(u.muteLeft) ? leftLabel(u.muteLeft) : 'indéfini'}</span>}
              {u.banned && <span className="text-xs text-ruby-300">suspendu</span>}
            </p>
            <p className="text-xs text-ivory-300/70">Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}{u.club ? ` · club ${u.club}` : ''}{u.email ? ` · ${u.email}` : ''}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Muter onMute={(minutes, reason) => act(() => call('POST', `/users/${u.id}/mute`, { minutes, reason }))} />
              {u.muteLeft > 0 && <Button variant="ghost" className="!min-h-[36px] !py-1.5" onClick={() => act(() => call('DELETE', `/users/${u.id}/mute`))}>Lever le silence</Button>}
              {admin && (u.banned
                ? <Button variant="ghost" className="!min-h-[36px] !py-1.5" onClick={() => act(() => call('DELETE', `/users/${u.id}/ban`))}>Lever la suspension</Button>
                : <Button variant="danger" className="!min-h-[36px] !py-1.5" onClick={() => { const reason = window.prompt(`Suspendre le compte de ${u.nickname} ? Motif (facultatif) :`); if (reason !== null) void act(() => call('POST', `/users/${u.id}/ban`, { reason })); }}>Suspendre</Button>)}
              {admin && (
                <select aria-label={`Rôle de ${u.nickname}`} className={`${inputClass} !min-h-[36px] !w-auto !py-1`} value={u.role} onChange={(e) => act(() => call('POST', `/users/${u.id}/role`, { role: e.target.value }))}>
                  {(['user', 'moderator', 'admin'] as const).map((r) => <option key={r} value={r}>{ROLE_FR[r]}</option>)}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnnounceTab({ call }: { call: Call }) {
  const client = useAccountClient();
  const [text, setText] = useState('');
  const [state, setState] = useState('');
  useEffect(() => { client?.announcement().then((r) => setText(r.text ?? '')).catch(() => undefined); }, [client]);
  const publish = async (value: string) => {
    try { const r = await call<{ text: string | null }>('POST', '/announcement', { text: value }); setText(r.text ?? ''); setState(r.text ? 'Annonce publiée.' : 'Annonce retirée.'); } catch (e) { setState(errText(e)); }
  };
  return (
    <div className="space-y-3">
      <Field label="Annonce affichée en haut de l’accueil" htmlFor="staff-ann" hint="280 caractères au maximum. Laissez vide pour la retirer.">
        <textarea id="staff-ann" className={`${inputClass} min-h-[6rem]`} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => publish(text)}>Publier</Button>
        <Button variant="secondary" onClick={() => publish('')}>Retirer</Button>
      </div>
      {state && <p role="status" className="text-sm text-ivory-200">{state}</p>}
    </div>
  );
}

function LogTab({ call }: { call: Call }) {
  const { data, error } = useLoad<StaffLogItem[]>(call, '/log', (r: { items: StaffLogItem[] }) => r.items);
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      {data && data.length === 0 && <p className="text-sm text-ivory-300/80">Aucune action enregistrée.</p>}
      <ul className="divide-y divide-ivory-100/10 rounded-2xl border border-ivory-100/10 bg-ink-900/60">
        {(data ?? []).map((l) => (
          <li key={l.id} className="px-3 py-2 text-xs text-ivory-200">
            <span className="text-ivory-300/70">{when(l.at)}</span> · <strong className="text-gold-300">{l.actor}</strong> · {l.action}{l.target ? ` · ${l.target}` : ''}{l.detail ? <span className="text-ivory-300/70"> · {l.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAGE = 50;

/** Menu déroulant : liste de tous les joueurs ayant créé un compte, avec moteur de recherche (pseudo ou e-mail). */
export function PlayersDirectory({ total }: { total?: number }) {
  const client = useAccountClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (query: string, offset: number) => {
    setLoading(true);
    try {
      const r = await client!.staff<{ users: StaffUser[]; total: number }>('GET', `/staff/users?q=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`);
      setUsers((prev) => (offset === 0 ? r.users : [...prev, ...r.users]));
      setCount(r.total);
      setError('');
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void fetchPage(q, 0), q ? 250 : 0);
    return () => clearTimeout(id);
  }, [open, q, fetchPage]);

  return (
    <details className="rounded-2xl border border-ivory-100/10 bg-ink-900/50" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ivory-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
        Liste des joueurs inscrits{total !== undefined ? ` (${total.toLocaleString('fr-FR')})` : ''} <span aria-hidden="true" className="text-gold-400">▾</span>
      </summary>
      <div className="space-y-3 border-t border-ivory-100/10 p-4">
        <Field label="Rechercher un joueur" htmlFor="dir-q" hint="Par pseudo ou adresse e-mail.">
          <input id="dir-q" type="search" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
        {count !== null && <p role="status" className="text-xs text-ivory-300/80">{count === 0 ? 'Aucun joueur ne correspond.' : `${count.toLocaleString('fr-FR')} joueur${count > 1 ? 's' : ''}${q ? ' trouvé' + (count > 1 ? 's' : '') : ''}`}</p>}
        <ul className="max-h-96 divide-y divide-ivory-100/10 overflow-y-auto rounded-xl border border-ivory-100/10" aria-label="Joueurs inscrits">
          {users.map((u) => (
            <li key={u.id} className="px-3 py-2 text-sm">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-ivory-50">{u.nickname}</strong>
                {u.role !== 'user' && <span className="text-xs font-semibold text-gold-300">{ROLE_FR[u.role]}</span>}
                {u.banned && <span className="text-xs text-ruby-300">suspendu</span>}
                {u.muteLeft > 0 && <span className="text-xs text-amber-300">silence</span>}
              </p>
              <p className="text-xs text-ivory-300/70">Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}{u.club ? ` · club ${u.club}` : ''}{u.email ? ` · ${u.email}` : ''}</p>
            </li>
          ))}
        </ul>
        {count !== null && users.length < count && (
          <Button variant="secondary" disabled={loading} onClick={() => void fetchPage(q, users.length)}>Afficher plus</Button>
        )}
      </div>
    </details>
  );
}

/** Rubrique « Administration » de Mon espace : nombre de comptes créés et indicateurs clés, avec accès au panneau complet. */
export function AdminOverview({ onOpenPanel }: { onOpenPanel: () => void }) {
  const client = useAccountClient();
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    client?.staff<StaffStats>('GET', '/staff/stats').then((r) => live && setStats(r)).catch((e) => live && setError(errText(e)));
    return () => { live = false; };
  }, [client]);
  const more: Array<[string, number | undefined]> = [['Nouveaux comptes (7 jours)', stats?.newThisWeek], ['Équipe de modération', stats?.staff], ['Silences en cours', stats?.mutes], ['Comptes suspendus', stats?.bans], ['Messages « Un bug ? » à traiter', stats?.feedbackOpen]];
  return (
    <section aria-label="Administration" className="space-y-5">
      <div>
        <h2 className="font-display text-2xl text-ivory-50">Administration</h2>
        <p className="mt-1 text-sm text-ivory-200/85">Vue d’ensemble du site, réservée aux administrateurs.</p>
      </div>
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      <div className="rounded-2xl border border-gold-500/40 bg-gold-500/10 p-5" data-testid="comptes-crees">
        <p className="text-sm text-ivory-200">Joueurs ayant créé un compte</p>
        <p className="mt-1 font-display text-5xl text-gold-200">{stats ? stats.accounts.toLocaleString('fr-FR') : '…'}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {more.map(([label, v]) => (
          <div key={label} className="rounded-xl border border-ivory-100/10 bg-ink-900/70 p-3">
            <dt className="text-xs text-ivory-300/80">{label}</dt>
            <dd className="mt-1 font-display text-2xl text-ivory-50">{v === undefined ? '…' : v.toLocaleString('fr-FR')}</dd>
          </div>
        ))}
      </dl>
      <PlayersDirectory total={stats?.accounts} />
      <Button onClick={onOpenPanel}>Ouvrir le panneau de gestion</Button>
    </section>
  );
}

function StatsTab({ call }: { call: Call }) {
  const { data, error } = useLoad<StaffStats>(call, '/stats', (r: StaffStats) => r);
  const cells: Array<[string, number | undefined]> = [['Comptes', data?.accounts], ['Nouveaux (7 jours)', data?.newThisWeek], ['Équipe', data?.staff], ['Silences en cours', data?.mutes], ['Comptes suspendus', data?.bans], ['Messages « Un bug ? » à traiter', data?.feedbackOpen]];
  return (
    <div>
      {error && <p role="alert" className="text-sm text-ruby-300">{error}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cells.map(([label, v]) => (
          <div key={label} className="rounded-xl border border-ivory-100/10 bg-ink-900/70 p-3">
            <dt className="text-xs text-ivory-300/80">{label}</dt>
            <dd className="mt-1 font-display text-2xl text-ivory-50">{v ?? '…'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Bandeau d'annonce du site (accueil) : texte rédigé par un administrateur, masquable pour la session. */
export function AnnouncementBanner() {
  const client = useAccountClient();
  const [text, setText] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(() => { try { return sessionStorage.getItem('poker.ann'); } catch { return null; } });
  useEffect(() => {
    let live = true;
    client?.announcement().then((r) => live && setText(r.text)).catch(() => undefined);
    return () => { live = false; };
  }, [client]);
  if (!text || hidden === text) return null;
  return (
    <p role="status" className="flex items-start justify-between gap-3 rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-sm text-ivory-50">
      <span>{text}</span>
      <button type="button" aria-label="Masquer l’annonce" className="text-gold-300 hover:text-gold-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400" onClick={() => { setHidden(text); try { sessionStorage.setItem('poker.ann', text); } catch { /* ignoré */ } }}>×</button>
    </p>
  );
}
