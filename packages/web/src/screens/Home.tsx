import { COMMON_RULES } from '../lib/rulesText';
import { VARIANTS, variantName } from '../lib/labels';
import { useClient } from '../lib/context';
import { formatChips } from '../lib/format';
import { ApiError, type LiveStats, type RoomSummary } from '../lib/api';
import { Badge, Button, Eyebrow, Modal, Panel } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { Banner, InfoTile, RailGroup, RailTile, SidePanel, type Slide } from '../components/Lobby';
import { TablePreview } from '../components/TablePreview';
import type { SpaceTab } from './Space';
import { useEffect, useState, type ReactNode } from 'react';
import { StatsIcon, CardsIcon, ChipsIcon, CoinIcon, JoinIcon, RulesIcon, TrophyIcon } from '../components/Icons3D';
import { SettingsBody } from '../components/SettingsBody';
import { useI18n } from '../i18n';
import { DailyStrip } from '../components/Engagement';
import { isFirstVisit, markOnboarded } from '../lib/onboarding';

const LIST_POLL_MS = 5000;

export function Home({ onChallenges, onQuickStart, onVariants, onCreate, onJoin, onTrain, onBlackjack, onTableau, onSpace, me, live, langSelect, notice, account }: { onChallenges?: () => void; onQuickStart?: () => void; onVariants?: () => void; onCreate: () => void; onJoin: (code?: string) => void; onTrain: () => void; onBlackjack?: () => void; onTableau?: (variant: 'classic' | 'hand5') => void; onSpace?: (tab: SpaceTab) => void; me?: { nickname: string; avatar?: string | null } | null; live?: LiveStats | null; langSelect?: ReactNode; notice?: string | null; account?: ReactNode }) {
  const { t } = useI18n();
  const [rules, setRules] = useState(false);
  const [settings, setSettings] = useState(false);
  const [welcome, setWelcome] = useState(() => !!onQuickStart && isFirstVisit());
  const space = (tab: SpaceTab) => () => onSpace?.(tab);

  // Joueur inscrit : bandeau à diapositives. Visiteur ou première visite : un seul message, une seule action.
  const slides: Slide[] = [
    { id: 'table', title: t('lob.s1.title'), text: t('lob.s1.text'), cta: t('lob.s1.cta'), onClick: onCreate, icon: <CardsIcon size={64} />, suit: '♠', bg: 'from-felt-700 via-felt-900 to-ink-900' },
    ...(onQuickStart ? [{ id: 'guide', title: t('lob.s2.title'), text: t('lob.s2.text'), cta: t('lob.s2.cta'), onClick: onQuickStart, icon: <TrophyIcon size={64} />, suit: '♥', bg: 'from-ruby-600/60 via-ink-800 to-ink-900' }] : []),
    ...(me && onChallenges ? [{ id: 'defis', title: t('lob.s3.title'), text: t('lob.s3.text'), cta: t('lob.s3.cta'), onClick: onChallenges, icon: <TrophyIcon size={64} />, suit: '♦', bg: 'from-gold-700/50 via-ink-800 to-ink-900' }] : []),
    ...(onVariants ? [{ id: 'variantes', title: t('lob.s4.title'), text: t('lob.s4.text'), cta: t('lob.s4.cta'), onClick: onVariants, icon: <ChipsIcon size={64} />, suit: '♣', bg: 'from-ink-600 via-ink-800 to-ink-900' }] : []),
  ];
  const showHero = welcome || !me;

  return (
    <div className="min-h-[calc(100dvh-3rem)]">
      <header className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 sm:px-5">
        <BrandMark />
        <div className="flex items-center gap-0 sm:gap-1">
          <Button variant="ghost" className="whitespace-nowrap px-2 sm:px-3" onClick={() => setSettings(true)}>
            {t('common.settings')}
          </Button>
          {account}
          {langSelect && <div className="ml-1 sm:ml-2">{langSelect}</div>}
        </div>
      </header>

      <main className="mx-auto grid max-w-[88rem] gap-4 px-4 pb-12 sm:px-5 lg:grid-cols-[13.5rem_minmax(0,1fr)_19rem] lg:items-start">
        {/* Rail des jeux : deux actions fortes, puis le poker, puis les autres jeux */}
        <nav aria-label={t('lob.rail')} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          <RailTile icon={<CardsIcon size={40} />} title={t('home.create.title')} onClick={onCreate} tone="gold" suit="♠" />
          <RailTile icon={<JoinIcon size={38} />} title={t('home.join.title')} onClick={() => onJoin()} tone="felt" suit="♥" />
          <RailGroup label={t('lob.group.poker')} />
          <RailTile icon={<TrophyIcon size={38} />} title={t('home.solo.title')} onClick={onTrain} tone="ink" suit="♦" />
          {onVariants && <RailTile icon={<ChipsIcon size={38} />} title={t('home.variants.title')} onClick={onVariants} tone="ink" suit="♣" />}
          {(onBlackjack || onTableau) && <RailGroup label={t('lob.group.other')} />}
          {onBlackjack && <RailTile icon={<CoinIcon size={38} />} title={t('home.blackjack')} onClick={onBlackjack} tone="ink" suit="♠" />}
          {onTableau && <RailTile icon={<CardsIcon size={38} />} title={t('tb.variant.classic')} onClick={() => onTableau('classic')} tone="ink" suit="♦" />}
          {onTableau && <RailTile icon={<CardsIcon size={38} />} title={t('tb.variant.hand5')} onClick={() => onTableau('hand5')} tone="ink" suit="♥" />}
        </nav>

        <div className="min-w-0 space-y-6">
          <h1 className="sr-only">{t('home.h1a')} {t('home.h1b')}</h1>
          {notice && (
            <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-950/60 px-4 py-2.5 text-sm text-amber-100">
              {notice}
            </p>
          )}

          {showHero ? (
            <section aria-label={welcome && onQuickStart ? t('ob.title') : t('lob.banner')} className="relative overflow-hidden rounded-3xl border border-gold-500/40 bg-gradient-to-br from-felt-700 via-felt-900 to-ink-900 p-5 shadow-gold sm:p-8">
              <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-12 select-none font-display text-[18rem] leading-none text-ivory-100/[0.05]">♠</span>
              <div className="relative grid items-center gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <div>
                  {welcome && onQuickStart && <Eyebrow>{t('ob.eyebrow')}</Eyebrow>}
                  <h2 className="mt-1 font-display text-3xl leading-tight tracking-wide text-ivory-50 sm:text-4xl">{welcome && onQuickStart ? t('ob.title') : t('lob.s1.title')}</h2>
                  <p className="mt-3 max-w-md text-sm text-ivory-100/90 sm:text-base">{welcome && onQuickStart ? t('ob.text') : t('lob.s1.text')}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {welcome && onQuickStart ? (
                      <>
                        <Button className="px-6 py-3 text-base" onClick={onQuickStart}>{t('ob.start')}</Button>
                        <Button variant="ghost" onClick={() => { markOnboarded(); setWelcome(false); }}>{t('ob.later')}</Button>
                      </>
                    ) : (
                      <>
                        <Button className="px-6 py-3 text-base" onClick={onCreate}>{t('lob.s1.cta')}</Button>
                        {onQuickStart && <Button variant="ghost" onClick={onQuickStart}>{t('lob.s2.cta')}</Button>}
                      </>
                    )}
                  </div>
                </div>
                <TablePreview />
              </div>
            </section>
          ) : (
            <Banner slides={slides} />
          )}

          {me && (
            <>
              <section aria-label={t('lob.events')}>
                <h2 className="mb-2 font-display text-xl text-ivory-50">{t('lob.events')}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <InfoTile title={t('lob.ev.defis')} onClick={space('defis')} icon={<TrophyIcon size={34} />} tone="gold" />
                  <InfoTile title={t('lob.ev.friends')} onClick={space('favoris')} icon={<JoinIcon size={34} />} />
                  <InfoTile title={t('lob.ev.invite')} onClick={space('inviter')} icon={<ChipsIcon size={34} />} />
                  <InfoTile title={t('lob.ev.rank')} onClick={space('classement')} icon={<StatsIcon size={34} />} />
                </div>
              </section>

              <section aria-label={t('lob.session')}>
                <h2 className="mb-2 font-display text-xl text-ivory-50">{t('lob.session')}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <InfoTile title={t('space.tab.historique')} onClick={space('historique')} icon={<RulesIcon size={30} />} />
                  <InfoTile title={t('space.tab.statistiques')} onClick={space('statistiques')} icon={<CoinIcon size={30} />} />
                  <InfoTile title={t('space.tab.manches')} onClick={space('manches')} icon={<CardsIcon size={30} />} />
                  <InfoTile title={t('space.tab.bankroll')} onClick={space('bankroll')} icon={<ChipsIcon size={30} />} />
                </div>
              </section>
            </>
          )}

          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label={t('home.stats.aria')}>
            {[
              [t('home.stat1.big'), t('home.stat1.small')],
              [t('home.stat2.big'), t('home.stat2.small')],
              [t('home.stat3.big'), t('home.stat3.small')],
              [t('home.stat4.big'), t('home.stat4.small')],
            ].map(([big, small]) => (
              <li key={big} className="rounded-2xl border border-ivory-100/10 bg-ink-800/60 px-4 py-3 text-center">
                <span className="block font-display text-2xl text-gold-300">{big}</span>
                <span className="text-xs text-ivory-100/85">{small}</span>
              </li>
            ))}
          </ul>

          <div id="open-rooms" className="scroll-mt-4">
            <OpenRooms onSelect={onJoin} onCreate={onCreate} />
          </div>
          <footer className="space-y-2 pt-4 text-center text-xs text-ivory-100/80">
            <p className="font-semibold text-ivory-100">{t('home.footer')}</p>
            <button type="button" onClick={() => setRules(true)} className="text-gold-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('home.rules.title')}</button>
          </footer>
        </div>

        <SidePanel live={live} me={me} onProfile={me && onSpace ? () => onSpace('profil') : undefined} onJoin={(c) => onJoin(c)}>
          {me && onChallenges && <DailyStrip onOpen={onChallenges} />}
        </SidePanel>
      </main>
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {settings && (
        <Modal title={t('common.settings')} onClose={() => setSettings(false)}>
          <h2 className="font-display text-2xl text-ivory-50">{t('common.settings')}</h2>
          <div className="mt-5">
            <SettingsBody />
          </div>
          <div className="mt-7 flex justify-end">
            <Button onClick={() => setSettings(false)}>{t('common.close')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Liste publique des parties ouvertes : actualisée en continu, on les rejoint en un clic. */
function OpenRooms({ onSelect, onCreate }: { onSelect: (code: string) => void; onCreate: () => void }) {
  const { t, tp } = useI18n();
  const client = useClient();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await client.listRooms();
        if (!cancelled) {
          setRooms(list);
          setError(false);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setError(true);
      }
    }
    load();
    const id = setInterval(load, LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client]);

  return (
    <section className="mx-auto mt-10 w-full max-w-3xl text-left">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gold-400">
        <ChipsIcon size={28} />
        {t('rooms.title')}
      </h2>
      <Panel className="divide-y divide-ivory-100/10 p-2">
        {rooms === null && !error && <p className="px-3 py-4 text-center text-sm text-ivory-200/80">{t('rooms.searching')}</p>}
        {error && <p className="px-3 py-4 text-center text-sm text-ivory-200/80">{t('rooms.unavailable')}</p>}
        {rooms?.length === 0 && (
          <div className="px-3 py-5 text-center">
            <p className="text-sm text-ivory-100/85">{t('rooms.none')}</p>
            <Button className="mt-3" onClick={onCreate}>{t('rooms.first')}</Button>
          </div>
        )}
        {rooms?.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => onSelect(r.code)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ivory-100/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold-400"
          >
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium text-ivory-50">{r.name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ivory-300/70">
                <span className="font-semibold text-ivory-100">{r.variant ? variantName(r.variant) : t('rooms.libre')}</span>
                <span>
                  {t('rooms.players', { a: r.maxPlayers - r.seatsLeft, b: r.maxPlayers })}
                </span>
                <span>{tp('rooms.goal', r.targetPoints)}</span>
                {r.stakeChips > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t('rooms.perPlayer', { amount: formatChips(r.stakeChips) })}</span>
                  </>
                )}
                {r.assistance && <Badge tone="gold">{t('rooms.assist')}</Badge>}
              </span>
            </span>
            <Badge tone={r.status === 'RUNNING' ? 'amber' : 'green'}>{r.status === 'RUNNING' ? t('rooms.running') : t('rooms.waiting')}</Badge>
            <span className="rounded-full border border-gold-500/50 px-3 py-1 text-xs font-semibold text-gold-300">{t('rooms.join')}</span>
          </button>
        ))}
      </Panel>
    </section>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t('home.memo_des_regles')} onClose={onClose} wide>
      <Eyebrow>{t('home.regles_v1_1')}</Eyebrow>
      <h2 className="mt-1 font-display text-3xl text-ivory-50">{t('home.memo_des_regles')}</h2>
      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('home.les_huit_variantes')}</h3>
      <ul className="space-y-3">
        {VARIANTS.map((v) => (
          <li key={v.id} className="rounded-xl border border-ivory-100/10 bg-ink-900/60 p-3.5">
            <p className="font-display text-lg text-ivory-50">
              {v.name} <span className="ml-1 text-sm text-gold-400">({v.tagline})</span>
            </p>
            <p className="mt-1 text-sm text-ivory-200/85">{v.description}</p>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('home.regles_communes')}</h3>
      <dl className="space-y-3">
        {COMMON_RULES.map((r) => (
          <div key={r.title}>
            <dt className="font-semibold text-ivory-50">{r.title}</dt>
            <dd className="text-sm text-ivory-200/85">{r.text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 flex justify-end">
        <Button onClick={onClose}>{t('home.fermer')}</Button>
      </div>
    </Modal>
  );
}

export const Card = Panel; // alias de commodité pour les écrans à formulaire
