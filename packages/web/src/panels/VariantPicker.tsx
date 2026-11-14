import { useEffect, useRef, useState } from 'react';
import { Badge, Button } from '../components/ui';
import { useClient } from '../lib/context';
import { VARIANTS } from '../lib/labels';
import { nick } from '../lib/selectors';
import { useTable } from '../lib/table';
import { PanelShell } from './Shell';
import { useI18n } from '../i18n';

/** Écran « Choisissez la variante » : six cartes-variantes, Fermé 2 grisé à 6 joueurs. */
export function VariantPicker() {
  const { t } = useI18n();
  const client = useClient();
  const { view, game, me, canAct } = useTable();
  const isChooser = game.chooser === me && canAct;
  const pending = game.insurance.pending !== null;
  const [opts63, setOpts63] = useState(false);
  const [teats, setTeats] = useState(0);
  const [sideBets, setSideBets] = useState(false);
  const optsRef = useRef<HTMLDivElement>(null);
  // Les options remplacent la liste : elles ne peuvent pas rester cachées sous les six cartes, hors de l'écran.
  useEffect(() => {
    if (opts63) optsRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [opts63]);

  const list = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('picker.variantes')}>
        {VARIANTS.map((v) => {
          const available = game.variants.find((x) => x.variant === v.id)?.available ?? true;
          const disabled = !isChooser || !available || pending;
          return (
            <li key={v.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => (v.id === 'V6_3' ? setOpts63(true) : void client.command({ type: 'CHOOSE_VARIANT', variant: v.id }))}
                className={`group flex h-full w-full flex-col items-stretch justify-start rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${
                  disabled ? 'cursor-not-allowed border-ivory-100/10 bg-ink-900/40 opacity-60' : 'border-gold-500/40 bg-ink-900/70 hover:border-gold-400 hover:bg-gold-500/10'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-display text-xl text-ivory-50">{v.name}</span>
                  {!available && <Badge tone="amber">{t('picker.2_a_5')}</Badge>}
                </span>
                <span className="mt-0.5 block text-xs uppercase tracking-widest text-gold-400">{v.tagline}</span>
                <span className="mt-2 block text-sm text-ivory-200/80">{v.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
  );

  return (
    <PanelShell
      eyebrow={t('picker.manche', { roundNo: game.roundNo })}
      title={isChooser ? t('picker.choisissez_la_variante') : t('picker.choisit_la_variante', { nick: nick(view, game.chooser) })}
      hint={
        isChooser
          ? pending
            ? t('picker.une_proposition_d')
            : t('picker.sans_choix_en')
          : t('picker.le_choix_tourne')
      }
      timerLabel={t('picker.choix_de_la')}
    >
      {isChooser && opts63 ? null : isChooser ? list : (
        <details className="rounded-xl border border-ivory-100/12 bg-ink-900/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('picker.voir')}</summary>
          <div className="mt-3">{list}</div>
        </details>
      )}
      {opts63 && isChooser && (
        <div ref={optsRef} role="group" aria-label={t('picker.options_du_6')} className="rounded-xl border border-gold-500/40 bg-ink-900/70 p-4">
          <p className="font-display text-lg text-ivory-50">{t('picker.options_du_6')}</p>
          <fieldset className="mt-2">
            <legend className="text-sm text-ivory-200/85">{t('picker.tetines_cartes_supplementaires')}</legend>
            <div className="mt-1.5 flex gap-2">
              {[0, 1, 2].map((n) => (
                <label key={n} className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${teats === n ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-ivory-100/20 text-ivory-200/85'}`}>
                  <input type="radio" name="teats" className="sr-only" checked={teats === n} onChange={() => setTeats(n)} />
                  {n === 0 ? t('picker.aucune') : n === 1 ? '1 tétine' : '2 tétines'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ivory-200/90">
            <input type="checkbox" checked={sideBets} onChange={(e) => setSideBets(e.target.checked)} className="mt-1" />
            <span>{t('picker.paris_exterieurs_chacun')}</span>
          </label>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void client.command({ type: 'CHOOSE_VARIANT', variant: 'V6_3', teats, sideBets })}>{t('picker.lancer_le_6')}</Button>
            <Button variant="ghost" onClick={() => setOpts63(false)}>{t('picker.retour')}</Button>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
