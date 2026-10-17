import { PlayingCard } from './Card';
import { Avatar, Badge, ScorePips } from './ui';
import { pointsLabel } from '../lib/format';
import { useSettings } from '../lib/settings';
import type { PlayerPublic } from '../lib/types';

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
  const { fourColor } = useSettings();
  const out = player.excluded;
  return (
    <div
      className={`flex ${compact ? 'min-w-0 gap-1 px-2 py-1.5' : 'min-w-[9.5rem] gap-1.5 px-3 py-2.5'} flex-col items-center rounded-2xl border text-center transition ${active ? 'border-gold-400 bg-ink-800/95 shadow-gold' : 'border-ivory-100/15 bg-ink-900/80'} ${out || folded ? 'opacity-60' : ''}`}
      data-testid={`seat-${player.id}`}
      aria-label={`${player.nickname}${isMe ? ' (vous)' : ''}, ${player.position ?? 'sans position'}, ${pointsLabel(score)}`}
    >
      <div className="flex items-center gap-1.5">
        <Avatar nickname={player.nickname} avatar={player.avatar} size={compact ? 26 : 38} dim={!player.connected || out} />
        <div className="text-left leading-tight">
          <p className={`${compact ? 'max-w-[5.5rem] text-xs' : 'max-w-[7.5rem] text-sm'} truncate font-semibold text-ivory-50`}>
            {player.nickname}
            {isMe && <span className="ml-1 text-[11px] font-normal text-ivory-300/70">(vous)</span>}
          </p>
          <p className="text-[10px] tracking-wide text-gold-400">{player.position ?? '—'}</p>
        </div>
      </div>
      <ScorePips score={score} target={target} />
      <div className="flex min-h-[1.25rem] flex-wrap justify-center gap-1">
        {out && <Badge tone="red">Exclu</Badge>}
        {!out && !player.connected && <Badge tone="neutral">Hors ligne</Badge>}
        {folded && <Badge tone="amber">Couché</Badge>}
        {!folded && !out && validated && <Badge tone="green">A validé</Badge>}
        {!folded && !out && !validated && active && (isMe ? <Badge tone="gold">À jouer</Badge> : <Badge tone="gold"><span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulseRing rounded-full bg-ink-950" aria-hidden="true" />réfléchit…</Badge>)}
        {isChooser && <Badge tone="gold">Choisit</Badge>}
        {insured && <Badge tone="gold">Assuré</Badge>}
      </div>
      {(shown.length > 0 || (hiddenCount > 0 && !compact)) && !folded && (
        <div className="flex -space-x-4 pt-0.5" aria-label={`${hiddenCount} carte${hiddenCount > 1 ? 's' : ''} cachée${hiddenCount > 1 ? 's' : ''}, ${shown.length} visible${shown.length > 1 ? 's' : ''}`}>
          {shown.map((c) => (
            <PlayingCard key={c} code={c} size="xs" fourColor={fourColor} />
          ))}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <PlayingCard key={`h${i}`} code={null} size="xs" />
          ))}
        </div>
      )}
    </div>
  );
}
