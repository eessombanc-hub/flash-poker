import { useEffect, useState } from 'react';
import { currentI18n, useI18n } from '../i18n';
import { useAccount, useAccountClient } from '../lib/context';
import { errorText } from '../lib/tbText';
import { formatSignedChips } from '../lib/format';
import type { ClubGameRanking, ClubGameRow, ClubRankRow, ClubRanking, RankGame, RankPeriod } from '../lib/types';

const MEDAL = ['🥇', '🥈', '🥉'];

function Row({ r }: { r: ClubRankRow }) {
  const { t, tp } = useI18n();
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.you ? 'border border-gold-500/60 bg-gold-500/10' : 'border border-transparent odd:bg-ink-900/40'}`} aria-current={r.you ? 'true' : undefined}>
      <span className="w-8 shrink-0 text-center font-display text-lg text-gold-300" aria-label={t('rk.rank', { n: r.rank })}>{MEDAL[r.rank - 1] ?? r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ivory-50">
          {r.name}
          {r.you && <span className="ml-2 text-xs font-semibold text-gold-300">{t('club.yours')}</span>}
        </span>
        <span className="text-xs text-ivory-300/70">{tp('club.members', r.members)}, {t('club.active', { n: r.active })}</span>
      </span>
      <span className="shrink-0 text-right text-sm">
        <span className="block font-semibold tabular-nums text-ivory-50">{r.xp.toLocaleString()} <span className="text-xs font-normal text-ivory-300/70">{t('xp.unit')}</span></span>
        <span className="text-xs text-ivory-300/70">{t('club.average', { n: r.average.toLocaleString() })}</span>
      </span>
    </li>
  );
}

function GameRow({ r, blackjack }: { r: ClubGameRow; blackjack: boolean }) {
  const { t, tp } = useI18n();
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.you ? 'border border-gold-500/60 bg-gold-500/10' : 'border border-transparent odd:bg-ink-900/40'}`} aria-current={r.you ? 'true' : undefined}>
      <span className="w-8 shrink-0 text-center font-display text-lg text-gold-300" aria-label={t('rk.rank', { n: r.rank })}>{MEDAL[r.rank - 1] ?? r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ivory-50">
          {r.name}
          {r.you && <span className="ml-2 text-xs font-semibold text-gold-300">{t('club.yours')}</span>}
        </span>
        <span className="text-xs text-ivory-300/70">{tp('club.members', r.members)}, {t('club.activePeriod', { n: r.active })}</span>
      </span>
      <span className="shrink-0 text-right text-sm">
        {blackjack ? (
          <>
            <span className="block font-semibold text-ivory-50">{formatSignedChips(r.net ?? 0)}</span>
            <span className="text-xs text-ivory-300/70">{t('rk.hands', { n: r.played })}</span>
          </>
        ) : (
          <>
            <span className="block font-semibold text-ivory-50">{t('rk.wins', { n: r.wins })}</span>
            <span className="text-xs text-ivory-300/70">{t('rk.of', { n: r.played })}</span>
          </>
        )}
      </span>
    </li>
  );
}

/** Classement des clubs sur un jeu et une période : victoires (ou gain net au blackjack) cumulées des membres. */
export function ClubGameBoard({ game, period, label }: { game: RankGame; period: RankPeriod; label: string }) {
  const { t } = useI18n();
  const account = useAccountClient();
  const myClub = useAccount((s) => s.account?.club ?? null);
  const [data, setData] = useState<ClubGameRanking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    setData(null);
    account.clubGameRanking(game, period).then(
      (d) => alive && (setData(d), setError(null)),
      (e) => alive && setError(errorText(currentI18n(), e)),
    );
    return () => {
      alive = false;
    };
  }, [account, game, period, myClub]);

  const blackjack = game === 'blackjack';
  return (
    <div className="space-y-4">
      <p className="text-sm text-ivory-300/80">{t(blackjack ? 'club.how.bj' : 'club.how.game')}</p>
      {!myClub && <p className="rounded-xl border border-gold-500/30 bg-gold-500/5 px-4 py-3 text-sm text-ivory-100">{t('club.none')}</p>}
      {error ? (
        <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">{error}</p>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-ivory-300/70" role="status">{t('space.chargement')}</p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ivory-100/15 px-4 py-8 text-center text-sm text-ivory-300/75">{t('club.emptyGame')}</p>
      ) : (
        <>
          <ol className="space-y-1" aria-label={`${t('club.title')} — ${label}`}>
            {data.rows.map((r) => (
              <GameRow key={r.rank} r={r} blackjack={blackjack} />
            ))}
          </ol>
          {data.mine && (
            <div className="space-y-1 border-t border-ivory-100/10 pt-3">
              <p className="text-xs text-ivory-300/70">{t('club.your_place')}</p>
              <ol><GameRow r={data.mine} blackjack={blackjack} /></ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Classement des clubs sur la saison en cours : expérience cumulée des membres actifs. */
export function ClubBoard() {
  const { t } = useI18n();
  const account = useAccountClient();
  const myClub = useAccount((s) => s.account?.club ?? null);
  const [data, setData] = useState<ClubRanking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    account.clubRanking().then(
      (d) => alive && (setData(d), setError(null)),
      (e) => alive && setError(errorText(currentI18n(), e)),
    );
    return () => {
      alive = false;
    };
  }, [account, myClub]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ivory-300/80">
        {t('club.how')}
        {data && <span className="block pt-1 text-xs text-ivory-300/60">{t('season.label', { n: data.season.quarter, year: data.season.year })}</span>}
      </p>
      {!myClub && <p className="rounded-xl border border-gold-500/30 bg-gold-500/5 px-4 py-3 text-sm text-ivory-100">{t('club.none')}</p>}
      {error ? (
        <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">{error}</p>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-ivory-300/70" role="status">{t('space.chargement')}</p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ivory-100/15 px-4 py-8 text-center text-sm text-ivory-300/75">{t('club.empty')}</p>
      ) : (
        <>
          <ol className="space-y-1" aria-label={t('club.title')}>
            {data.rows.map((r) => (
              <Row key={r.rank} r={r} />
            ))}
          </ol>
          {data.mine && (
            <div className="space-y-1 border-t border-ivory-100/10 pt-3">
              <p className="text-xs text-ivory-300/70">{t('club.your_place')}</p>
              <ol><Row r={data.mine} /></ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
