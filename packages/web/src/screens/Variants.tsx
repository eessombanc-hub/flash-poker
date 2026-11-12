import { useEffect, useState } from 'react';
import { EMPTY_PROGRESS, LevelBadge, VariantProgress } from '../components/VariantProgress';
import { Badge, Button, Eyebrow, Modal } from '../components/ui';
import { VariantGlyph } from '../components/VariantGlyph';
import { useAccount, useAccountClient } from '../lib/context';
import { VARIANTS } from '../lib/labels';
import type { VariantId, VariantStats } from '../lib/types';
import { VARIANT_META } from '../lib/variantInfo';
import { useI18n, type Key } from '../i18n';

/** Niveau de difficulté en trois pastilles, avec un libellé lisible pour les technologies d'assistance. */
function Difficulty({ n }: { n: 1 | 2 | 3 }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= n ? 'bg-gold-400' : 'bg-ink-600'}`} />
        ))}
      </span>
      <span>{t(`vi.diff.${n}` as Key)}</span>
    </span>
  );
}

/**
 * « Variantes » : une fiche par jeu (description, règles essentielles, difficulté, joueurs, durée estimée, progression
 * personnelle) et un bouton pour jouer. La progression vient des manches réellement jouées avec le compte.
 */
export function Variants({ onBack, onPlaySolo, onCreate, onLogin }: { onBack: () => void; onPlaySolo: (v: VariantId) => void; onCreate: (v: VariantId) => void; onLogin: () => void }) {
  const { t } = useI18n();
  const account = useAccount((s) => s.account);
  const client = useAccountClient();
  const [stats, setStats] = useState<Record<string, VariantStats> | null>(null);
  const [open, setOpen] = useState<VariantId | null>(null);

  useEffect(() => {
    if (!account || !client) return;
    let alive = true;
    client.stats().then(
      (d) => alive && setStats(Object.fromEntries(d.variants.map((v) => [v.variant, v]))),
      () => alive && setStats({}),
    );
    return () => {
      alive = false;
    };
  }, [account, client]);

  const statsOf = (id: VariantId): Omit<VariantStats, 'variant'> => stats?.[id] ?? EMPTY_PROGRESS;
  const current = VARIANTS.find((v) => v.id === open) ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('common.backHome')}
      </Button>
      {account && <Eyebrow>{t('vi.eyebrow')}</Eyebrow>}
      <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">{t('vi.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ivory-200/85">{t('vi.lead')}</p>
      {!account && (
        <p className="mt-4 rounded-xl border border-gold-500/30 bg-ink-800/70 px-4 py-3 text-sm text-ivory-200">
          {t('vi.guest')}{' '}
          <button type="button" onClick={onLogin} className="font-semibold text-gold-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
            {t('common.login')}
          </button>
        </p>
      )}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={t('vi.title')}>
        {VARIANTS.map((v) => {
          const m = VARIANT_META[v.id];
          const s = statsOf(v.id);
          return (
            <li key={v.id} className="relative flex flex-col rounded-2xl border border-ivory-100/12 bg-gradient-to-br from-ink-700/80 to-ink-900/90 p-4 transition hover:border-gold-400/50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400">
              <div className="flex items-start justify-between gap-2">
                <VariantGlyph id={v.id} size={52} />
                <div className="min-w-0 flex-1">
                  <Badge tone="neutral">{t(`vi.family.${m.family}` as Key)}</Badge>
                  <h2 className="mt-2 font-display text-2xl text-ivory-50">
                    <button type="button" onClick={() => setOpen(v.id)} className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-none">
                      {v.name}
                    </button>
                  </h2>
                  <p className="text-sm text-gold-300">{v.tagline}</p>
                </div>
                {s.played > 0 ? <LevelBadge level={s.level} /> : m.difficulty === 1 ? <Badge tone="gold">{t('vi.start')}</Badge> : null}
              </div>
              <p className="mt-3 text-xs text-ivory-300/80">
                <Difficulty n={m.difficulty} />
              </p>
              {s.played > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-600" aria-hidden="true">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                </div>
              )}
              <p className="mt-2 text-xs text-ivory-300/70">{s.played > 0 ? t('vi.card.played', { played: s.played, won: s.won }) : account ? t('vi.card.none') : t('vi.card.guest')}</p>
            </li>
          );
        })}
      </ul>

      {current && (
        <Modal title={current.name} onClose={() => setOpen(null)} wide>
          <FicheBody
            id={current.id}
            name={current.name}
            tagline={current.tagline}
            description={current.description}
            stats={account ? statsOf(current.id) : null}
            onPlaySolo={() => onPlaySolo(current.id)}
            onCreate={() => onCreate(current.id)}
            onLogin={onLogin}
            onClose={() => setOpen(null)}
          />
        </Modal>
      )}
    </main>
  );
}

function FicheBody({ id, name, tagline, description, stats, onPlaySolo, onCreate, onLogin, onClose }: { id: VariantId; name: string; tagline: string; description: string; stats: Omit<VariantStats, 'variant'> | null; onPlaySolo: () => void; onCreate: () => void; onLogin: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const m = VARIANT_META[id];
  return (
    <div>
      <Badge tone="neutral">{t(`vi.family.${m.family}` as Key)}</Badge>
      <h2 className="mt-2 font-display text-3xl text-ivory-50">{name}</h2>
      <p className="text-sm text-gold-300">{tagline}</p>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Fact label={t('vi.diff.label')}>
          <Difficulty n={m.difficulty} />
        </Fact>
        <Fact label={t('vi.players.label')}>{t('vi.players', { min: m.minPlayers, max: m.maxPlayers })}</Fact>
        <Fact label={t('vi.duration.label')}>{t('vi.minutes', { n: m.minutes })}</Fact>
      </dl>
      <h3 className="mt-5 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('vi.rules')}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ivory-100/90">{description}</p>
      <h3 className="mt-5 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('vi.progression')}</h3>
      <div className="mt-2">
        {stats ? (
          <VariantProgress stats={stats} />
        ) : (
          <p className="text-sm text-ivory-200/85">
            {t('vi.stats.guest')}{' '}
            <button type="button" onClick={onLogin} className="font-semibold text-gold-300 underline underline-offset-2">
              {t('common.login')}
            </button>
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button variant="secondary" onClick={onCreate}>
          {t('vi.play.table')}
        </Button>
        <Button onClick={onPlaySolo}>{t('vi.play.solo')}</Button>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ivory-100/10 bg-ink-900/50 px-3 py-2">
      <dt className="text-[11px] text-ivory-300/75">{label}</dt>
      <dd className="mt-0.5 text-ivory-50">{children}</dd>
    </div>
  );
}
