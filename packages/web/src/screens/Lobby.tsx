import { LockIcon } from '../components/Icons3D';
import { useEffect, useRef, useState } from 'react';
import { useClient, useGame } from '../lib/context';
import { formatChips, STARTING_CHIPS } from '../lib/format';
import { Avatar, Badge, Button, Eyebrow, Modal, Panel, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { VARIANTS } from '../lib/labels';
import { ChatDock } from '../components/Social';

export function Lobby({ onAway }: { onAway?: () => void } = {}) {
  const { t, tp } = useI18n();
  const client = useClient();
  const view = useGame((s) => s.view)!;
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isHost = view.you.role === 'HOST';
  const mine = view.players.find((p) => p.id === view.you.playerId);
  const allApproved = view.players.every((p) => p.assistanceApproved === true);
  const n = view.players.length;
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?code=${view.code}`;

  // Arrivées et départs annoncés discrètement, pour que l'hôte n'ait pas à surveiller la liste.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(view.players.map((p) => p.id));
    if (seen.current) for (const p of view.players) if (!seen.current.has(p.id) && p.id !== view.you.playerId) client.toast('info', t('lobby.a_rejoint', { nickname: p.nickname }));
    seen.current = ids;
  }, [view.players, view.you.playerId, client, t]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  async function invite() {
    try {
      await navigator.share({ title: view.name, text: t('lobby.invite.texte', { name: view.name }), url: link });
    } catch {
      /* partage fermé par le joueur : rien à signaler */
    }
  }
  const fixed = view.config.variant ? VARIANTS.find((v) => v.id === view.config.variant) : undefined;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      client.toast('warning', t('lobby.copie_impossible_selectionnez'));
    }
  }

  if (view.status === 'CANCELLED') {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <Panel className="p-8">
          <Title>{t('lobby.partie_annulee')}</Title>
          <p className="mt-3 text-ivory-200/85">{t('lobby.l_hote_a')}</p>
          <Button className="mt-6" onClick={() => client.leave()}>
            {t('lobby.retour_a_l')}</Button>
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <ChatDock canThrow={false} />
      <Button variant="ghost" onClick={() => (isHost ? setConfirmCancel(true) : void client.leaveLobby())} className="mb-4 -ml-3">
        {t('lobby.retour')}</Button>
      {confirmCancel && (
        <Modal title={t('lobby.annuler_la_partie')} onClose={() => setConfirmCancel(false)}>
          <h2 className="font-display text-2xl text-ivory-50">{t('lobby.annuler_la_partie2')}</h2>
          <p className="mt-3 text-sm text-ivory-200/85">{t('lobby.en_tant_qu')}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t('lobby.rester')}</Button>
            <Button variant="danger" onClick={() => client.cancelRoom()}>{t('lobby.annuler_la_partie')}</Button>
          </div>
        </Modal>
      )}
      <Panel className="p-6 sm:p-8">
        <Eyebrow>{t('lobby.salle_d_attente')}</Eyebrow>
        <Title className="mt-1 text-3xl">{view.name}</Title>
        {view.config.private && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-sm text-gold-200">
            <LockIcon size={22} />
            {t('lobby.salle_privee_invisible')}</p>
        )}

        <div className="mt-6 rounded-xl border border-gold-500/40 bg-ink-900/70 p-4 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-ivory-200/80">{t('lobby.code_de_la')}</p>
          <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.18em] text-gold-300 sm:text-4xl" data-testid="room-code">
            {view.code}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {canShare && <Button onClick={invite}>{t('lobby.inviter')}</Button>}
            <Button variant="secondary" onClick={() => copy(view.code)} aria-label={t('lobby.copier_le_code')}>
              {copied ? t('lobby.copie') : t('lobby.copier_le_code')}
            </Button>
            <Button variant="ghost" onClick={() => copy(link)}>
              {t('lobby.copier_le_lien')}</Button>
          </div>
        </div>

        <p className="mt-6 text-center text-lg text-ivory-50" data-testid="lobby-summary">
          {t('lobby.resume', { game: fixed ? fixed.name : t('lobby.jeu.libre'), max: view.config.maxPlayers, goal: tp('lobby.point', view.config.targetPoints), stake: view.config.stakeChips > 0 ? t('lobby.resume.mise', { amount: formatChips(view.config.stakeChips) }) : t('lobby.resume.sansmise') })}
        </p>
        <p className="mt-1 text-center text-sm text-ivory-200/85" aria-live="polite">
          {t('lobby.joueurs_presents', { n, max: view.config.maxPlayers })}
        </p>
        {onAway && (
          <div className="mt-4 rounded-xl border border-jade-500/30 bg-jade-500/10 p-3 text-center">
            <Button variant="secondary" onClick={onAway}>{t('lobby.naviguer')}</Button>
            <p className="mt-2 text-xs text-ivory-200/85">{t('lobby.naviguer.hint')}</p>
          </div>
        )}
        {fixed && (
          <details className="mt-4 rounded-xl border border-ivory-100/12 bg-ink-900/40 px-4 py-3 text-sm text-ivory-100/90">
            <summary className="cursor-pointer font-semibold text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('lobby.rappel_regles', { name: fixed.name })}</summary>
            <p className="mt-2 leading-relaxed">{fixed.description}</p>
          </details>
        )}
        <p className="mt-3 text-center text-sm text-ivory-200/80">
          {t('lobby.chaque_joueur_recoit', { formatChips: formatChips(STARTING_CHIPS) })} <strong className="text-gold-300">{formatChips(view.config.potChips)}</strong>
        </p>

        {view.config.assistance ? (
          <section className="mt-6 rounded-xl border border-gold-500/40 bg-gold-500/5 p-4" aria-label={t('lobby.assistance')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-gold-400">{t('lobby.partie_avec_assistance')}</h3>
              <Badge tone={allApproved ? 'green' : 'amber'}>{allApproved ? t('lobby.accord_de_tous') : t('lobby.en_attente_d')}</Badge>
            </div>
            <p className="mt-2 text-sm text-ivory-200/85">
              {t('lobby.l_assistance_affiche')} <strong>{t('lobby.tous')}</strong>  {t('lobby.les_joueurs_l')}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant={mine?.assistanceApproved === true ? 'primary' : 'secondary'} aria-pressed={mine?.assistanceApproved === true} onClick={() => client.approveAssistance(true)}>
                {t('lobby.j_approuve_l')}</Button>
              <Button variant={mine?.assistanceApproved === false ? 'primary' : 'secondary'} aria-pressed={mine?.assistanceApproved === false} onClick={() => client.approveAssistance(false)}>
                {t('lobby.je_prefere_sans')}</Button>
              {mine?.assistanceApproved === null && <span className="text-xs text-ivory-200/80">{t('lobby.vous_n_avez')}</span>}
            </div>
            <p className="mt-2 text-xs text-ivory-200/80" aria-live="polite">
              {allApproved ? t('lobby.tous_les_joueurs') : t('lobby.tant_que_tout')}
            </p>
          </section>
        ) : (
          <p className="mt-3 text-center text-xs text-ivory-200/80">{t('lobby.partie_sans_assistance')}</p>
        )}

        <h3 className="mb-2 mt-7 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('lobby.joueurs_connectes')}</h3>
        <ul className="space-y-2" aria-label={t('lobby.joueurs')}>
          {view.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2.5">
              <Avatar nickname={p.nickname} avatar={p.avatar} />
              <span className="flex-1 font-medium text-ivory-50">
                {p.nickname}
                {p.id === view.you.playerId && <span className="ml-2 text-xs text-ivory-200/80">{t('lobby.vous')}</span>}
              </span>
              {p.isHost && <Badge tone="gold">{t('lobby.hote')}</Badge>}
              {view.config.assistance && (
                <Badge tone={p.assistanceApproved === true ? 'green' : p.assistanceApproved === false ? 'red' : 'neutral'}>
                  {p.assistanceApproved === true ? t('lobby.assistance_approuvee') : p.assistanceApproved === false ? t('lobby.assistance_refusee') : t('lobby.assistance_en_attente')}
                </Badge>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs ${p.connected ? 'text-jade-300' : 'text-ivory-300/60'}`}>
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-jade-400' : 'bg-ivory-300/40'}`} />
                {p.connected ? t('lobby.en_ligne') : t('lobby.hors_ligne')}
              </span>
              {isHost && !p.isHost && (
                <Button variant="danger" className="min-h-[36px] px-3 py-1 text-xs" aria-label={t('lobby.retirer2', { nickname: p.nickname })} onClick={() => client.excludePlayer(p.id)}>
                  {t('lobby.retirer')}</Button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, view.seatsLeft) }, (_, i) => (
            <li key={`free-${i}`} className="rounded-xl border border-dashed border-ivory-100/15 px-3 py-3 text-center text-sm text-ivory-300/50">
              {t('lobby.place_libre')}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ivory-200/80">{t('lobby.les_positions_utg')}</p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isHost ? (
            <>
              <Button variant="ghost" className="text-ruby-200 hover:text-ruby-100" onClick={() => setConfirmCancel(true)}>
                {t('lobby.annuler_la_partie')}</Button>
              <Button className="px-8 py-3 text-base" disabled={n < 2} onClick={() => client.startGame()}>
                {t('lobby.demarrer_la_partie')}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => client.leaveLobby()}>
                {t('lobby.quitter_la_salle')}</Button>
              <p className="self-center text-sm text-ivory-200/80" aria-live="polite">
                {t('lobby.en_attente_de')}</p>
            </>
          )}
        </div>
        {isHost && n < 2 && (
          <>
            <p className="mt-2 text-right text-sm text-ivory-200/85">{t('lobby.il_faut_au')}</p>
            <p className="text-right text-sm text-ivory-200/85">{t('lobby.partagez')}</p>
          </>
        )}
      </Panel>
    </main>
  );
}
