import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Panel, Segmented } from '../ui';
import { PlayingCard } from '../Card';
import { useAccountClient } from '../../lib/context';
import { formatChips, formatSignedChips } from '../../lib/format';
import { RESULT_LABEL, RESULT_TONE, verifyCommitment } from '../../lib/blackjack';
import { hasFeature } from '../../lib/entitlements';
import type { BjAchievement, BjChallenge, BjHistoryItem, BjLeaderboardEntry, BjLeaderboardKind, BjProfile } from '../../lib/types';

const dateText = (ms: number): string => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const percent = (x: number): string => `${Math.round(x * 100)} %`;

/** Preuve d'équité : l'engagement publié avant la manche correspond bien à la graine révélée après. */
export function FairnessProof({ seed, commitment }: { seed: string; commitment: string }) {
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
        <span className="text-ivory-300/70">Engagement (publié avant la distribution) :</span> {commitment}
      </p>
      <p>
        <span className="text-ivory-300/70">Graine (révélée après la manche) :</span> {seed}
      </p>
      <p className="font-sans text-xs" role="status">
        {ok === 'pending' ? 'Vérification…' : ok === null ? 'Vérification indisponible sur ce navigateur (connexion non sécurisée).' : ok ? '✓ SHA-256 de la graine = engagement : le sabot était fixé avant votre première décision.' : '✗ La graine ne correspond pas à l’engagement.'}
      </p>
      <p className="font-sans text-[11px] text-ivory-300/70">Le sabot se reconstruit à partir de la graine et du nombre de jeux (mélange de Fisher-Yates sur SHA-256). Un nouveau sabot est tiré à chaque manche.</p>
    </div>
  );
}

