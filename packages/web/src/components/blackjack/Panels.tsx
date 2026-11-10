import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Panel, Segmented } from '../ui';
import { PlayingCard } from '../Card';
import { useAccountClient } from '../../lib/context';
import { formatChips, formatSignedChips } from '../../lib/format';
import { decksText, RESULT_LABEL, RESULT_TONE, verifyCommitment } from '../../lib/blackjack';
import { hasFeature } from '../../lib/entitlements';
import type { BjAchievement, BjChallenge, BjHistoryItem, BjLeaderboardEntry, BjLeaderboardKind, BjProfile } from '../../lib/types';
import { locale, useI18n } from '../../i18n';

const dateText = (ms: number): string => new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const percent = (x: number): string => `${Math.round(x * 100)} %`;

/** Preuve d'équité : l'engagement publié avant la manche correspond bien à la graine révélée après. */
export function FairnessProof({ seed, commitment }: { seed: string; commitment: string }) {
  const { t, tp } = useI18n();
  const [ok, setOk] = useState<boolean | null | 'pending'>('pending');
  useEffect(() => {
    let cancelled = false;
    void verifyCommitment(seed, commitment).then((v) => !cancelled && setOk(v));
    return () => {
      cancelled = true;
    };
  }, [seed, commitment]);
  return (
    <div className="mt-2 space-y-1.5 break-all rounded-xl bg-black/25 p-3 font-mono text-[11px] leading-snug">
      <p>
        <span className="text-ivory-300/70">{t('bjpanels.engagement_publie_avant')}</span> {commitment}
      </p>
      <p>
        <span className="text-ivory-300/70">{t('bjpanels.graine_revelee_apres')}</span> {seed}
      </p>
      <p className="font-sans text-xs" role="status">
        {ok === 'pending' ? t('bjpanels.verification') : ok === null ? t('bjpanels.verification_indisponible_sur') : ok ? t('bjpanels.sha_256_de') : t('bjpanels.la_graine_ne')}
      </p>
      <p className="font-sans text-[11px] text-ivory-300/70">{t('bjpanels.le_sabot_se')}</p>
    </div>
  );
}

/** Niveau, titre et barre d'expérience. */
export function LevelBar({ profile }: { profile: BjProfile }) {
  const { t, tp } = useI18n();
  const ratio = profile.xpForNext > 0 ? Math.min(1, profile.xpIntoLevel / profile.xpForNext) : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-xl text-ivory-50">
          {t('bjpanels.niveau', { level: profile.level })} <span className="text-sm text-gold-300">· {profile.title}</span>
        </p>
        <p className="text-xs text-ivory-300/80">
          {t('bjpanels.xp', { xpIntoLevel: profile.xpIntoLevel, xpForNext: profile.xpForNext })}</p>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-900" role="progressbar" aria-label={t('bjpanels.experience_du_niveau')} aria-valuemin={0} aria-valuemax={profile.xpForNext} aria-valuenow={profile.xpIntoLevel}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-ivory-300/70">{t('bjpanels.l_experience_est')}</p>
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ivory-100/10 bg-ink-900/60 px-3 py-2.5 text-center">
      <p className={`font-display text-xl ${tone || 'text-ivory-50'}`}>{value}</p>
      <p className="text-xs text-ivory-300/75">{label}</p>
    </div>
  );
}

export function StatsPanel({ profile }: { profile: BjProfile }) {
  const { t, tp } = useI18n();
  const hands = profile.hands;
  return (
    <Panel className="space-y-4 p-4 sm:p-5">
      <LevelBar profile={profile} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="bj-stats">
        <Stat label={t('bjpanels.mains_jouees')} value={String(hands)} />
        <Stat label={t('bjpanels.victoires')} value={String(profile.handsWon)} tone="text-emerald-300" />
        <Stat label={t('bjpanels.defaites')} value={String(profile.handsLost)} tone="text-ruby-300" />
        <Stat label={t('bjpanels.egalites')} value={String(profile.handsPushed)} />
        <Stat label={t('bjpanels.taux_de_reussite')} value={hands ? percent(profile.winRate) : '—'} tone="text-gold-300" />
        <Stat label={t('bjpanels.blackjacks')} value={String(profile.blackjacks)} />
        <Stat label={t('bjpanels.serie_en_cours')} value={String(profile.streak)} />
        <Stat label={t('bjpanels.meilleure_serie')} value={String(profile.bestStreak)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t('bjpanels.bilan_cumule')} value={formatSignedChips(profile.netChips)} tone={profile.netChips >= 0 ? 'text-emerald-300' : 'text-ruby-300'} />
        <Stat label={t('bjpanels.solde_maximal')} value={formatChips(profile.maxChips)} />
        <Stat label={t('bjpanels.doublements_gagnes')} value={String(profile.doublesWon)} />
        <Stat label={t('bjpanels.separations_gagnees')} value={String(profile.splitsWon)} />
      </div>
      {hasFeature('stats-avancees') && hands >= 20 && <p className="text-xs text-ivory-300/70">{t('bjpanels.manches_jouees_les', { rounds: profile.rounds })}</p>}
    </Panel>
  );
}

