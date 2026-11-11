import { Badge } from './ui';
import { useI18n, locale, type Key } from '../i18n';
import type { VariantStats } from '../lib/types';

export type Level = VariantStats['level'];
export const LEVELS: readonly Level[] = ['beginner', 'initiate', 'confirmed', 'expert', 'master'];
const LEVEL_TONE: Record<Level, 'neutral' | 'amber' | 'green' | 'gold' | 'red'> = { beginner: 'neutral', initiate: 'amber', confirmed: 'green', expert: 'gold', master: 'red' };

/** Statistiques « vierges » d'une variante jamais jouée (la fiche s'affiche quand même). */
export const EMPTY_PROGRESS: Omit<VariantStats, 'variant'> = {
  played: 0, won: 0, points: 0, level: 'beginner', expectedWins: 0, skill: null, streak: 0, bestStreak: 0, recent: [],
  next: { level: 'initiate', rounds: 5, skill: 0 }, progress: 0,
};

const num = (n: number, digits = 2): string => n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function LevelBadge({ level }: { level: Level }) {
  const { t } = useI18n();
  return <Badge tone={LEVEL_TONE[level]}>{t(`vi.level.${level}` as Key)}</Badge>;
}

/** Échelle des cinq niveaux : le niveau atteint est plein, les suivants sont vides. */
function Ladder({ level }: { level: Level }) {
  const { t } = useI18n();
  const at = LEVELS.indexOf(level);
  return (
    <ol className="flex gap-1" aria-label={t('vi.ladder')}>
      {LEVELS.map((l, i) => (
        <li key={l} className="flex-1" aria-current={i === at ? 'step' : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= at ? 'bg-gradient-to-r from-gold-500 to-gold-300' : 'bg-ink-600'}`} aria-hidden="true" />
          <span className={`mt-1 block truncate text-center text-[10px] ${i === at ? 'font-semibold text-gold-300' : 'text-ivory-300/60'}`}>{t(`vi.level.${l}` as Key)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Progression d'une variante, calculée sur les manches réellement jouées : niveau, avancement vers le palier suivant,
 * réussite, rendement face au hasard, séries et forme récente. Le rendement distingue la compétence du simple volume.
 */
export function VariantProgress({ stats, compact = false }: { stats: Omit<VariantStats, 'variant'>; compact?: boolean }) {
  const { t, tp } = useI18n();
  const s = stats;
  const rate = s.played === 0 ? '—' : `${Math.round((s.won / s.played) * 100)} %`;
  const nextText = s.next
    ? s.next.skill > 0
      ? t('vi.next', { level: t(`vi.level.${s.next.level}` as Key), rounds: s.next.rounds, skill: num(s.next.skill) })
      : t('vi.next.volume', { level: t(`vi.level.${s.next.level}` as Key), rounds: s.next.rounds })
    : t('vi.max');
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <LevelBadge level={s.level} />
        {s.played > 0 && <span className="text-xs text-ivory-300/75">{tp('vi.manches', s.played)}</span>}
      </div>
      <div className="mt-3">
        <Ladder level={s.level} />
      </div>
      {s.next && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-ink-600" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress * 100)} aria-label={t('vi.progress')}>
            <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round(s.progress * 100)}%` }} />
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-ivory-200/80">{nextText}</p>
      {s.played === 0 ? (
        <p className="mt-3 text-sm text-ivory-200/85">{t('vi.none')}</p>
      ) : (
        !compact && (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t('vi.winrate')} value={rate} />
              <Stat label={t('vi.skill')} value={s.skill === null ? '—' : num(s.skill)} hint={t('vi.skill.hint')} />
              <Stat label={t('vi.streak')} value={String(s.streak)} />
              <Stat label={t('vi.best')} value={String(s.bestStreak)} />
            </dl>
            <div className="mt-4">
              <p className="text-xs text-ivory-300/75">{t('vi.recent')}</p>
              <ol className="mt-1.5 flex gap-1" aria-label={t('vi.recent')}>
                {s.recent.map((r, i) => (
                  <li key={i} className={`h-3 w-3 rounded-full ${r === 'W' ? 'bg-gold-400' : 'bg-ink-600'}`} role="img" aria-label={r === 'W' ? t('vi.recent.won') : t('vi.recent.notwon')} />
                ))}
              </ol>
            </div>
          </>
        )
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2">
      <dt className="text-[11px] text-ivory-300/75">{label}</dt>
      <dd className="font-display text-lg text-ivory-50">{value}</dd>
      {hint && <dd className="text-[10px] leading-tight text-ivory-300/55">{hint}</dd>}
    </div>
  );
}
