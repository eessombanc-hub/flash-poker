import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { useAccountClient } from '../lib/context';
import type { AchievementTier, Engagement as EngagementData, LeaderboardRow, XpRanking } from '../lib/types';
import { LEAGUE_KEY, LeagueBadge, LeagueCard, useProgression } from './League';
import { EmblemBadge, FramedAvatar, TitleTag } from './Cosmetics';
import { Avatar } from './ui';

const CHALLENGE = { play1: 'eg.play1', play3: 'eg.play3', win1: 'eg.win1' } as const;
export const ACHIEVEMENT = {
  first_game: 'eg.trophy.first_game',
  games_10: 'eg.trophy.games_10',
  games_50: 'eg.trophy.games_50',
  games_100: 'eg.feat.games_100',
  games_250: 'eg.feat.games_250',
  first_win: 'eg.trophy.first_win',
  wins_10: 'eg.trophy.wins_10',
  wins_25: 'eg.trophy.wins_25',
  wins_50: 'eg.feat.wins_50',
  wins_100: 'eg.feat.wins_100',
  win_row_3: 'eg.trophy.win_row_3',
  win_row_5: 'eg.feat.win_row_5',
  streak_3: 'eg.trophy.streak_3',
  streak_7: 'eg.trophy.streak_7',
  streak_14: 'eg.feat.streak_14',
  streak_30: 'eg.feat.streak_30',
  challenges_5: 'eg.feat.challenges_5',
  challenges_25: 'eg.feat.challenges_25',
  challenges_100: 'eg.feat.challenges_100',
  perfect_day: 'eg.feat.perfect_day',
  perfect_days_7: 'eg.feat.perfect_days_7',
  bj_hands_50: 'eg.feat.bj_hands_50',
  bj_hands_250: 'eg.feat.bj_hands_250',
  bj_wins_50: 'eg.feat.bj_wins_50',
  tb_first: 'eg.feat.tb_first',
  tb_wins_10: 'eg.feat.tb_wins_10',
  explorer_3: 'eg.feat.explorer_3',
  explorer_all: 'eg.feat.explorer_all',
  variant_wins_3: 'eg.feat.variant_wins_3',
} as const;
const TIER_KEY = { bronze: 'feat.tier.bronze', silver: 'feat.tier.silver', gold: 'feat.tier.gold', platinum: 'feat.tier.platinum' } as const;
const TIER_STYLE: Record<AchievementTier, { on: string; chip: string }> = {
  bronze: { on: 'border-[#d9946a]/60 bg-[#d9946a]/10', chip: 'bg-[#d9946a]/25 text-[#f0c4a0]' },
  silver: { on: 'border-[#c8cfd9]/60 bg-[#c8cfd9]/10', chip: 'bg-[#c8cfd9]/25 text-[#eef1f5]' },
  gold: { on: 'border-gold-400/70 bg-gold-500/12', chip: 'bg-gold-500/25 text-gold-300' },
  platinum: { on: 'border-[#8fe3e6]/70 bg-[#8fe3e6]/10', chip: 'bg-[#8fe3e6]/25 text-[#d6fbfc]' },
};

