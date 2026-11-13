import { useEffect, useState } from 'react';
import { currentI18n, locale, useI18n } from '../i18n';
import { useAccountClient } from '../lib/context';
import { formatSignedChips } from '../lib/format';
import { variantName } from '../lib/labels';
import { errorText } from '../lib/tbText';
import type { RankGame, RankPeriod, Ranking, RankRow } from '../lib/types';
import { VARIANTS } from '../lib/labels';
import { Avatar, Segmented } from './ui';

const PERIODS: readonly RankPeriod[] = ['week', 'month', 'season', 'all'];
const POKER_VARIANTS: RankGame[] = VARIANTS.map((v) => v.id);
const MEDAL = ['🥇', '🥈', '🥉'];

function RowView({ r, blackjack }: { r: RankRow; blackjack: boolean }) {
  const { t } = useI18n();
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.you ? 'border border-gold-500/60 bg-gold-500/10' : 'border border-transparent odd:bg-ink-900/40'}`} aria-current={r.you ? 'true' : undefined}>
      <span className="w-8 shrink-0 text-center font-display text-lg text-gold-300" aria-label={t('rk.rank', { n: r.rank })}>{MEDAL[r.rank - 1] ?? r.rank}</span>
      <Avatar nickname={r.nickname} avatar={r.avatar} size={36} />
      <span className="min-w-0 flex-1 truncate font-medium text-ivory-50">
        {r.nickname}
        {r.you && <span className="ml-2 text-xs font-semibold text-gold-300">{t('rk.you')}</span>}
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

/** Onglet « Classements » : un jeu au choix, sur la semaine, le mois ou depuis toujours. */
export function RankingsPanel() {
  const { t } = useI18n();
  const account = useAccountClient();
  const [game, setGame] = useState<RankGame>('poker');
  const [period, setPeriod] = useState<RankPeriod>('season');
  const [data, setData] = useState<Ranking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    setData(null);
    account.rankings(game, period).then(
      (d) => alive && (setData(d), setError(null)),
      (e) => alive && setError(errorText(currentI18n(), e)),
    );
    return () => {
      alive = false;
    };
  }, [account, game, period]);

  const label = (g: RankGame): string => (g === 'poker' ? t('rk.game.poker') : g === 'blackjack' ? t('rk.game.blackjack') : g === 'tableau:classic' ? t('tb.variant.classic') : g === 'tableau:hand5' ? t('tb.variant.hand5') : variantName(g as never));
  const fmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' });
  const blackjack = game === 'blackjack';
  const note = period === 'all' ? t('rk.note.all') : data?.until ? t('rk.note.until', { since: fmt.format(data.since), until: fmt.format(data.until - 1) }) : '';

  return (
    <section className="space-y-4" aria-label={t('rk.title')}>
      <h2 className="font-display text-2xl text-ivory-50">{t('rk.title')}</h2>
      <Segmented label={t('rk.period')} value={period} options={PERIODS} format={(p) => t(`rk.period.${p}` as never)} onChange={setPeriod} />
      <div>
        <label htmlFor="rk-game" className="mb-1 block text-sm font-semibold text-ivory-100">{t('rk.game')}</label>
        <select id="rk-game" value={game} onChange={(e) => setGame(e.target.value as RankGame)} className="w-full rounded-xl border border-ivory-100/20 bg-ink-900 px-3 py-3 text-ivory-50 focus:border-gold-400 focus:outline-none">
          <optgroup label={t('rk.group.poker')}>
            <option value="poker">{label('poker')}</option>
            {POKER_VARIANTS.map((v) => (
              <option key={v} value={v}>{label(v)}</option>
            ))}
          </optgroup>
          <optgroup label={t('rk.group.other')}>
            <option value="blackjack">{label('blackjack')}</option>
            <option value="tableau:classic">{label('tableau:classic')}</option>
            <option value="tableau:hand5">{label('tableau:hand5')}</option>
          </optgroup>
        </select>
      </div>
      <p className="text-sm text-ivory-300/80">
        {t(game === 'poker' ? 'rk.how.poker' : blackjack ? 'rk.how.blackjack' : game.startsWith('tableau') ? 'rk.how.tableau' : 'rk.how.variant')}
        {note && <span className="block pt-1 text-xs text-ivory-300/60">{note}</span>}
      </p>

      {error ? (
        <p role="alert" className="rounded-lg border border-ruby-500/50 bg-ruby-950/60 px-3 py-2 text-sm text-ruby-100">{error}</p>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-ivory-300/70" role="status">{t('space.chargement')}</p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ivory-100/15 px-4 py-8 text-center text-sm text-ivory-300/75">{t('rk.empty')}</p>
      ) : (
        <>
          <ol className="space-y-1" aria-label={`${label(game)} — ${t(`rk.period.${period}` as never)}`}>
            {data.rows.map((r) => (
              <RowView key={r.rank} r={r} blackjack={blackjack} />
            ))}
          </ol>
          {data.mine && (
            <div className="space-y-1 border-t border-ivory-100/10 pt-3">
              <p className="text-xs text-ivory-300/70">{t('rk.your_place')}</p>
              <ol><RowView r={data.mine} blackjack={blackjack} /></ol>
            </div>
          )}
          {!data.mine && !data.rows.some((r) => r.you) && <p className="text-xs text-ivory-300/70">{t('rk.not_ranked')}</p>}
        </>
      )}
    </section>
  );
}
