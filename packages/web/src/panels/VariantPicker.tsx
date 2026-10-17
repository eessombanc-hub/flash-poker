import { Badge } from '../components/ui';
import { useClient } from '../lib/context';
import { VARIANTS } from '../lib/labels';
import { nick } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell } from './Shell';

/** Écran « Choisissez la variante » : six cartes-variantes, Fermé 2 grisé à 6 joueurs. */
export function VariantPicker() {
  const client = useClient();
  const { view, game, me, canAct } = useTable();
  const isChooser = game.chooser === me && canAct;
  const pending = game.insurance.pending !== null;

  return (
    <PanelShell
      eyebrow={`Manche ${game.roundNo}`}
      title={isChooser ? 'Choisissez la variante' : `${nick(view, game.chooser)} choisit la variante`}
      hint={
        isChooser
          ? pending
            ? 'Une proposition d’assurance est en attente de réponse : vous pourrez choisir ensuite.'
            : 'Sans choix en 60 secondes, une variante disponible est tirée au hasard.'
          : 'Le choix tourne dans l’ordre des positions.'
      }
      timerLabel="Choix de la variante"
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Variantes">
        {VARIANTS.map((v) => {
          const available = game.variants.find((x) => x.variant === v.id)?.available ?? true;
          const disabled = !isChooser || !available || pending;
          return (
            <li key={v.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void client.command({ type: 'CHOOSE_VARIANT', variant: v.id })}
                className={`group flex h-full w-full flex-col items-stretch justify-start rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${
                  disabled ? 'cursor-not-allowed border-ivory-100/10 bg-ink-900/40 opacity-60' : 'border-gold-500/40 bg-ink-900/70 hover:border-gold-400 hover:bg-gold-500/10'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-display text-xl text-ivory-50">{v.name}</span>
                  {!available && <Badge tone="amber">2 à 5 joueurs</Badge>}
                </span>
                <span className="mt-0.5 block text-xs uppercase tracking-widest text-gold-400">{v.tagline}</span>
                <span className="mt-2 block text-sm text-ivory-200/80">{v.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}
