import { Button } from '../components/ui';
import { VariantGlyph } from '../components/VariantGlyph';
import { VARIANTS } from '../lib/labels';
import type { VariantId } from '../lib/types';
import { VARIANT_META } from '../lib/variantInfo';
import { useI18n } from '../i18n';
import { OpenRooms } from './Home';

type Props = {
  onBack: () => void;
  onCreate: (variant?: VariantId) => void;
  onJoin: (code?: string) => void;
  onWatch?: (code: string) => void;
  onJoinTable?: (game: 'blackjack' | 'tableau', code: string, variant?: 'classic' | 'hand5') => void;
  onBlackjack: () => void;
  onTableau: (variant: 'classic' | 'hand5') => void;
  onVariants?: () => void;
};

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-ivory-50">{title}</h2>
      {text && <p className="mt-1 max-w-2xl text-sm text-ivory-200/85">{text}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** « Jouer en multijoueurs » : tout ce qui se joue à plusieurs, par jeu, avec les tables ouvertes en direct. */
export function Multiplayer({ onBack, onCreate, onJoin, onWatch, onJoinTable, onBlackjack, onTableau, onVariants }: Props) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        {t('common.backHome')}
      </Button>
      <h1 className="font-display text-3xl text-ivory-50 sm:text-4xl">{t('mp.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ivory-200/85">{t('mp.lead')}</p>

      <div className="mt-8">
        <OpenRooms onSelect={onJoin} onWatch={onWatch} onSelectTable={onJoinTable} onCreate={() => onCreate()} />
      </div>

      <Section title={t('mp.poker')} text={t('mp.poker.text')}>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => onCreate()}>{t('home.create.title')}</Button>
          <Button variant="secondary" onClick={() => onJoin()}>{t('home.join.title')}</Button>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VARIANTS.map((v) => {
            const m = VARIANT_META[v.id];
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onCreate(v.id)}
                  aria-label={`${t('mp.start')} ${v.name}`}
                  className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-ink-600 bg-ink-800/70 p-4 text-left transition hover:border-gold-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                >
                  <VariantGlyph id={v.id} size={40} />
                  <span className="font-medium text-ivory-50">{v.name}</span>
                  <span className="text-xs text-ivory-200/80">{t('vi.players', { min: m.minPlayers, max: m.maxPlayers })}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {onVariants && (
          <Button variant="ghost" className="mt-3 -ml-3" onClick={onVariants}>{t('mp.rules')}</Button>
        )}
      </Section>

      <Section title={t('home.blackjack')} text={t('mp.bj.text')}>
        <Button onClick={onBlackjack}>{t('mp.bj.cta')}</Button>
      </Section>

      <Section title={t('mp.tb')} text={t('mp.tb.text')}>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => onTableau('classic')}>{t('tb.variant.classic')}</Button>
          <Button variant="secondary" onClick={() => onTableau('hand5')}>{t('tb.variant.hand5')}</Button>
        </div>
      </Section>
    </main>
  );
}
