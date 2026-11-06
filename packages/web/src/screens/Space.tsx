import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BellIcon, ChipsIcon, ProfileIcon, StarIcon, StatsIcon, TrophyIcon } from '../components/Icons3D';
import { Avatar, AvatarPicker, Badge, Button, Eyebrow, Field, inputClass, Panel, Segmented } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAccount, useAccountClient } from '../lib/context';
import { formatEuros, formatSignedEuros } from '../lib/format';
import { variantName } from '../lib/labels';
import type { AccountPublic, Bankroll, FavoritePlayer, FavoriteRound, GameDetail, GameSummary, VariantStats } from '../lib/types';
import { RoundList } from './Overlays';

export type SpaceTab = 'profil' | 'historique' | 'statistiques' | 'manches' | 'bankroll' | 'favoris';
const TABS: { id: SpaceTab; label: string; icon: (size: number) => ReactNode }[] = [
  { id: 'profil', label: 'Profil', icon: (s) => <ProfileIcon size={s} /> },
  { id: 'historique', label: 'Historique', icon: (s) => <TrophyIcon size={s} /> },
  { id: 'statistiques', label: 'Statistiques', icon: (s) => <StatsIcon size={s} /> },
  { id: 'manches', label: 'Manches favorites', icon: (s) => <StarIcon size={s} /> },
  { id: 'bankroll', label: 'Bankroll', icon: (s) => <ChipsIcon size={s} /> },
  { id: 'favoris', label: 'Joueurs favoris', icon: (s) => <BellIcon size={s} /> },
];

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur inattendue est survenue.');
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
const Loading = () => <p className="py-6 text-center text-sm text-ivory-300/70" role="status">Chargement…</p>;
const Notice = ({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${tone === 'ok' ? 'border border-jade-500/40 bg-jade-950/50 text-jade-100' : 'border border-ruby-500/50 bg-ruby-950/60 text-ruby-100'}`}>
    {children}
  </p>
);

/** Espace personnel du joueur inscrit. */
export function Space({ onBack, initialTab = 'profil' }: { onBack: () => void; initialTab?: SpaceTab }) {
  const me = useAccount((s) => s.account);
  const [tab, setTab] = useState<SpaceTab>(initialTab);
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!me) return null;

  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length]!;
    setTab(t.id);
    refs.current[t.id]?.focus();
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Button variant="ghost" onClick={onBack} className="-ml-3">
          ← Accueil
        </Button>
        <span className="flex min-w-0 items-center gap-2 text-sm text-ivory-200">
          <Avatar nickname={me.nickname} avatar={me.avatar} size={32} />
          <span className="truncate">{me.nickname}</span>
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-12">
        <Eyebrow>Mon espace</Eyebrow>
        <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">Bonjour {me.nickname}</h1>
        <div className="mt-6 grid gap-5 lg:grid-cols-[15rem_1fr]">
          <div role="tablist" aria-label="Rubriques de mon espace" aria-orientation="vertical" onKeyDown={onKey} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
            {TABS.map((t) => (
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
            {tab === 'profil' && <ProfileTab />}
            {tab === 'historique' && <HistoryTab />}
            {tab === 'statistiques' && <StatsTab />}
            {tab === 'manches' && <FavoriteRoundsTab />}
            {tab === 'bankroll' && <BankrollTab />}
            {tab === 'favoris' && <FavoritesTab />}
          </Panel>
        </div>
      </main>
    </div>
  );
}

const H2 = ({ children }: { children: ReactNode }) => <h2 className="font-display text-2xl text-ivory-50">{children}</h2>;
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold-400">{children}</h3>;

// ---------- Profil ----------
function ProfileTab() {
  const account = useAccountClient()!;
  const me = useAccount((s) => s.account)!;
  const [nickname, setNick] = useState(me.nickname);
  const [avatar, setAvatar] = useState(me.avatar ?? 'or');
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [mail, setMail] = useState({ email: me.email, password: '' });
  const [mailState, setMailState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pwd, setPwd] = useState({ current: '', next: '' });
  const [pwdState, setPwdState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await account.updateProfile({ nickname: nickname.trim(), avatar });
      setState({ tone: 'ok', text: 'Profil enregistré. Il s’appliquera à vos prochaines parties.' });
    } catch (err) {
      setState({ tone: 'error', text: message(err) });
    }
  }
  async function saveMail(e: FormEvent) {
    e.preventDefault();
    try {
      await account.changeEmail(mail.email.trim(), mail.password);
      setMail((m) => ({ ...m, password: '' }));
      setMailState({ tone: 'ok', text: 'Adresse e-mail modifiée.' });
    } catch (err) {
      setMailState({ tone: 'error', text: message(err) });
    }
  }
  async function savePwd(e: FormEvent) {
    e.preventDefault();
    try {
      await account.changePassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '' });
      setPwdState({ tone: 'ok', text: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.' });
    } catch (err) {
      setPwdState({ tone: 'error', text: message(err) });
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={saveProfile} className="space-y-4">
        <H2>Profil</H2>
        <div className="flex items-center gap-4">
          <Avatar nickname={nickname || me.nickname} avatar={avatar} size={64} />
          <p className="text-sm text-ivory-200/80">Votre pseudo et votre avatar sont visibles des autres joueurs à la table.</p>
        </div>
        <Field label="Pseudo" htmlFor="sp-nick">
          <input id="sp-nick" className={inputClass} value={nickname} maxLength={20} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
        </Field>
        <Field label="Avatar">
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </Field>
        {state && <Notice tone={state.tone}>{state.text}</Notice>}
        <Button type="submit" disabled={nickname.trim().length < 2}>
          Enregistrer le profil
        </Button>
      </form>

      <section className="space-y-3 border-t border-ivory-100/10 pt-6" aria-label="Alertes par e-mail">
        <H3>Alertes par e-mail</H3>
        <p className="text-sm text-ivory-200/80">Quand un de vos joueurs favoris se connecte et que vous n’êtes pas sur Flash Poker : un e-mail au plus par jour et par favori.</p>
        <Segmented label="Alertes par e-mail" value={me.notifyEmail ? 'oui' : 'non'} options={['oui', 'non'] as const} format={(v) => (v === 'oui' ? 'Activées' : 'Désactivées')} onChange={(v) => void account.updateProfile({ notifyEmail: v === 'oui' }).catch(() => undefined)} />
      </section>

      <form onSubmit={saveMail} className="space-y-4 border-t border-ivory-100/10 pt-6">
        <H3>Adresse e-mail</H3>
        <Field label="Adresse e-mail" htmlFor="sp-mail">
          <input id="sp-mail" type="email" className={inputClass} value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Mot de passe actuel (confirmation)" htmlFor="sp-mail-pwd">
          <input id="sp-mail-pwd" type="password" className={inputClass} value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} autoComplete="current-password" />
        </Field>
        {mailState && <Notice tone={mailState.tone}>{mailState.text}</Notice>}
        <Button type="submit" variant="secondary" disabled={!mail.password || mail.email.trim() === me.email}>
          Changer d’adresse
        </Button>
      </form>

      <form onSubmit={savePwd} className="space-y-4 border-t border-ivory-100/10 pt-6">
        <H3>Mot de passe</H3>
        <Field label="Mot de passe actuel" htmlFor="sp-cur">
          <input id="sp-cur" type="password" className={inputClass} value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="sp-next" hint="Au moins 8 caractères.">
          <input id="sp-next" type="password" className={inputClass} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" />
        </Field>
        {pwdState && <Notice tone={pwdState.tone}>{pwdState.text}</Notice>}
        <Button type="submit" variant="secondary" disabled={!pwd.current || pwd.next.length < 8}>
          Changer le mot de passe
        </Button>
      </form>

      <div className="border-t border-ivory-100/10 pt-6">
        <Button variant="danger" onClick={() => void account.logout()}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

// ---------- Historique ----------
function HistoryTab() {
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.games);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <H2>Historique des parties</H2>
      <p className="mt-1 text-sm text-ivory-300/80">Parties terminées, de la plus récente à la plus ancienne. Ouvrez une partie pour revoir chaque manche et marquer vos favorites.</p>
      <div className="mt-4">
        {data === null && !error ? (
          <Loading />
        ) : (
          <State error={error} empty={data?.length === 0 && 'Aucune partie terminée pour l’instant. Vos parties s’afficheront ici dès la fin de la première.'}>
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
  return (
    <div className="rounded-xl border border-ivory-100/10 bg-ink-900/50">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
        <span className="min-w-0">
          <span className="block font-semibold text-ivory-50">
            {game.name} {game.won && <span className="align-middle"><Badge tone="gold">Victoire</Badge></span>}
          </span>
          <span className="block text-xs text-ivory-300/75">
            {DATE.format(game.endedAt)} · {game.rounds} manche{game.rounds > 1 ? 's' : ''} · avec {game.opponents.join(', ') || '—'}
          </span>
        </span>
        <span className={`font-display text-lg ${game.netCents > 0 ? 'text-jade-300' : game.netCents < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedEuros(game.netCents)}</span>
      </button>
      {open && <GameDetailView id={game.id} />}
    </div>
  );
}