export function ChallengesPanel({ challenges, achievements }: { challenges: BjChallenge[]; achievements: BjAchievement[] }) {
  const { t, tp } = useI18n();
  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <h2 className="font-display text-xl text-ivory-50">{t('bjpanels.defis_du_jour')}</h2>
        <p className="text-xs text-ivory-300/75">{t('bjpanels.trois_nouveaux_defis')}</p>
        <ul className="mt-3 space-y-2">
          {challenges.map((c) => (
            <li key={c.id} className="rounded-2xl border border-ivory-100/10 bg-ink-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ivory-50">{c.label}</p>
                {c.done ? <Badge tone="green">{t('bjpanels.accompli')}</Badge> : <span className="text-xs text-gold-300">{t('bjpanels.xp2', { formatChips: formatChips(c.rewardChips), rewardXp: c.rewardXp })}</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950" role="progressbar" aria-label={c.label} aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={Math.min(c.progress, c.goal)}>
                <div className={`h-full rounded-full ${c.done ? 'bg-emerald-400' : 'bg-gold-400'}`} style={{ width: `${Math.min(100, (c.progress / c.goal) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-ivory-300/70">
                {c.progress >= 0 ? Math.min(c.progress, c.goal) : 0} / {c.goal}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-4 sm:p-5">
        <h2 className="font-display text-xl text-ivory-50">
          {t('bjpanels.objectifs')} <span className="text-sm text-gold-300">{achievements.filter((a) => a.unlockedAt).length} / {achievements.length}</span>
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {achievements.map((a) => (
            <li key={a.id} className={`rounded-2xl border p-3 ${a.unlockedAt ? 'border-gold-500/50 bg-gold-500/10' : 'border-ivory-100/10 bg-ink-900/50 opacity-80'}`}>
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ivory-50">
                {a.label}
                {a.unlockedAt ? <Badge tone="gold">{t('bjpanels.debloque')}</Badge> : <span className="text-xs font-normal text-gold-300">+{formatChips(a.rewardChips)}</span>}
              </p>
              <p className="mt-0.5 text-xs text-ivory-300/80">{a.description}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function LeaderboardPanel() {
  const { t, tp } = useI18n();
  const account = useAccountClient();
  const [by, setBy] = useState<BjLeaderboardKind>('xp');
  const [rows, setRows] = useState<BjLeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setRows(null);
    account
      .blackjackLeaderboard(by)
      .then((r) => !cancelled && (setRows(r), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [account, by]);
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ivory-50">{t('bjpanels.classement')}</h2>
        <div className="w-60">
          <Segmented<BjLeaderboardKind> value={by} options={['xp', 'chips']} onChange={setBy} label={t('bjpanels.classer_par')} format={(v) => (v === 'xp' ? t('bjpanels.experience') : t('bjpanels.jetons'))} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-ivory-300/70">{t('bjpanels.classement_indisponible_pour')}</p>}
      {!error && rows === null && <p className="mt-3 text-sm text-ivory-300/70">{t('bjpanels.chargement')}</p>}
      {rows?.length === 0 && <p className="mt-3 text-sm text-ivory-300/70">{t('bjpanels.personne_n_a')}</p>}
      <ol className="mt-3 divide-y divide-ivory-100/10" data-testid="bj-leaderboard">
        {rows?.map((e) => (
          <li key={e.rank} className="flex items-center gap-3 py-2.5">
            <span className="w-6 text-center font-display text-lg text-gold-300">{e.rank}</span>
            <Avatar nickname={e.nickname} avatar={e.avatar} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ivory-50">{e.nickname}</span>
              <span className="text-xs text-ivory-300/75">
                {tp('bjpanels.niveau_manche', e.rounds, { level: e.level, title: e.title })}
              </span>
            </span>
            <span className="text-right text-sm font-semibold text-ivory-50">{by === 'xp' ? t('bjpanels.xp3', { xp: e.xp }) : formatChips(e.chips)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function HistoryPanel({ items }: { items: BjHistoryItem[] }) {
  const { t, tp } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0)
    return (
      <Panel className="p-5">
        <p className="text-sm text-ivory-300/80">{t('bjpanels.aucune_manche_terminee')}</p>
      </Panel>
    );
  return (
    <Panel className="p-3 sm:p-4">
      <h2 className="px-1 pb-2 font-display text-xl text-ivory-50">{t('bjpanels.dernieres_manches')}</h2>
      <ul className="divide-y divide-ivory-100/10" data-testid="bj-history">
        {items.map((h) => (
          <li key={h.id} className="py-2">
            <button type="button" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id} className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-ivory-100/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ivory-50">
                  {h.hands.length > 1 ? t('bjpanels.mains', { n: h.hands.length }) : h.hands[0] ? RESULT_LABEL[h.hands[0].result ?? 'LOSE'] : '—'}  {t('bjpanels.mise', { formatChips: formatChips(h.wagered) })}</span>
                <span className="text-xs text-ivory-300/75">
                  {t('bjpanels.jeu', { dateText: dateText(h.endedAt), decks: decksText(h.decks) })}
                </span>
              </span>
              <span className={`font-display text-lg ${h.net > 0 ? 'text-emerald-300' : h.net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedChips(h.net)}</span>
            </button>
            {open === h.id && (
              <div className="mt-2 space-y-2 px-1">
                <div>
                  <p className="text-xs text-ivory-300/75">{t('bjpanels.croupier')}</p>
                  <div className="flex [&>*:not(:first-child)]:-ml-6">
                    {h.dealer.map((c, i) => (
                      <PlayingCard key={i} code={c} size="xs" />
                    ))}
                  </div>
                </div>
                {h.hands.map((hand, i) => (
                  <div key={i}>
                    <p className="flex items-center gap-2 text-xs text-ivory-300/75">
                      {t('bjpanels.main', { v: i + 1 })} {hand.result && <Badge tone={RESULT_TONE[hand.result]}>{RESULT_LABEL[hand.result]}</Badge>} {formatSignedChips(hand.net)}
                    </p>
                    <div className="flex [&>*:not(:first-child)]:-ml-6">
                      {hand.cards.map((c, j) => (
                        <PlayingCard key={j} code={c} size="xs" />
                      ))}
                    </div>
                  </div>
                ))}
                <FairnessProof seed={h.seed} commitment={h.commitment} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
