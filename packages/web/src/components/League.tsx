import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { EmblemBadge, FramedAvatar, TitleTag } from './Cosmetics';
import { useAccount } from '../lib/context';
import { useAccountClient } from '../lib/context';
import type { LeagueId, ProgressionReply } from '../lib/types';

export const LEAGUE_ORDER: readonly LeagueId[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend'];

export const LEAGUE_KEY = {
  bronze: 'league.bronze',
  silver: 'league.silver',
  gold: 'league.gold',
  platinum: 'league.platinum',
  diamond: 'league.diamond',
  master: 'league.master',
  legend: 'league.legend',
} as const;

const TONE: Record<LeagueId, { a: string; b: string; ring: string }> = {
  bronze: { a: '#d9946a', b: '#8a4f2c', ring: '#f0c4a0' },
  silver: { a: '#e4e8ee', b: '#8d96a3', ring: '#ffffff' },
  gold: { a: '#f2d98f', b: '#b08a3c', ring: '#fff3c9' },
  platinum: { a: '#aef0ee', b: '#4f9fa6', ring: '#e6ffff' },
  diamond: { a: '#a9ccff', b: '#3f6fd1', ring: '#e3efff' },
  master: { a: '#d2b0ff', b: '#7a45c9', ring: '#f1e4ff' },
  legend: { a: '#ffb070', b: '#d9363e', ring: '#ffe3c9' },
};

/** Écusson de ligue : bouclier à reflets, orné d'autant d'étoiles que de ligues franchies (de Bronze à Légende). */
export function LeagueBadge({ league, size = 64 }: { league: LeagueId; size?: number }) {
  const { t } = useI18n();
  const c = TONE[league];
  const stars = LEAGUE_ORDER.indexOf(league);
  const gid = `lg-${league}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={t(LEAGUE_KEY[league])}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.a} />
          <stop offset="1" stopColor={c.b} />
        </linearGradient>
      </defs>
      <path d="M32 3 55 11v19c0 15-9.5 26-23 31C18.5 56 9 45 9 30V11z" fill={`url(#${gid})`} stroke={c.ring} strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 9 49 15v15c0 11.5-7 20-17 24.500C22 50 15 41.500 15 30V15z" fill="none" stroke="#000" strokeOpacity=".22" strokeWidth="1.5" />
      <path d="M32 3 55 11v10C45 18 38 15 32 8 26 15 19 18 9 21V11z" fill="#fff" fillOpacity=".22" />
      <g fill="#fff" fillOpacity=".95">
        {Array.from({ length: stars + 1 }, (_, i) => {
          const n = stars + 1;
          const x = 32 + (i - (n - 1) / 2) * 6.5;
          return <circle key={i} cx={x} cy={34} r={2.3} />;
        })}
      </g>
    </svg>
  );
}

/** Charge la progression d'expérience ; échoue en silence (réseau absent) : l'affichage reste facultatif. */
export function useProgression(): ProgressionReply | null {
  const account = useAccountClient();
  const [data, setData] = useState<ProgressionReply | null>(null);
  useEffect(() => {
    let alive = true;
    account?.progression().then((d) => alive && setData(d), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);
  return data;
}

/** Carte de ligue : écusson, points d'expérience, avancement vers la ligue suivante et position générale. */
export function LeagueCard({ data }: { data: ProgressionReply }) {
  const { t, tp } = useI18n();
  const me = useAccount((s) => s.account);
  const days = Math.max(1, Math.ceil((data.season.end - Date.now()) / 86_400_000));
  const { league } = data;
  const tone = TONE[league.id];
  const left = league.next ? league.next.floor - data.xp : 0;
  return (
    <section aria-labelledby="lg-title" className="relative overflow-hidden rounded-2xl border border-gold-500/40 bg-gradient-to-br from-felt-800 via-ink-900 to-ink-950 p-4 sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25 blur-2xl" style={{ background: tone.a }} />
      <p className="relative mb-3 flex flex-wrap items-center justify-between gap-x-3 text-xs text-ivory-300/85">
        <span className="font-semibold text-gold-300">{t('season.label', { n: data.season.quarter, year: data.season.year })}</span>
        <span>{tp('season.left', days)}</span>
      </p>
      <div className="relative flex items-center gap-4">
        <LeagueBadge league={league.id} size={76} />
        <div className="min-w-0 flex-1">
          <h2 id="lg-title" className="flex items-center gap-2 font-display text-2xl text-ivory-50">
            {t(LEAGUE_KEY[league.id])}
            {data.equipped.emblem && <EmblemBadge id={data.equipped.emblem} size={22} />}
          </h2>
          {data.equipped.title && <p><TitleTag id={data.equipped.title} /></p>}
          <p className="text-sm text-ivory-200/85">
            <span className="font-semibold tabular-nums text-gold-300">{data.xp.toLocaleString()}</span> {t('xp.unit')}
            {data.rank !== null && <span className="text-ivory-300/80"> · {t('xp.rank', { rank: data.rank, total: data.players })}</span>}
          </p>
        </div>
      </div>
      <div className="relative mt-4">
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-950/80" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(league.progress * 100)} aria-label={t('xp.progress')}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(league.progress * 100)}%`, background: `linear-gradient(90deg, ${tone.b}, ${tone.a})` }} />
        </div>
        <p className="mt-1.5 text-xs text-ivory-300/80">{league.next ? t('xp.next', { n: left.toLocaleString(), league: t(LEAGUE_KEY[league.next.id]) }) : t('xp.top')}</p>
      </div>
      {data.equipped.frame && me && (
        <div className="absolute right-4 top-4"><FramedAvatar nickname={me.nickname} avatar={me.avatar} size={36} frame={data.equipped.frame} /></div>
      )}
      <p className="relative mt-3 text-xs text-ivory-300/70">
        {t('xp.breakdown', { games: data.breakdown.games.toLocaleString(), challenges: data.breakdown.challenges.toLocaleString(), feats: data.breakdown.achievements.toLocaleString() })}
      </p>
      <p className="relative mt-1 text-xs text-ivory-300/60">{t('season.reset')}</p>
    </section>
  );
}
