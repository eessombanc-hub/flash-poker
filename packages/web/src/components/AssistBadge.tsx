import { categoryLabel } from '../lib/labels';

/**
 * Indicateur d'assistance : le NOM de la combinaison actuelle, rien de plus (jamais de suggestion, jamais de
 * comparaison). N'occupe aucune place quand l'assistance est inactive (`category` nul et `active` faux).
 * `waiting` : assistance active mais sélection encore incomplète.
 */
export function AssistBadge({ category, active, waiting = 'Sélectionnez vos cartes' }: { category: number | null; active: boolean; waiting?: string }) {
  if (!active) return null;
  return (
    <p className="mt-2 flex items-center justify-center gap-2 text-sm" aria-live="polite" data-testid="assist-badge">
      <span className="text-[11px] uppercase tracking-widest text-ivory-300/70">Votre combinaison</span>
      {category === null ? (
        <span className="rounded-full bg-ink-900/70 px-3 py-0.5 text-ivory-300/70">{waiting}</span>
      ) : (
        <span className="rounded-full bg-gold-500/20 px-3 py-0.5 font-semibold text-gold-300">{categoryLabel(category)}</span>
      )}
    </p>
  );
}
