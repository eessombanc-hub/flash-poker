import { useState } from 'react';
import { Badge, Button, Eyebrow, Panel } from '../components/ui';
import { useClient } from '../lib/context';
import { formatEuros } from '../lib/format';
import { describeInsurance, INSURANCE_GENERAL_NOTE } from '../lib/insurance';
import { INSURANCE_LABELS } from '../lib/labels';
import { nick } from '../lib/selectors';
import { useTable } from '../lib/table';
import type { InsuranceType } from '../lib/types';

/** Assurance : entre deux manches, à 1 point de la fin. Notification, proposition, réception, acceptation. */
export function InsurancePanel() {
  const client = useClient();
  const { view, game, me, canAct } = useTable();
  const ins = game.insurance;
  const others = ins.eligible.filter((p) => p !== me && !ins.blockedPartners.includes(p) && !view.players.find((x) => x.id === p)?.excluded);
  const [partner, setPartner] = useState<string>('');
  const [type, setType] = useState<InsuranceType>('SPLIT_50_50');
  const chosen = partner || (others.length === 1 ? others[0]! : '');

  if (ins.pending) {
    const p = ins.pending;
    if (p.partner === me && canAct) {
      return (
        <Panel className="border-gold-500/50 p-4 sm:p-5" aria-live="assertive">
          <Eyebrow>Proposition d’assurance</Eyebrow>
          <p className="mt-1 text-lg text-ivory-50">
            <strong>{nick(view, p.proposer)}</strong> vous propose une assurance : <strong>{INSURANCE_LABELS[p.type].name}</strong>.
          </p>
          <p className="mt-2 text-sm text-ivory-200/85">{describeInsurance(p.type, game.potCents, game.stakeCents)}</p>
          <p className="mt-1 text-xs text-ivory-300/70">{INSURANCE_GENERAL_NOTE}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void client.command({ type: 'RESPOND_INSURANCE', accept: true })}>Accepter l’assurance</Button>
            <Button variant="secondary" onClick={() => void client.command({ type: 'RESPOND_INSURANCE', accept: false })}>
              Refuser
            </Button>
          </div>
          <p className="mt-2 text-xs text-ivory-300/70">Sans réponse en 60 secondes, la proposition est refusée.</p>
        </Panel>
      );
    }
    return (
      <Panel className="p-4 sm:p-5">
        <Eyebrow>Assurance</Eyebrow>
        <p className="mt-1 text-sm text-ivory-200/90">
          {p.proposer === me ? `Proposition envoyée à ${nick(view, p.partner)} (${INSURANCE_LABELS[p.type].name}) — en attente de sa réponse.` : `${nick(view, p.proposer)} propose une assurance à ${nick(view, p.partner)}.`}
        </p>
      </Panel>
    );
  }

  if (ins.canPropose && ins.eligible.includes(me) && canAct && others.length > 0) {
    return (
      <Panel className="border-gold-500/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>Assurance disponible</Eyebrow>
          <Badge tone="gold">Vous êtes à 1 point de la victoire</Badge>
        </div>
        <p className="mt-2 text-sm text-ivory-200/85">Proposez une assurance à un autre joueur à 1 point de la fin. Elle ne s’applique qu’entre vous deux et reste valable toute la partie.</p>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ivory-100">Partenaire</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {others.map((p) => (
              <label key={p} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${chosen === p ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-ivory-100/15 text-ivory-200'}`}>
                <input type="radio" name="partner" className="accent-yellow-600" checked={chosen === p} onChange={() => setPartner(p)} />
                {nick(view, p)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ivory-100">Formule</legend>
          <div className="mt-1.5 space-y-2">
            {(Object.keys(INSURANCE_LABELS) as InsuranceType[]).map((t) => (
              <label key={t} className={`block cursor-pointer rounded-lg border p-3 text-sm ${type === t ? 'border-gold-500 bg-gold-500/10' : 'border-ivory-100/15'}`}>
                <span className="flex items-center gap-2 font-semibold text-ivory-50">
                  <input type="radio" name="insurance-type" className="accent-yellow-600" checked={type === t} onChange={() => setType(t)} />
                  {INSURANCE_LABELS[t].name}
                </span>
                <span className="mt-1 block text-ivory-200/80">{describeInsurance(t, game.potCents, game.stakeCents)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-xs text-ivory-300/70">
          Cagnotte actuelle : {formatEuros(game.potCents)}. {INSURANCE_GENERAL_NOTE}
        </p>
        <Button className="mt-3 w-full sm:w-auto" disabled={!chosen} onClick={() => void client.command({ type: 'PROPOSE_INSURANCE', partner: chosen, insuranceType: type })}>
          Proposer l’assurance
        </Button>
      </Panel>
    );
  }
  return null;
}
