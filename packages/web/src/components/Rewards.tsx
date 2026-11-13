import { useEffect, useState } from 'react';
import { locale, useI18n } from '../i18n';
import { useAccount, useAccountClient } from '../lib/context';
import type { Need, RewardKind, RewardStatus, RewardsReply } from '../lib/types';
import { ACHIEVEMENT } from './Engagement';
import { EmblemBadge, FramedAvatar, REWARD_NAME, TitleTag, rewardKey } from './Cosmetics';
import { LEAGUE_KEY, LEAGUE_ORDER, LeagueBadge } from './League';
import { Button } from './ui';

const KIND_KEY = { title: 'rw.kind.title', frame: 'rw.kind.frame', emblem: 'rw.kind.emblem' } as const;
const KINDS: readonly RewardKind[] = ['title', 'frame', 'emblem'];

/** Texte de la condition de déblocage. */
function useNeed() {
  const { t } = useI18n();
  return (need: Need): string => {
    switch (need.of) {
      case 'xp':
        return need.n === 0 ? t('rw.free') : t('rw.need.xp', { n: need.n.toLocaleString() });
      case 'league':
        return need.league === 'bronze' ? t('rw.free') : t('rw.need.league', { league: t(LEAGUE_KEY[need.league]) });
      case 'feats':
        return t('rw.need.feats', { n: need.n });
      case 'seasons':
        return t('rw.need.seasons', { n: need.n });
      case 'feat': {
        const k = ACHIEVEMENT[need.feat as keyof typeof ACHIEVEMENT];
        return t('rw.need.feat', { name: k ? t(k) : need.feat });
      }
    }
  };
}

function Preview({ r, nickname, avatar }: { r: RewardStatus; nickname: string; avatar: string | null }) {
  if (r.kind === 'frame') return <FramedAvatar nickname={nickname} avatar={avatar} size={44} frame={r.id} />;
  if (r.kind === 'emblem') return <EmblemBadge id={r.id} size={44} />;
  return <TitleTag id={r.id} />;
}