/** Charge le bilan du jour ; échoue en silence (réseau absent) : ce bandeau n'est jamais bloquant. */
export function useEngagement(): EngagementData | null {
  const account = useAccountClient();
  const [data, setData] = useState<EngagementData | null>(null);
  useEffect(() => {
    let alive = true;
    account?.engagement().then((d) => alive && setData(d), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);
  return data;
}

const Bar = ({ value, target, done }: { value: number; target: number; done: boolean }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-ink-950/70" aria-hidden="true">
    <div className={`h-full rounded-full ${done ? 'bg-jade-400' : 'bg-gradient-to-r from-gold-500 to-gold-300'}`} style={{ width: `${Math.round((value / target) * 100)}%` }} />
  </div>
);

/** Onglet « Défis » : défis du jour, série de jours, trophées et classement de la semaine entre favoris. */
export function EngagementPanel() {
  const { t } = useI18n();
  const account = useAccountClient();
  const data = useEngagement();
  const prog = useProgression();
  const [xpBoard, setXpBoard] = useState<XpRanking | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    account?.xpRanking().then((r) => alive && setXpBoard(r), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);
  useEffect(() => {
    let alive = true;
    account?.leaderboard().then((r) => alive && setRows(r), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);
  if (!data) return <p className="py-6 text-center text-sm text-ivory-300/70" role="status">…</p>;

  return (
    <div className="space-y-8">
      {prog && <LeagueCard data={prog} />}
      <section aria-labelledby="eg-daily">
        <h2 id="eg-daily" className="font-display text-2xl text-ivory-50">{t('eg.title')}</h2>
        <p className="mt-1 text-sm text-ivory-300/75">{t('eg.reset')}</p>
        <ul className="mt-4 space-y-2.5">
          {data.challenges.map((c) => (
            <li key={c.id} className={`rounded-xl border p-3.5 ${c.done ? 'border-jade-500/50 bg-jade-950/40' : 'border-ivory-100/12 bg-ink-900/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ivory-50">{t(CHALLENGE[c.id])}</span>
                <span className={`text-sm ${c.done ? 'font-semibold text-jade-300' : 'text-ivory-300/80'}`}>{c.done ? t('eg.done') : `${c.progress}/${c.target}`}</span>
              </div>
              <div className="mt-2"><Bar value={c.progress} target={c.target} done={c.done} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="eg-streak" className="flex items-center gap-4 rounded-2xl border border-gold-500/40 bg-gradient-to-r from-felt-800 to-ink-900 p-4">
        <span aria-hidden="true" className="font-display text-5xl leading-none text-gold-300">{data.streak}</span>
        <div>
          <h2 id="eg-streak" className="font-display text-xl text-ivory-50">{t('eg.streak')} <span className="text-gold-300">· {t('eg.days', { n: data.streak })}</span></h2>
          <p className="text-sm text-ivory-200/80">{data.bestStreak > 0 ? `${t('eg.best', { n: data.bestStreak })}. ` : ''}{t('eg.streak.hint')}</p>
        </div>
      </section>

      <section aria-labelledby="eg-trophies">
        <h2 id="eg-trophies" className="font-display text-2xl text-ivory-50">{t('eg.feats')}</h2>
        <p className="mt-1 text-sm text-ivory-300/75">{prog ? t('eg.feats.count', { n: prog.achievements.filter((x) => x.unlocked).length, total: prog.achievements.length }) : ''} {t('eg.feats.hint')}</p>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {(prog?.achievements ?? []).map((x) => (
            <li key={x.id} className={`rounded-xl border p-3 ${x.unlocked ? TIER_STYLE[x.tier].on : 'border-ivory-100/10 bg-ink-900/40 text-ivory-300/70'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={x.unlocked ? 'font-medium text-ivory-50' : ''}>{t(ACHIEVEMENT[x.id as keyof typeof ACHIEVEMENT])}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLE[x.tier].chip}`}>{t(TIER_KEY[x.tier])}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className={x.unlocked ? 'text-gold-300' : ''}>{x.unlocked ? `★ ${t('eg.feats.unlocked')}` : `${x.value}/${x.target}`}</span>
                <span className="tabular-nums text-ivory-300/80">+{x.xp} {t('xp.unit')}</span>
              </div>
              {!x.unlocked && <div className="mt-2"><Bar value={x.value} target={x.target} done={false} /></div>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="eg-xpboard">
        <h2 id="eg-xpboard" className="font-display text-2xl text-ivory-50">{t('xp.board')}</h2>
        <p className="mt-1 text-sm text-ivory-300/75">{t('xp.board.hint')}</p>
        {xpBoard && <p className="mt-0.5 text-xs text-ivory-300/65">{t('season.label', { n: xpBoard.season.quarter, year: xpBoard.season.year })}</p>}
        {xpBoard && xpBoard.rows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-ivory-100/15 px-4 py-6 text-center text-sm text-ivory-300/75">{t('xp.board.empty')}</p>
        ) : (
          <ol className="mt-3 divide-y divide-ivory-100/10 rounded-xl border border-ivory-100/10">
            {[...(xpBoard?.rows ?? []), ...(xpBoard?.mine ? [xpBoard.mine] : [])].map((r) => (
              <li key={`${r.rank}-${r.nickname}`} className={`flex items-center gap-3 px-3 py-2 ${r.you ? 'bg-gold-500/10' : ''}`}>
                <span className="w-6 text-right text-xs tabular-nums text-ivory-300/70">{r.rank}</span>
                <LeagueBadge league={r.league} size={28} />
                <FramedAvatar nickname={r.nickname} avatar={r.avatar} size={28} frame={r.frame} />
                <span className="min-w-0 flex-1 truncate font-medium text-ivory-50">
                  {r.nickname}{r.you && <span className="ml-1.5 text-xs text-gold-300">({t('eg.you')})</span>}
                  {r.club && <span className="ml-1.5 text-xs font-normal text-ivory-300/70">[{r.club}]</span>}
                  {r.emblem && <span className="ml-1.5 inline-flex align-middle"><EmblemBadge id={r.emblem} size={16} /></span>}
                  <span className="ml-2 text-xs font-normal text-ivory-300/70">{r.title ? <TitleTag id={r.title} /> : t(LEAGUE_KEY[r.league])}</span>
                </span>
                <span className="tabular-nums text-sm text-ivory-50">{r.xp.toLocaleString()} <span className="text-xs text-ivory-300/70">{t('xp.unit')}</span></span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="eg-board">
        <h2 id="eg-board" className="font-display text-2xl text-ivory-50">{t('eg.board')}</h2>
        <p className="mt-1 text-sm text-ivory-300/75">{t('eg.board.hint')}</p>
        {rows && rows.length <= 1 ? (
          <p className="mt-3 rounded-xl border border-dashed border-ivory-100/15 px-4 py-6 text-center text-sm text-ivory-300/75">{t('eg.board.empty')}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ivory-300/70">
                <th scope="col" className="py-1 font-medium">&nbsp;</th>
                <th scope="col" className="py-1 text-right font-medium">{t('eg.wins')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('eg.games')}</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r, i) => (
                <tr key={r.id} className={`border-t border-ivory-100/10 ${r.you ? 'bg-gold-500/10' : ''}`}>
                  <th scope="row" className="flex items-center gap-2.5 py-2 text-left font-medium text-ivory-50">
                    <span aria-hidden="true" className="w-4 text-right text-xs text-ivory-300/70">{i + 1}</span>
                    <Avatar nickname={r.nickname} avatar={r.avatar} size={28} />
                    <span className="truncate">{r.nickname}{r.you && <span className="ml-1.5 text-xs text-gold-300">({t('eg.you')})</span>}</span>
                  </th>
                  <td className="py-2 text-right tabular-nums text-ivory-50">{r.wins}</td>
                  <td className="py-2 text-right tabular-nums text-ivory-300/80">{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Bandeau de l'accueil pour un joueur connecté : avancement des défis du jour et série. */
export function DailyStrip({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const data = useEngagement();
  const prog = useProgression();
  if (!data) return null;
  const done = data.challenges.filter((c) => c.done).length;
  return (
    <section aria-label={t('eg.title')} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ivory-100/12 bg-ink-800/60 px-4 py-3">
      <p className="text-sm text-ivory-100">
        <span className="font-semibold text-gold-300">{t('eg.home', { done, total: data.challenges.length })}</span>
        {data.streak > 0 && <span className="text-ivory-300/80"> · {t('eg.streak')} : {t('eg.days', { n: data.streak })}</span>}
      </p>
      {prog && (
        <p className="flex items-center gap-2 text-sm text-ivory-100">
          <LeagueBadge league={prog.league.id} size={26} />
          <span><span className="font-semibold">{t(LEAGUE_KEY[prog.league.id])}</span> <span className="text-ivory-300/80">· {prog.xp.toLocaleString()} {t('xp.unit')}</span></span>
        </p>
      )}
      <button type="button" onClick={onOpen} className="rounded-full border border-gold-500/50 px-3 py-1.5 text-sm font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('eg.home.cta')}</button>
    </section>
  );
}
