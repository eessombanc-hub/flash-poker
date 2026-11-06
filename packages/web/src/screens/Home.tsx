import { COMMON_RULES } from '../lib/rulesText';
import { VARIANTS } from '../lib/labels';
import { useClient } from '../lib/context';
import { formatEuros } from '../lib/format';
import { ApiError, type RoomSummary } from '../lib/api';
import { Badge, Button, Eyebrow, Modal, Panel } from '../components/ui';
import { PlayingCard } from '../components/Card';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { CardsIcon, ChipsIcon, JoinIcon, RulesIcon, TrophyIcon } from '../components/Icons3D';

const LIST_POLL_MS = 5000;

export function Home({ onCreate, onJoin, notice, account }: { onCreate: () => void; onJoin: (code?: string) => void; notice?: string | null; account?: ReactNode }) {
  const [rules, setRules] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <p className="flex items-center gap-2 font-display text-xl tracking-wide text-ivory-50">
          <CardsIcon size={34} />
          Flash Poker
        </p>
        {account}
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-12">
        {/* Accroche */}
        <section className="grid items-center gap-8 py-6 md:grid-cols-[1.1fr_1fr] md:py-10">
          <div className="text-center md:text-left">
            <Eyebrow>Table en direct</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-wide text-ivory-50 sm:text-6xl">
              Le poker entre amis,
              <span className="block bg-gradient-to-r from-gold-300 via-gold-400 to-gold-600 bg-clip-text text-transparent">en un éclair.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-ivory-200/85 sm:text-lg md:mx-0">
              Huit variantes, une seule table. De deux à six joueurs, en temps réel, sur ordinateur comme sur téléphone.
            </p>
            {notice && (
              <p role="alert" className="mt-6 rounded-lg border border-amber-400/40 bg-amber-950/60 px-4 py-2.5 text-sm text-amber-100">
                {notice}
              </p>
            )}
          </div>
          <div className="relative mx-auto h-48 w-full max-w-md sm:h-56" aria-hidden="true">
            <div className="absolute inset-x-0 bottom-4 flex items-end justify-center">
              {['As', 'Ks', 'Qh', 'Jd', 'Tc'].map((c, i) => (
                <div key={c} className="-mx-3 origin-bottom drop-shadow-[0_12px_18px_rgba(0,0,0,0.5)]" style={{ transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 6}px)` }}>
                  <PlayingCard code={c} size="lg" />
                </div>
              ))}
            </div>
            <ChipsIcon size={74} className="absolute bottom-0 left-2 -rotate-12 sm:left-6" />
            <TrophyIcon size={64} className="absolute right-2 top-0 rotate-6 sm:right-8" />
          </div>
        </section>

        {/* Actions principales */}
        <section aria-label="Commencer" className="grid gap-3 sm:grid-cols-3">
          <ActionTile icon={<CardsIcon size={58} />} title="Créer une partie" text="Choisissez la mise, l’objectif et la visibilité, puis invitez vos amis." onClick={onCreate} primary />
          <ActionTile icon={<JoinIcon size={58} />} title="Rejoindre avec un code" text="Entrez le code POKER-XXXX reçu de l’hôte, ou ouvrez son lien d’invitation." onClick={() => onJoin()} />
          <ActionTile icon={<RulesIcon size={58} />} title="Mémo des règles" text="Les huit variantes et les règles communes, en un coup d’œil." onClick={() => setRules(true)} />
        </section>

        {/* Atouts */}
        <ul className="mt-6 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="En bref">
          {[
            ['8', 'variantes, du 6-3 au Morpion'],
            ['2 à 6', 'joueurs par table'],
            ['60 s', 'par décision, en temps réel'],
            ['Privée', 'ou publique, au choix de l’hôte'],
          ].map(([big, small]) => (
            <li key={big} className="rounded-2xl border border-ivory-100/10 bg-ink-800/60 px-4 py-3 text-center">
              <span className="block font-display text-2xl text-gold-300">{big}</span>
              <span className="text-xs text-ivory-200/75">{small}</span>
            </li>
          ))}
        </ul>

        <OpenRooms onSelect={onJoin} />
        <p className="mt-10 text-center text-xs text-ivory-300/60">Cagnotte virtuelle — aucun paiement réel.</p>
      </main>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </div>
  );
}

/** Grande tuile d'action de l'accueil : icône 3D, titre, une phrase d'explication. */
function ActionTile({ icon, title, text, onClick, primary = false }: { icon: ReactNode; title: string; text: string; onClick: () => void; primary?: boolean }) {
  const id = useId();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 motion-reduce:transform-none sm:flex-col sm:items-start sm:p-5 ${
        primary
          ? 'border-gold-400/70 bg-gradient-to-br from-gold-500/25 via-ink-800/90 to-ink-900 shadow-gold'
          : 'border-ivory-100/12 bg-gradient-to-br from-ink-700/80 to-ink-900/90 hover:border-ivory-100/30'
      }`}
    >
      <span className="transition group-hover:scale-105 motion-reduce:transform-none">{icon}</span>
      <span className="min-w-0">
        <span id={`${id}-t`} className="block font-display text-xl text-ivory-50">{title}</span>
        <span id={`${id}-d`} className="mt-1 block text-sm text-ivory-200/80">{text}</span>
      </span>
    </button>
  );
}

/** Liste publique des parties ouvertes : actualisée en continu, on les rejoint en un clic. */
function OpenRooms({ onSelect }: { onSelect: (code: string) => void }) {
  const client = useClient();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await client.listRooms();
        if (!cancelled) {
          setRooms(list);
          setError(false);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setError(true);
      }
    }
    load();
    const id = setInterval(load, LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client]);

  return (
    <section className="mx-auto mt-10 w-full max-w-3xl text-left">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gold-400">
        <ChipsIcon size={28} />
        Parties ouvertes
      </h2>
      <Panel className="divide-y divide-ivory-100/10 p-2">
        {rooms === null && !error && <p className="px-3 py-4 text-center text-sm text-ivory-300/60">Recherche de tables…</p>}
        {error && <p className="px-3 py-4 text-center text-sm text-ivory-300/60">Liste indisponible pour l’instant.</p>}
        {rooms?.length === 0 && <p className="px-3 py-4 text-center text-sm text-ivory-300/60">Aucune partie ouverte — soyez le premier à en créer une.</p>}
        {rooms?.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => onSelect(r.code)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ivory-100/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold-400"
          >
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium text-ivory-50">{r.name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ivory-300/70">
                <span>
                  {r.maxPlayers - r.seatsLeft}/{r.maxPlayers} joueurs
                </span>
                <span aria-hidden="true">·</span>
                <span>Objectif {r.targetPoints} pt{r.targetPoints > 1 ? 's' : ''}</span>
                {r.stakeCents > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatEuros(r.stakeCents)} / joueur</span>
                  </>
                )}
                {r.assistance && <Badge tone="gold">Assistance</Badge>}
              </span>
            </span>
            <Badge tone={r.status === 'RUNNING' ? 'amber' : 'green'}>{r.status === 'RUNNING' ? 'En cours' : 'En attente'}</Badge>
          </button>
        ))}
      </Panel>
    </section>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Mémo des règles" onClose={onClose} wide>
      <Eyebrow>Règles v1.1</Eyebrow>
      <h2 className="mt-1 font-display text-3xl text-ivory-50">Mémo des règles</h2>
      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-gold-400">Les huit variantes</h3>
      <ul className="space-y-3">
        {VARIANTS.map((v) => (
          <li key={v.id} className="rounded-xl border border-ivory-100/10 bg-ink-900/60 p-3.5">
            <p className="font-display text-lg text-ivory-50">
              {v.name} <span className="ml-1 text-sm text-gold-400">— {v.tagline}</span>
            </p>
            <p className="mt-1 text-sm text-ivory-200/85">{v.description}</p>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-gold-400">Règles communes</h3>
      <dl className="space-y-3">
        {COMMON_RULES.map((r) => (
          <div key={r.title}>
            <dt className="font-semibold text-ivory-50">{r.title}</dt>
            <dd className="text-sm text-ivory-200/85">{r.text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 flex justify-end">
        <Button onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  );
}

export const Card = Panel; // alias de commodité pour les écrans à formulaire
