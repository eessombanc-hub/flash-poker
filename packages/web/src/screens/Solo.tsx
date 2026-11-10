import { Eyebrow, Panel, Button } from '../components/ui';
import { CardsIcon, CoinIcon } from '../components/Icons3D';
import { VARIANTS } from '../lib/labels';
import type { VariantId } from '../lib/types';
import { useI18n } from '../i18n';

/** Menu « Jouer en solo » : chaque variante de poker contre le CPU, ou le Blackjack face au croupier. */
export function Solo({ onBack, onPick, onBlackjack, onTableau }: { onBack: () => void; onPick: (variant: VariantId | null) => void; onBlackjack: () => void; onTableau?: (variant: 'classic' | 'hand5') => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('solo.back')}
      </Button>
      <Eyebrow>{t('solo.eyebrow')}</Eyebrow>
      <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">{t('solo.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ivory-200/85">{t('solo.lead')}</p>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('solo.poker')}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('solo.poker.aria')}>
        <li>
          <Tile title={t('solo.all.title')} text={t('solo.all.text')} onClick={() => onPick(null)} primary />
        </li>
        {VARIANTS.map((v) => (
          <li key={v.id}>
            <Tile title={v.name} tag={v.tagline} text={v.description} onClick={() => onPick(v.id)} />
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('solo.casino')}</h2>
      <Panel className="relative flex items-center gap-4 border-gold-500/40 bg-gradient-to-r from-felt-800 via-felt-900 to-ink-900 p-4">
        <CoinIcon size={54} />
        <div className="min-w-0">
          <button type="button" onClick={onBlackjack} className="text-left font-display text-xl text-ivory-50 after:absolute after:inset-0 after:rounded-[28px] after:content-[''] focus:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-gold-400">
            {t('solo.blackjack')}</button>
          <p className="text-sm text-ivory-200/85">{t('solo.bj.text')}</p>
        </div>
      </Panel>
      {onTableau && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-widest text-gold-400">{t('solo.tb')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('solo.tb')}>
            <li>
              <Tile title={t('tb.variant.classic')} tag={t('solo.tb.classic.tag')} text={t('solo.tb.classic.text')} onClick={() => onTableau('classic')} />
            </li>
            <li>
              <Tile title={t('tb.variant.hand5')} tag={t('solo.tb.hand5.tag')} text={t('solo.tb.hand5.text')} onClick={() => onTableau('hand5')} />
            </li>
          </ul>
        </>
      )}
    </main>
  );
}

function Tile({ title, tag, text, onClick, primary = false }: { title: string; tag?: string; text: string; onClick: () => void; primary?: boolean }) {
  return (
    <div className={`group relative flex h-full gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400 motion-reduce:transform-none ${primary ? 'border-gold-400/70 bg-gradient-to-br from-gold-500/25 via-ink-800/90 to-ink-900 shadow-gold' : 'border-ivory-100/12 bg-gradient-to-br from-ink-700/80 to-ink-900/90 hover:border-ivory-100/30'}`}>
      <span aria-hidden="true" className="mt-0.5">
        <CardsIcon size={40} />
      </span>
      <span className="min-w-0">
        <button type="button" onClick={onClick} className="block text-left font-display text-lg text-ivory-50 after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-none">
          {title}
        </button>
        {tag && <span className="block text-xs text-gold-300">{tag}</span>}
        <span className="mt-1 block text-sm text-ivory-200/80">{text}</span>
      </span>
    </div>
  );
}
