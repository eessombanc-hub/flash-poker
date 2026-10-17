import { useState } from 'react';
import { useClient, useGame } from '../lib/context';
import { formatEuros } from '../lib/format';
import { Avatar, Badge, Button, Eyebrow, Panel, Title } from '../components/ui';

export function Lobby() {
  const client = useClient();
  const view = useGame((s) => s.view)!;
  const [copied, setCopied] = useState(false);
  const isHost = view.you.role === 'HOST';
  const mine = view.players.find((p) => p.id === view.you.playerId);
  const allApproved = view.players.every((p) => p.assistanceApproved === true);
  const n = view.players.length;
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?code=${view.code}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      client.toast('warning', 'Copie impossible : sélectionnez le code manuellement.');
    }
  }

  if (view.status === 'CANCELLED') {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <Panel className="p-8">
          <Title>Partie annulée</Title>
          <p className="mt-3 text-ivory-200/85">L’hôte a annulé cette partie avant son démarrage.</p>
          <Button className="mt-6" onClick={() => client.leave()}>
            Retour à l’accueil
          </Button>
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Panel className="p-6 sm:p-8">
        <Eyebrow>Salle d’attente</Eyebrow>
        <Title className="mt-1 text-3xl">{view.name}</Title>

        <div className="mt-6 rounded-xl border border-gold-500/40 bg-ink-900/70 p-4 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-ivory-300/70">Code de la partie</p>
          <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.18em] text-gold-300 sm:text-4xl" data-testid="room-code">
            {view.code}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => copy(view.code)} aria-label="Copier le code">
              {copied ? 'Copié ✓' : 'Copier le code'}
            </Button>
            <Button variant="ghost" onClick={() => copy(link)}>
              Copier le lien d’invitation
            </Button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            ['Joueurs', `${n} / ${view.config.maxPlayers}`],
            ['Places restantes', String(view.seatsLeft)],
            ['Objectif', `${view.config.targetPoints} point${view.config.targetPoints > 1 ? 's' : ''}`],
            ['Mise', formatEuros(view.config.stakeCents)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-ivory-100/10 bg-ink-900/50 px-2 py-3">
              <dt className="text-[11px] uppercase tracking-widest text-ivory-300/70">{k}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ivory-50">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-center text-sm text-ivory-200/80">
          Cagnotte actuelle : <strong className="text-gold-300">{formatEuros(view.config.potCents)}</strong> · virtuelle, aucun paiement réel
        </p>

        {view.config.assistance ? (
          <section className="mt-6 rounded-xl border border-gold-500/40 bg-gold-500/5 p-4" aria-label="Assistance">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-gold-400">Partie avec assistance</h3>
              <Badge tone={allApproved ? 'green' : 'amber'}>{allApproved ? 'Accord de tous' : 'En attente d’accord'}</Badge>
            </div>
            <p className="mt-2 text-sm text-ivory-200/85">
              L’assistance affiche simplement le nom de votre combinaison (paire, brelan…) pendant que vous choisissez vos cartes — jamais de suggestion.
              Elle n’est active que si <strong>tous</strong> les joueurs l’approuvent avant le départ ; sinon la partie se joue sans assistance.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant={mine?.assistanceApproved === true ? 'primary' : 'secondary'} aria-pressed={mine?.assistanceApproved === true} onClick={() => client.approveAssistance(true)}>
                J’approuve l’assistance
              </Button>
              <Button variant={mine?.assistanceApproved === false ? 'primary' : 'secondary'} aria-pressed={mine?.assistanceApproved === false} onClick={() => client.approveAssistance(false)}>
                Je préfère sans assistance
              </Button>
              {mine?.assistanceApproved === null && <span className="text-xs text-ivory-300/70">Vous n’avez pas encore répondu.</span>}
            </div>
            <p className="mt-2 text-xs text-ivory-300/70" aria-live="polite">
              {allApproved ? 'Tous les joueurs ont approuvé : la partie démarrera avec assistance.' : 'Tant que tout le monde n’a pas approuvé, la partie démarrera sans assistance.'}
            </p>
          </section>
        ) : (
          <p className="mt-3 text-center text-xs text-ivory-300/70">Partie sans assistance : aucune indication, chacun juge seul la force de sa main.</p>
        )}

        <h3 className="mb-2 mt-7 text-sm font-semibold uppercase tracking-widest text-gold-400">Joueurs connectés</h3>
        <ul className="space-y-2" aria-label="Joueurs">
          {view.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2.5">
              <Avatar nickname={p.nickname} avatar={p.avatar} />
              <span className="flex-1 font-medium text-ivory-50">
                {p.nickname}
                {p.id === view.you.playerId && <span className="ml-2 text-xs text-ivory-300/70">(vous)</span>}
              </span>
              {p.isHost && <Badge tone="gold">Hôte</Badge>}
              {view.config.assistance && (
                <Badge tone={p.assistanceApproved === true ? 'green' : p.assistanceApproved === false ? 'red' : 'neutral'}>
                  {p.assistanceApproved === true ? 'Assistance : oui' : p.assistanceApproved === false ? 'Assistance : non' : 'Assistance : en attente'}
                </Badge>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs ${p.connected ? 'text-jade-300' : 'text-ivory-300/60'}`}>
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-jade-400' : 'bg-ivory-300/40'}`} />
                {p.connected ? 'en ligne' : 'hors ligne'}
              </span>
              {isHost && !p.isHost && (
                <Button variant="danger" className="min-h-[36px] px-3 py-1 text-xs" aria-label={`Retirer ${p.nickname}`} onClick={() => client.excludePlayer(p.id)}>
                  Retirer
                </Button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, view.seatsLeft) }, (_, i) => (
            <li key={`free-${i}`} className="rounded-xl border border-dashed border-ivory-100/15 px-3 py-3 text-center text-sm text-ivory-300/50">
              Place libre
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ivory-300/70">Les positions (UTG…) sont tirées au sort au démarrage, puis restent stables.</p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {isHost ? (
            <>
              <Button variant="danger" onClick={() => client.cancelRoom()}>
                Annuler la partie
              </Button>
              <Button disabled={n < 2} onClick={() => client.startGame()}>
                Démarrer la partie
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => client.leaveLobby()}>
                Quitter la salle
              </Button>
              <p className="self-center text-sm text-ivory-200/80" aria-live="polite">
                En attente de l’hôte…
              </p>
            </>
          )}
        </div>
        {isHost && n < 2 && <p className="mt-2 text-right text-xs text-ivory-300/70">Il faut au moins 2 joueurs pour démarrer.</p>}
      </Panel>
    </main>
  );
}
