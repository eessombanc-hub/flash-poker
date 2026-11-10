import { useEffect, useState } from 'react';
import type { AccountClient } from '../../lib/account';
import type { TableauVariant, TbLeaderboardRow, TbProfileDto } from '../../lib/types';
import { useI18n, type Key } from '../../i18n';
import { Badge, Panel } from '../ui';

/** Nombre de points d'expérience offerts par défi : identique au serveur (TB_CHALLENGE_XP). */
const CHALLENGE_XP = 40;

/** Pastille de ligue : numéro et nom, dans la langue choisie. */
export function LeagueBadge({ id, className = '' }: { id: number; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-gold-400/60 bg-gold-500/10 px-2.5 py-0.5 text-sm font-semibold text-gold-200 ${className}`}>
      <span aria-hidden="true" className="tabular-nums text-gold-300">{id}</span>
      {t(`tb.league.${id}` as Key)}
    </span>
  );
}

/** Progression du joueur connecté : ligue, statistiques de la variante, défis du jour et classement. */
export function ProgressPanel({ client, variant, refreshKey }: { client: AccountClient; variant: TableauVariant; refreshKey?: unknown }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<TbProfileDto | null>(null);
  const [board, setBoard] = useState<TbLeaderboardRow[] | null>(null);

  useEffect(() => {
    let off = false;
    setProfile(null);
    setBoard(null);
    client.tbProfile(variant).then((p) => !off && setProfile(p)).catch(() => undefined);
    client.tbLeaderboard(variant).then((b) => !off && setBoard(b)).catch(() => undefined);
    return () => {
      off = true;
    };
  }, [client, variant, refreshKey]);

  if (!profile) return null;
  const s = profile.standing;
  const stats: [string, number][] = [
    ['games', profile.games], ['wins', profile.wins], ['losses', profile.losses], ['draws', profile.draws],
    ['streak', profile.streak], ['best', profile.bestStreak], ['cols', profile.colsWon], ['sf', profile.sfWins],
  ];
  return (
    <div className="space-y-4">
      <Panel className="p-5" data-testid="tb-progress">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-ivory-50">{t('tb.profile.title')}</h2>
          <span className="flex items-center gap-2">
            <Badge tone="neutral">{t(`tb.variant.${variant}` as Key)}</Badge>
            <LeagueBadge id={s.league.id} />
          </span>
        </div>
        <p className="mt-1 text-sm text-ivory-200">
          <span className="tabular-nums text-lg text-gold-300">{t('tb.profile.points', { r: profile.rating })}</span>
          <span className="ml-2 text-xs text-ivory-300/80">{t('tb.profile.league', { n: s.league.id })}</span>
        </p>
        <div
          role="progressbar"
          aria-label={t('tb.profile.title')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.progress * 100)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-ink-900"
        >
          <div className="h-full rounded-full bg-gold-400" style={{ width: `${Math.round(s.progress * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-ivory-300/85">
          {s.next ? t('tb.profile.toNext', { n: s.toNext, league: t(`tb.league.${s.next.id}` as Key) }) : t('tb.profile.top')}
        </p>
        <p className="mt-1 text-xs text-ivory-300/85">
          {profile.position !== null ? t('tb.profile.position', { p: profile.position }) : t('tb.profile.unranked')}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-900/60 px-3 py-2">
              <dt className="text-[11px] text-ivory-300/80">{t(`tb.stat.${k}` as Key)}</dt>
              <dd className="tabular-nums text-lg text-ivory-50">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ivory-300/80">{t('tb.stat.peak')} {profile.peak}</p>
      </Panel>

      <Panel className="p-5" data-testid="tb-challenges">
        <h2 className="font-display text-xl text-ivory-50">{t('tb.chal.title')}</h2>
        <p className="mt-1 text-xs text-ivory-300/85">{t('tb.chal.text', { xp: CHALLENGE_XP })}</p>
        <ul className="mt-2 space-y-2">
          {profile.challenges.map((c) => (
            <li key={c.id} className="rounded-xl bg-ink-900/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-sm text-ivory-100">
                <span>{t(`tb.chal.${c.id}` as Key)}</span>
                {c.done ? <Badge tone="green">{t('tb.chal.done')}</Badge> : <span className="tabular-nums text-xs text-ivory-300">{t('tb.chal.progress', { p: c.progress, g: c.goal })}</span>}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800" aria-hidden="true">
                <div className={`h-full rounded-full ${c.done ? 'bg-emerald-400' : 'bg-gold-400'}`} style={{ width: `${Math.round((c.progress / c.goal) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-5" data-testid="tb-leaderboard">
        <h2 className="font-display text-xl text-ivory-50">{t('tb.lb.title')}</h2>
        {board && board.length === 0 ? (
          <p className="mt-2 text-sm text-ivory-300/85">{t('tb.lb.empty')}</p>
        ) : (
          <ol className="mt-2 divide-y divide-ivory-100/10">
            {(board ?? []).map((r) => (
              <li key={r.position} className={`flex items-center gap-3 py-2 text-sm ${r.you ? 'text-gold-200' : 'text-ivory-100'}`}>
                <span className="w-6 shrink-0 text-center tabular-nums text-ivory-300/80">{r.position}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.nickname}
                  {r.you ? <span className="ml-1.5 text-xs text-gold-300">({t('tb.lb.you')})</span> : null}
                </span>
                <LeagueBadge id={r.leagueId} className="hidden sm:inline-flex" />
                <span className="w-16 shrink-0 text-right tabular-nums">{r.rating}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