function GameDetailView({ id }: { id: string }) {
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
  const nameOf = (pid: string) => data.players.find((p) => p.playerId === pid)?.nickname ?? 'Un joueur';
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
  const winner = game.outcome.winner;
  const others = game.players.filter((p) => p.playerId !== game.you && p.accountId && game.seated.includes(p.playerId));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ivory-100">
        <TrophyIcon size={22} className="mr-1 inline align-[-5px]" /> Vainqueur : <strong className="text-gold-200">{nameOf(winner)}</strong> · cagnotte {formatEuros(game.outcome.settlement.potCents)}
      </p>
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-ivory-300/80">
          Joueurs inscrits :
          {others.map((p) =>
            favPlayers.has(p.nickname.toLowerCase()) ? (
              <Badge key={p.playerId} tone="gold">★ {p.nickname}</Badge>
            ) : (
              <button key={p.playerId} type="button" onClick={() => onFavorite(p.nickname)} className="rounded-full border border-gold-500/50 px-2.5 py-0.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                ☆ Ajouter {p.nickname} aux favoris
              </button>
            ),
          )}
        </p>
      )}
    </div>
  );
}

// ---------- Statistiques ----------
function StatsTab() {
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.stats);
  const best = data?.variants.reduce<VariantStats | null>((b, v) => (v.played >= 3 && (!b || v.won / v.played > b.won / b.played) ? v : b), null);
  return (
    <div>
      <H2>Statistiques par variante</H2>
      {data === null && !error ? (
        <Loading />
      ) : (
        <State error={error} empty={data?.games === 0 && 'Vos statistiques apparaîtront après votre première partie terminée.'}>
          {data && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label="Parties" value={String(data.games)} />
                <Kpi label="Parties gagnées" value={`${data.gamesWon} (${pct(data.gamesWon, data.games)})`} />
                <Kpi label="Manches jouées" value={String(data.variants.reduce((a, v) => a + v.played, 0))} />
                <Kpi label="Meilleure variante" value={best ? variantName(best.variant) : '—'} hint={best ? undefined : 'dès 3 manches jouées'} />
              </dl>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <caption className="sr-only">Manches jouées, gagnées et points marqués par variante</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-ivory-300/70">
                      <th className="py-2 font-medium">Variante</th>
                      <th className="py-2 text-right font-medium">Manches</th>
                      <th className="py-2 text-right font-medium">Gagnées</th>
                      <th className="py-2 text-right font-medium">Réussite</th>
                      <th className="py-2 text-right font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.variants.map((v) => (
                      <tr key={v.variant} className="border-t border-ivory-100/10">
                        <th scope="row" className="py-2 text-left font-semibold text-ivory-50">{variantName(v.variant)}</th>
                        <td className="py-2 text-right">{v.played}</td>
                        <td className="py-2 text-right">{v.won}</td>
                        <td className="py-2 text-right">
                          <span className="inline-flex items-center gap-2">
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink-600 sm:inline-block" aria-hidden="true">
                              <span className="block h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${v.played ? (v.won / v.played) * 100 : 0}%` }} />
                            </span>
                            {pct(v.won, v.played)}
                          </span>
                        </td>
                        <td className="py-2 text-right">{v.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ivory-300/65">Une manche compte comme gagnée quand vous en remportez les points (ou la victoire immédiate).</p>
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
  const account = useAccountClient()!;
  const { data, error, reload } = useLoad(account.favoriteRounds);
  return (
    <div>
      <H2>Manches favorites</H2>
      <p className="mt-1 text-sm text-ivory-300/80">Marquez une manche d’une étoile depuis l’onglet Historique pour la retrouver ici.</p>
      <div className="mt-4">
        {data === null && !error ? (
          <Loading />
        ) : (
          <State error={error} empty={data?.length === 0 && 'Aucune manche favorite pour l’instant.'}>
            <ul className="space-y-3">
              {data?.map((f: FavoriteRound) => (
                <li key={`${f.gameId}-${f.round.roundNo}`} className="rounded-xl border border-ivory-100/10 bg-ink-900/40 px-3 pb-3 pt-2">
                  <p className="text-xs text-ivory-300/75">
                    {f.gameName} · {DAY.format(f.endedAt)}
                  </p>
                  <RoundList
                    history={[f.round]}
                    nameOf={(pid) => f.players.find((p) => p.playerId === pid)?.nickname ?? 'Un joueur'}
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
  const account = useAccountClient()!;
  const { data, error } = useLoad(account.bankroll);
  return (
    <div>
      <H2>Bankroll</H2>
      <p className="mt-1 text-sm text-ivory-300/80">Bilan de vos parties : gains moins mises, assurances comprises. Cagnotte virtuelle, aucun paiement réel.</p>
      {data === null && !error ? (
        <Loading />
      ) : (
        <State error={error} empty={data?.games === 0 && 'Votre courbe démarrera à la fin de votre première partie.'}>
          {data && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Kpi label="Bilan total" value={formatSignedEuros(data.totalCents)} />
                <Kpi label="Parties" value={String(data.games)} />
                <Kpi label="Meilleure partie" value={formatSignedEuros(Math.max(...data.series.map((s) => s.netCents)))} />
              </dl>
              <BankrollChart bankroll={data} />
            </>
          )}
        </State>
      )}
    </div>
  );
}

/** Courbe du bilan cumulé, partie après partie (ligne zéro marquée). */
export function BankrollChart({ bankroll }: { bankroll: Bankroll }) {
  const pts = [{ cumulativeCents: 0, endedAt: 0, name: 'Départ', netCents: 0 }, ...bankroll.series];
  const W = 640;
  const H = 220;
  const P = { l: 56, r: 12, t: 12, b: 28 };
  const vals = pts.map((p) => p.cumulativeCents);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 100;
  const x = (i: number) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cumulativeCents).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = bankroll.totalCents;
  const color = last >= 0 ? '#5bc79f' : '#ef6a73';
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Bilan cumulé sur ${bankroll.games} partie${bankroll.games > 1 ? 's' : ''} : ${formatSignedEuros(last)}`}>
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
              {formatEuros(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="#c9a25a" strokeOpacity="0.6" strokeDasharray="4 4" />
        <path d={area} fill="url(#bk-area)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (i === 0 ? null : <circle key={i} cx={x(i)} cy={y(p.cumulativeCents)} r="3.5" fill={color} />))}
        <text x={P.l} y={H - 8} fontSize="11" fill="#c9c2b2">
          Départ
        </text>
        <text x={W - P.r} y={H - 8} fontSize="11" fill="#c9c2b2" textAnchor="end">
          {pts.length > 1 ? DAY.format(pts[pts.length - 1]!.endedAt) : ''}
        </text>
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>Bilan partie par partie</caption>
          <tbody>
            {bankroll.series.map((s, i) => (
              <tr key={i}>
                <td>{s.name}</td>
                <td>{formatSignedEuros(s.netCents)}</td>
                <td>{formatSignedEuros(s.cumulativeCents)}</td>
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
      <H2>Joueurs favoris</H2>
      <p className="mt-1 text-sm text-ivory-300/80">Vous êtes prévenu dans l’application dès qu’un favori se connecte, et par e-mail si vous n’êtes pas en ligne (réglable dans Profil).</p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void add(q.trim());
        }}
      >
        <Field label="Ajouter un joueur inscrit" htmlFor="fav-q" hint="Tapez au moins deux lettres de son pseudo.">
          <input id="fav-q" className={inputClass} value={q} maxLength={20} onChange={(e) => setQ(e.target.value)} autoComplete="off" role="combobox" aria-expanded={results.length > 0} aria-controls="fav-results" aria-autocomplete="list" />
        </Field>
        {results.length > 0 && (
          <ul id="fav-results" role="listbox" aria-label="Joueurs trouvés" className="mt-2 divide-y divide-ivory-100/10 rounded-xl border border-ivory-100/10 bg-ink-900/70">
            {results.map((u) => (
              <li key={u.id} role="option" aria-selected={false} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2">
                  <Avatar nickname={u.nickname} avatar={u.avatar} size={28} />
                  {u.nickname}
                </span>
                {known.has(u.id) ? (
                  <Badge tone="gold">Déjà favori</Badge>
                ) : (
                  <Button variant="secondary" className="min-h-[36px] px-3 py-1" onClick={() => void add(u.nickname)}>
                    Ajouter
                  </Button>
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
          <State error={error} empty={data?.length === 0 && 'Aucun favori pour l’instant.'}>
            <ul className="space-y-2" aria-label="Mes joueurs favoris">
              {data?.map((f: FavoritePlayer) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative">
                      <Avatar nickname={f.nickname} avatar={f.avatar} size={36} />
                      <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-ink-900 ${f.online ? 'bg-jade-400' : 'bg-ink-500'}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ivory-50">{f.nickname}</span>
                      <span className={`block text-xs ${f.online ? 'text-jade-300' : 'text-ivory-300/70'}`}>{f.online ? 'En ligne' : 'Hors ligne'}</span>
                    </span>
                  </span>
                  <Button variant="ghost" className="min-h-[36px] px-3 py-1 text-ruby-300" onClick={() => void account.removeFavorite(f.id).then(reload, () => undefined)} aria-label={`Retirer ${f.nickname} des favoris`}>
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          </State>
        )}
      </div>
    </div>
  );
}
