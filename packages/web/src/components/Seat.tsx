import { PlayingCard } from './Card';
import { Avatar, Badge, ScorePips } from './ui';
import { pointsLabel } from '../lib/format';
import { useSettings } from '../lib/settings';
import type { PlayerPublic } from '../lib/types';
import { useI18n } from '../i18n';

export interface SeatProps {
  player: PlayerPublic;
  isMe: boolean;
  target: number;
  shown: string[];
  hiddenCount: number;
  /** Une action est attendue de ce joueur. */
  active: boolean;
  /** Il a déjà validé sa sélection. */
  validated: boolean;
  folded: boolean;
  insured: boolean;
  isChooser: boolean;
  score: number;
  compact?: boolean;
}

/** Siège d'un joueur : identité, points, statut, et ses cartes (dos pour les cartes cachées). */
export function Seat({ player, isMe, target, shown, hiddenCount, active, validated, folded, insured, isChooser, score, compact }: SeatProps) {
  const { t, tp } = useI18n();
  const { fourColor, cardBack } = useSettings();
  const out = player.excluded;
  if (compact) return <CompactSeat {...{ player, isMe, target, shown, active, validated, folded, insured, isChooser, score, out, fourColor }} />;
  return (
    <div
      className={`flex ${compact ? 'min-w-0 gap-1 px-2 py-1.5' : 'min-w-[9.5rem] gap-1.5 px-3 py-2.5'} flex-col items-center rounded-2xl border text-center transition ${active ? 'border-gold-400 bg-ink-800/95 shadow-gold' : 'border-ivory-100/15 bg-ink-900/80'} ${out || folded ? 'opacity-60' : ''}`}
      data-testid={`seat-${player.id}`}
      data-seat={player.id}
      aria-label={t('seat.txt', { nickname: player.nickname, v: isMe ? t('seat.vous_suffixe') : '', v2: player.bot ? t('seat.cpu_suffixe') : '', t: player.position ?? t('seat.sans_position'), pointsLabel: pointsLabel(score) })}
    >
      <div className="flex items-center gap-1.5">
        <Avatar nickname={player.nickname} avatar={player.avatar} size={compact ? 26 : 38} dim={!player.connected || out} />
        <div className="text-left leading-tight">
          <p className={`${compact ? 'max-w-[5.5rem] text-xs' : 'max-w-[7.5rem] text-sm'} truncate font-semibold text-ivory-50`}>
            {player.nickname}
            {isMe && <span className="ml-1 text-[11px] font-normal text-ivory-300/70">{t('seat.vous')}</span>}
          </p>
          <p className="text-xs tracking-wide text-gold-400">{player.position ?? '—'}</p>
        </div>
        {compact && <ScorePips score={score} target={target} />}
      </div>
      {!compact && <ScorePips score={score} target={target} />}
      <div className={`flex ${compact ? 'min-h-[1.1rem]' : 'min-h-[1.25rem]'} flex-wrap justify-center gap-1`}>
        {player.bot && <Badge tone="neutral">{t('seat.cpu')}</Badge>}
        {out && <Badge tone="red">{t('seat.exclu')}</Badge>}
        {!out && !player.connected && <Badge tone="neutral">{t('seat.hors_ligne')}</Badge>}
        {folded && <Badge tone="amber">{t('seat.couche')}</Badge>}
        {!folded && !out && validated && <Badge tone="green">{t('seat.a_valide')}</Badge>}
        {!folded && !out && !validated && active && (isMe ? <Badge tone="gold">{t('seat.a_jouer')}</Badge> : <Badge tone="gold"><span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulseRing rounded-full bg-ink-950" aria-hidden="true" />{t('seat.reflechit')}</Badge>)}
        {isChooser && <Badge tone="gold">{t('seat.choisit')}</Badge>}
        {insured && <Badge tone="gold">{t('seat.assure')}</Badge>}
      </div>
      {(shown.length > 0 || (hiddenCount > 0 && !compact)) && !folded && (
        <div className="flex -space-x-4 pt-0.5" aria-label={`${tp('seat.cachee', hiddenCount)}, ${tp('seat.visible', shown.length)}`}>
          {shown.map((c) => (
            <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
          ))}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <PlayingCard key={`h${i}`} code={null} size="xs" back={cardBack} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Siège compact (téléphone, rangée de sièges sur écran large) : tient sur une seule ligne dans le cas courant.
 * Le statut habituel (à jouer, réfléchit, a validé) devient un pictogramme, son texte restant lu par les lecteurs
 * d'écran ; les statuts plus rares (exclu, hors ligne, couché, choisit, assuré) gardent leur pastille en dessous.
 */
function CompactSeat({ player, isMe, target, shown, active, validated, folded, insured, isChooser, score, out, fourColor }: Omit<SeatProps, 'hiddenCount' | 'compact'> & { out: boolean; fourColor: boolean }) {
  const { t, tp } = useI18n();
  const status = folded || out ? null : validated ? t('seat.a_valide') : active ? (isMe ? t('seat.a_jouer') : t('seat.reflechit')) : null;
  const rare = out || !player.connected || folded || isChooser || insured;
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-xl border px-1.5 py-1 transition ${active ? 'border-gold-400 bg-ink-800/95 shadow-gold' : 'border-ivory-100/15 bg-ink-900/80'} ${out || folded ? 'opacity-60' : ''}`}
      data-testid={`seat-${player.id}`}
      data-seat={player.id}
      aria-label={t('seat.txt', { nickname: player.nickname, v: isMe ? t('seat.vous_suffixe') : '', v2: player.bot ? t('seat.cpu_suffixe') : '', t: player.position ?? t('seat.sans_position'), pointsLabel: pointsLabel(score) })}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Avatar nickname={player.nickname} avatar={player.avatar} size={22} dim={!player.connected || out} />
        <div className="min-w-0 flex-1 text-left leading-tight">
          <p className={`truncate text-xs font-semibold ${isMe ? 'text-gold-300' : 'text-ivory-50'}`}>{player.nickname}</p>
          <p className="whitespace-nowrap text-[10px] tracking-wide text-gold-400">{player.position ?? ''}{player.bot ? (player.position ? ', CPU' : 'CPU') : ''}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <ScorePips score={score} target={target} small />
          {status && (
            <span className={`text-[10px] font-semibold leading-none ${validated ? 'text-jade-300' : 'text-gold-300'}`}>
              {validated ? (
                <span aria-hidden="true">✓</span>
              ) : (
                <span className="inline-block h-1.5 w-1.5 animate-pulseRing rounded-full bg-gold-400" aria-hidden="true" />
              )}
              <span className="sr-only">{status}</span>
            </span>
          )}
        </div>
      </div>
      {rare && (
        <div className="flex flex-wrap justify-center gap-1">
          {out && <Badge tone="red">{t('seat.exclu')}</Badge>}
          {!out && !player.connected && <Badge tone="neutral">{t('seat.hors_ligne')}</Badge>}
          {folded && <Badge tone="amber">{t('seat.couche')}</Badge>}
          {isChooser && <Badge tone="gold">{t('seat.choisit')}</Badge>}
          {insured && <Badge tone="gold">{t('seat.assure')}</Badge>}
        </div>
      )}
      {shown.length > 0 && !folded && (
        <div className="flex justify-center -space-x-4 pt-0.5" aria-label={tp('seat.visible', shown.length)}>
          {shown.map((c) => (
            <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
          ))}
        </div>
      )}
    </div>
  );
}
