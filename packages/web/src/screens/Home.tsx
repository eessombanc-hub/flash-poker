import { COMMON_RULES } from '../lib/rulesText';
import { VARIANTS } from '../lib/labels';
import { useClient } from '../lib/context';
import { formatEuros } from '../lib/format';
import { ApiError, type RoomSummary } from '../lib/api';
import { Badge, Button, Eyebrow, Modal, Panel } from '../components/ui';
import { PlayingCard } from '../components/Card';
import { useEffect, useState } from 'react';

const LIST_POLL_MS = 5000;

export function Home({ onCreate, onJoin, notice }: { onCreate: () => void; onJoin: (code?: string) => void; notice?: string | null }) {
  const [rules, setRules] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-5 py-10 text-center">
      <div className="mb-8 flex items-end justify-center" aria-hidden="true">
        {['As', 'Ks', 'Qh', 'Jd', 'Tc'].map((c, i) => (
          <div key={c} className="-mx-3 origin-bottom" style={{ transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 6}px)` }}>
            <PlayingCard code={c} size="lg" />
          </div>
        ))}
      </div>
      <Eyebrow>Table en direct</Eyebrow>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-wide text-ivory-50 sm:text-6xl">Flash Poker</h1>
      <p className="mt-4 max-w-xl text-base text-ivory-200/85 sm:text-lg">Huit variantes, une seule table. Jusqu’à six joueurs, en temps réel.</p>
      {notice && (
        <p role="alert" className="mt-6 rounded-lg border border-amber-400/40 bg-amber-950/60 px-4 py-2.5 text-sm text-amber-100">
          {notice}
        </p>
      )}
      <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
        <Button onClick={onCreate} className="w-full py-3.5 text-base">
          Créer une partie
        </Button>
        <Button variant="secondary" onClick={() => onJoin()} className="w-full py-3.5 text-base">
          Rejoindre avec un code
        </Button>
        <Button variant="ghost" onClick={() => setRules(true)} className="w-full">
          Mémo des règles
        </Button>
      </div>
      <OpenRooms onSelect={onJoin} />
      <p className="mt-10 text-xs text-ivory-300/60">Cagnotte virtuelle — aucun paiement réel.</p>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </main>
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
    <section className="mt-10 w-full max-w-xl text-left">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-gold-400">Parties ouvertes</h2>
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