/** Onglet « Récompenses » : galerie de titres, cadres et emblèmes, débloqués par l'expérience, les grades et les hauts faits. */
export function RewardsPanel() {
  const { t } = useI18n();
  const account = useAccountClient();
  const me = useAccount((s) => s.account);
  const [data, setData] = useState<RewardsReply | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const need = useNeed();

  useEffect(() => {
    let alive = true;
    account?.rewards().then((d) => alive && setData(d), () => undefined);
    return () => {
      alive = false;
    };
  }, [account]);

  if (!data || !account) return <p className="py-6 text-center text-sm text-ivory-300/70" role="status">…</p>;
  const { items, equipped, career } = data;
  const nickname = me?.nickname ?? '';
  const avatar = me?.avatar ?? null;
  const unlockedCount = items.filter((x) => x.unlocked).length;
  const best = LEAGUE_ORDER[career.bestLeague] ?? 'bronze';
  const month = new Intl.DateTimeFormat(locale(), { month: 'long' });
  const slot = (id: string | null) => id ?? null;

  async function equip(kind: RewardKind, id: string | null) {
    setBusy(`${kind}:${id}`);
    try {
      const next = await account!.equip(kind, id);
      setData((d) => (d ? { ...d, equipped: next } : d));
    } catch {
      /* refus du serveur (récompense non débloquée) : l'état affiché reste inchangé */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display text-2xl text-ivory-50">{t('rw.title')}</h2>
        <p className="mt-1 text-sm text-ivory-300/80">{t('rw.intro')}</p>
      </header>

      <section aria-label={t('rw.summary.label')} className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center rounded-2xl border border-gold-500/40 bg-gradient-to-br from-felt-800 via-ink-900 to-ink-950 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <FramedAvatar nickname={nickname} avatar={avatar} size={64} frame={slot(equipped.frame)} />
          <div>
            <p className="flex items-center gap-2 font-display text-xl text-ivory-50">
              {nickname}
              {equipped.emblem && <EmblemBadge id={equipped.emblem} size={22} />}
            </p>
            <TitleTag id={equipped.title} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-ivory-300/70">{t('rw.sum.xp')}</dt><dd className="font-semibold tabular-nums text-gold-300">{career.xp.toLocaleString()} XP</dd></div>
          <div><dt className="text-xs text-ivory-300/70">{t('rw.sum.grade')}</dt><dd className="flex items-center gap-1.5 font-semibold text-ivory-50"><LeagueBadge league={best} size={22} />{t(LEAGUE_KEY[best])}</dd></div>
          <div><dt className="text-xs text-ivory-300/70">{t('rw.sum.feats')}</dt><dd className="font-semibold tabular-nums text-ivory-50">{career.feats}</dd></div>
          <div><dt className="text-xs text-ivory-300/70">{t('rw.sum.unlocked')}</dt><dd className="font-semibold tabular-nums text-ivory-50">{unlockedCount}/{items.length}</dd></div>
        </dl>
      </section>

      {KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`rw-${kind}`}>
          <h3 id={`rw-${kind}`} className="font-display text-xl text-ivory-50">{t(KIND_KEY[kind])}</h3>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {items.filter((x) => x.kind === kind).map((r) => {
              const key = rewardKey(r.id);
              const on = equipped[kind] === r.id;
              return (
                <li key={r.id} data-testid={`reward-${r.id}`} className={`flex items-center gap-3 rounded-xl border p-3 ${on ? 'border-gold-400 bg-gold-500/15' : r.unlocked ? 'border-gold-400/35 bg-gold-500/5' : 'border-ivory-100/10 bg-ink-900/40'}`}>
                  <div className={`flex h-12 w-14 shrink-0 items-center justify-center ${r.unlocked ? '' : 'opacity-40 grayscale'}`}>
                    <Preview r={r} nickname={nickname} avatar={avatar} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${r.unlocked ? 'text-ivory-50' : 'text-ivory-300/80'}`}>{key ? t(key) : r.id}</p>
                    <p className="text-xs text-ivory-300/75">{need(r.need)}</p>
                    {!r.unlocked && r.target > 1 && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-950/70" aria-hidden="true">
                        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${Math.round((r.value / r.target) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  {r.unlocked ? (
                    <Button variant={on ? 'secondary' : 'primary'} className="shrink-0 px-3 py-1.5 text-xs" disabled={busy === `${kind}:${on ? null : r.id}`} onClick={() => equip(kind, on ? null : r.id)}>
                      {on ? t('rw.unequip') : t('rw.equip')}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-ivory-300/70">{t('rw.locked')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="rw-seasons">
        <h3 id="rw-seasons" className="font-display text-xl text-ivory-50">{t('season.history')}</h3>
        <p className="mt-1 text-sm text-ivory-300/75">{t('season.history.hint')}</p>
        <ul className="mt-3 divide-y divide-ivory-100/10 rounded-xl border border-ivory-100/10">
          {career.seasons.map((s) => {
            const first = month.format(new Date(Date.UTC(s.year, (s.quarter - 1) * 3, 15)));
            const last = month.format(new Date(Date.UTC(s.year, (s.quarter - 1) * 3 + 2, 15)));
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <LeagueBadge league={s.league} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ivory-50">
                    {t('season.label', { n: s.quarter, year: s.year })}
                    {s.current && <span className="ml-2 rounded-full bg-jade-500/20 px-2 py-0.5 text-[11px] font-semibold text-jade-300">{t('season.current')}</span>}
                  </p>
                  <p className="text-xs text-ivory-300/75">{first} – {last} · {t(LEAGUE_KEY[s.league])}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums text-ivory-50">{s.xp.toLocaleString()} XP</p>
                  <p className="text-xs text-ivory-300/70">{t('season.feats', { n: s.feats })}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
