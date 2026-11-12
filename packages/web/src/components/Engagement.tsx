import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { useAccountClient } from '../lib/context';
import type { Engagement as EngagementData, LeaderboardRow } from '../lib/types';
import { Avatar } from './ui';

const CHALLENGE = { play1: 'eg.play1', play3: 'eg.play3', win1: 'eg.win1' } as const;
const TROPHY = {
  first_game: 'eg.trophy.first_game',
  games_10: 'eg.trophy.games_10',
  games_50: 'eg.trophy.games_50',
  first_win: 'eg.trophy.first_win',
  wins_10: 'eg.trophy.wins_10',
  wins_25: 'eg.trophy.wins_25',
  win_row_3: 'eg.trophy.win_row_3',
  streak_3: 'eg.trophy.streak_3',
  streak_7: 'eg.trophy.streak_7',
} as const;

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
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
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
        <h2 id="eg-trophies" className="font-display text-2xl text-ivory-50">{t('eg.trophies')}</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {data.trophies.map((x) => (
            <li key={x.id} className={`rounded-xl border p-3 ${x.unlocked ? 'border-gold-400/60 bg-gold-500/10' : 'border-ivory-100/10 bg-ink-900/40 text-ivory-300/70'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={x.unlocked ? 'font-medium text-ivory-50' : ''}>{t(TROPHY[x.id as keyof typeof TROPHY])}</span>
                <span className={`text-xs ${x.unlocked ? 'text-gold-300' : ''}`}>{x.unlocked ? '★' : `${x.value}/${x.target}`}</span>
              </div>
              {!x.unlocked && <div className="mt-2"><Bar value={x.value} target={x.target} done={false} /></div>}
            </li>
          ))}
        </ul>
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
  if (!data) return null;
  const done = data.challenges.filter((c) => c.done).length;
  return (
    <section aria-label={t('eg.title')} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ivory-100/12 bg-ink-800/60 px-4 py-3">
      <p className="text-sm text-ivory-100">
        <span className="font-semibold text-gold-300">{t('eg.home', { done, total: data.challenges.length })}</span>
        {data.streak > 0 && <span className="text-ivory-300/80"> · {t('eg.streak')} : {t('eg.days', { n: data.streak })}</span>}
      </p>
      <button type="button" onClick={onOpen} className="rounded-full border border-gold-500/50 px-3 py-1.5 text-sm font-semibold text-gold-300 hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('eg.home.cta')}</button>
    </section>
  );
}
