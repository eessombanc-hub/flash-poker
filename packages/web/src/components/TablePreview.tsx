import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '../i18n';
import { PlayingCard } from './Card';
import { ChipsIcon } from './Icons3D';

const HAND = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
const SEATS: { cls: string; suit: string; red?: boolean; win?: boolean }[] = [
  { cls: 'left-[7%] top-[16%]', suit: '♥', red: true },
  { cls: 'right-[7%] top-[16%]', suit: '♦', red: true },
  { cls: 'left-[17%] bottom-[2%]', suit: '♣' },
  { cls: 'right-[17%] bottom-[2%]', suit: '♠', win: true },
];

/**
 * Aperçu de table : tapis, quatre places, cinq cartes qui se dévoilent l'une après l'autre jusqu'à une quinte flush
 * royale, puis la mise glisse vers le gagnant. La scène se joue une fois à l'ouverture de la page, puis reste fixe.
 * Purement décorative : aucune donnée de joueur réelle. Immobile (état final) si les animations sont réduites.
 */
export function TablePreview({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const at = (s: number) => (reduce ? 0 : s);
  return (
    <figure className={`relative mx-auto w-full max-w-[34rem] select-none ${className}`} aria-label={t('lob.preview.label')} data-testid="table-preview">
      <div className="relative aspect-[16/10] [perspective:900px]">
        {/* tapis : ellipse de feutre, rebord doré, filet intérieur */}
        <div className="absolute inset-x-[2%] inset-y-[8%] rounded-[50%] border-[5px] border-gold-500/80 bg-[radial-gradient(ellipse_at_50%_40%,#1a6b51_0%,#0e4130_55%,#06261c_100%)] shadow-[0_22px_40px_rgba(0,0,0,.55),inset_0_0_40px_rgba(0,0,0,.45)]" />
        <div className="absolute inset-x-[7%] inset-y-[14%] rounded-[50%] border border-dashed border-gold-300/30" />

        {/* places */}
        {SEATS.map((s, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className={`absolute flex h-[13%] aspect-square items-center justify-center rounded-full border-2 bg-ink-900 font-display text-lg shadow-[0_4px_8px_rgba(0,0,0,.5)] sm:text-2xl ${s.cls} ${s.win ? 'border-gold-300' : 'border-ivory-100/30'} ${s.red ? 'text-ruby-300' : 'text-ivory-100'}`}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: at(0.1 + i * 0.08), type: 'spring', stiffness: 160, damping: 14 }}
          >
            {s.suit}
            {s.win && (
              <motion.span className="absolute inset-[-5px] rounded-full border-2 border-gold-300" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: [0, 1, 0.55] }} transition={{ delay: at(2.2), duration: 0.9 }} />
            )}
          </motion.span>
        ))}

        {/* cartes communes */}
        <div className="absolute inset-x-0 top-[36%] flex justify-center gap-1 sm:gap-1.5">
          {HAND.map((c, i) => (
            <motion.div
              key={c}
              className="drop-shadow-[0_8px_10px_rgba(0,0,0,.5)]"
              initial={reduce ? false : { opacity: 0, y: -34, rotateX: 70 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: at(0.5 + i * 0.22), type: 'spring', stiffness: 120, damping: 14 }}
            >
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ delay: at(2.2 + i * 0.06), duration: 0.5 }}>
                <PlayingCard code={c} size="sm" />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* mise et annonce */}
        <motion.div className="absolute left-1/2 top-[22%] flex -translate-x-1/2 items-center gap-1.5" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at(0.3) }} aria-hidden="true">
          <ChipsIcon size={26} />
        </motion.div>
        <motion.figcaption
          className="absolute inset-x-0 bottom-[19%] mx-auto w-fit rounded-full border border-gold-300/70 bg-ink-950/85 px-4 py-1.5 text-center font-display text-sm tracking-wide text-gold-200 shadow-[0_6px_14px_rgba(0,0,0,.5)] sm:text-base"
          initial={reduce ? false : { opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: at(2.3), type: 'spring', stiffness: 150, damping: 13 }}
        >
          {t('lob.preview.hand')}
        </motion.figcaption>
      </div>
      <p className="mt-1 text-center text-[11px] text-ivory-300/70">{t('lob.preview.demo')}</p>
    </figure>
  );
}