/** Niveau, titre et barre d'expérience. */
export function LevelBar({ profile }: { profile: BjProfile }) {
  const ratio = profile.xpForNext > 0 ? Math.min(1, profile.xpIntoLevel / profile.xpForNext) : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-xl text-ivory-50">
          Niveau {profile.level} <span className="text-sm text-gold-300">· {profile.title}</span>
        </p>
        <p className="text-xs text-ivory-300/80">
          {profile.xpIntoLevel} / {profile.xpForNext} XP
        </p>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-900" role="progressbar" aria-label="Expérience du niveau" aria-valuemin={0} aria-valuemax={profile.xpForNext} aria-valuenow={profile.xpIntoLevel}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-ivory-300/70">L’expérience est commune au poker et au Blackjack : chaque partie compte.</p>
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
  const hands = profile.hands;
  return (
    <Panel className="space-y-4 p-4 sm:p-5">
      <LevelBar profile={profile} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="bj-stats">
        <Stat label="Mains jouées" value={String(hands)} />
        <Stat label="Victoires" value={String(profile.handsWon)} tone="text-emerald-300" />
        <Stat label="Défaites" value={String(profile.handsLost)} tone="text-ruby-300" />
        <Stat label="Égalités" value={String(profile.handsPushed)} />
        <Stat label="Taux de réussite" value={hands ? percent(profile.winRate) : '—'} tone="text-gold-300" />
        <Stat label="Blackjacks" value={String(profile.blackjacks)} />
        <Stat label="Série en cours" value={String(profile.streak)} />
        <Stat label="Meilleure série" value={String(profile.bestStreak)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Bilan cumulé" value={formatSignedChips(profile.netChips)} tone={profile.netChips >= 0 ? 'text-emerald-300' : 'text-ruby-300'} />
        <Stat label="Solde maximal" value={formatChips(profile.maxChips)} />
        <Stat label="Doublements gagnés" value={String(profile.doublesWon)} />
        <Stat label="Séparations gagnées" value={String(profile.splitsWon)} />
      </div>
      {hasFeature('stats-avancees') && hands >= 20 && <p className="text-xs text-ivory-300/70">{profile.rounds} manches jouées. Les statistiques sont enregistrées sur votre compte.</p>}
    </Panel>
  );
}

export function ChallengesPanel({ challenges, achievements }: { challenges: BjChallenge[]; achievements: BjAchievement[] }) {
  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <h2 className="font-display text-xl text-ivory-50">Défis du jour</h2>
        <p className="text-xs text-ivory-300/75">Trois nouveaux défis chaque jour (heure de Paris), récompensés en jetons virtuels et en XP.</p>
        <ul className="mt-3 space-y-2">
          {challenges.map((c) => (
            <li key={c.id} className="rounded-2xl border border-ivory-100/10 bg-ink-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ivory-50">{c.label}</p>
                {c.done ? <Badge tone="green">Accompli</Badge> : <span className="text-xs text-gold-300">+{formatChips(c.rewardChips)} · +{c.rewardXp} XP</span>}
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
          Objectifs <span className="text-sm text-gold-300">{achievements.filter((a) => a.unlockedAt).length} / {achievements.length}</span>
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {achievements.map((a) => (
            <li key={a.id} className={`rounded-2xl border p-3 ${a.unlockedAt ? 'border-gold-500/50 bg-gold-500/10' : 'border-ivory-100/10 bg-ink-900/50 opacity-80'}`}>
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ivory-50">
                {a.label}
                {a.unlockedAt ? <Badge tone="gold">Débloqué</Badge> : <span className="text-xs font-normal text-gold-300">+{formatChips(a.rewardChips)}</span>}
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
        <h2 className="font-display text-xl text-ivory-50">Classement</h2>
        <div className="w-60">
          <Segmented<BjLeaderboardKind> value={by} options={['xp', 'chips']} onChange={setBy} label="Classer par" format={(v) => (v === 'xp' ? 'Expérience' : 'Jetons')} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-ivory-300/70">Classement indisponible pour l’instant.</p>}
      {!error && rows === null && <p className="mt-3 text-sm text-ivory-300/70">Chargement…</p>}
      {rows?.length === 0 && <p className="mt-3 text-sm text-ivory-300/70">Personne n’a encore joué au Blackjack. Soyez le premier du classement.</p>}
      <ol className="mt-3 divide-y divide-ivory-100/10" data-testid="bj-leaderboard">
        {rows?.map((e) => (
          <li key={e.rank} className="flex items-center gap-3 py-2.5">
            <span className="w-6 text-center font-display text-lg text-gold-300">{e.rank}</span>
            <Avatar nickname={e.nickname} avatar={e.avatar} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ivory-50">{e.nickname}</span>
              <span className="text-xs text-ivory-300/75">
                Niveau {e.level} · {e.title} · {e.rounds} manche{e.rounds > 1 ? 's' : ''}
              </span>
            </span>
            <span className="text-right text-sm font-semibold text-ivory-50">{by === 'xp' ? `${e.xp} XP` : formatChips(e.chips)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function HistoryPanel({ items }: { items: BjHistoryItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0)
    return (
      <Panel className="p-5">
        <p className="text-sm text-ivory-300/80">Aucune manche terminée pour l’instant. Votre historique apparaîtra ici.</p>
      </Panel>
    );
  return (
    <Panel className="p-3 sm:p-4">
      <h2 className="px-1 pb-2 font-display text-xl text-ivory-50">Dernières manches</h2>
      <ul className="divide-y divide-ivory-100/10" data-testid="bj-history">
        {items.map((h) => (
          <li key={h.id} className="py-2">
            <button type="button" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id} className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-ivory-100/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ivory-50">
                  {h.hands.length > 1 ? `${h.hands.length} mains` : h.hands[0] ? RESULT_LABEL[h.hands[0].result ?? 'LOSE'] : '—'} · mise {formatChips(h.wagered)}
                </span>
                <span className="text-xs text-ivory-300/75">
                  {dateText(h.endedAt)} · {h.decks} jeu{h.decks > 1 ? 'x' : ''}
                </span>
              </span>
              <span className={`font-display text-lg ${h.net > 0 ? 'text-emerald-300' : h.net < 0 ? 'text-ruby-300' : 'text-ivory-200'}`}>{formatSignedChips(h.net)}</span>
            </button>
            {open === h.id && (
              <div className="mt-2 space-y-2 px-1">
                <div>
                  <p className="text-xs text-ivory-300/75">Croupier</p>
                  <div className="flex [&>*:not(:first-child)]:-ml-6">
                    {h.dealer.map((c, i) => (
                      <PlayingCard key={i} code={c} size="xs" />
                    ))}
                  </div>
                </div>
                {h.hands.map((hand, i) => (
                  <div key={i}>
                    <p className="flex items-center gap-2 text-xs text-ivory-300/75">
                      Main {i + 1} {hand.result && <Badge tone={RESULT_TONE[hand.result]}>{RESULT_LABEL[hand.result]}</Badge>} {formatSignedChips(hand.net)}
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
