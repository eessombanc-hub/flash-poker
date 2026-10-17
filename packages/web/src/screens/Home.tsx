import { COMMON_RULES } from '../lib/rulesText';
import { VARIANTS } from '../lib/labels';
import { Button, Eyebrow, Modal, Panel } from '../components/ui';
import { PlayingCard } from '../components/Card';
import { useState } from 'react';

export function Home({ onCreate, onJoin, notice }: { onCreate: () => void; onJoin: () => void; notice?: string | null }) {
  const [rules, setRules] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-8 flex items-end justify-center" aria-hidden="true">
        {['As', 'Ks', 'Qh', 'Jd', 'Tc'].map((c, i) => (
          <div key={c} className="-mx-3 origin-bottom" style={{ transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 6}px)` }}>
            <PlayingCard code={c} size="lg" />
          </div>
        ))}
      </div>
      <Eyebrow>Salon privé</Eyebrow>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-wide text-ivory-50 sm:text-6xl">Flash Poker</h1>
      <p className="mt-4 max-w-xl text-base text-ivory-200/85 sm:text-lg">
        Huit variantes, une seule table. Jusqu’à six joueurs, en temps réel, sur invitation.
      </p>
      {notice && (
        <p role="alert" className="mt-6 rounded-lg border border-amber-400/40 bg-amber-950/60 px-4 py-2.5 text-sm text-amber-100">
          {notice}
        </p>
      )}
      <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
        <Button onClick={onCreate} className="w-full py-3.5 text-base">
          Créer une partie
        </Button>
        <Button variant="secondary" onClick={onJoin} className="w-full py-3.5 text-base">
          Rejoindre une partie
        </Button>
        <Button variant="ghost" onClick={() => setRules(true)} className="w-full">
          Mémo des règles
        </Button>
      </div>
      <p className="mt-10 text-xs text-ivory-300/60">Cagnotte virtuelle — aucun paiement réel.</p>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </main>
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
