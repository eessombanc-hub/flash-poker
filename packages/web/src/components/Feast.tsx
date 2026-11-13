import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { Confetti } from './Confetti';
import { LightRays, Sparkles } from './Winner';
import { RevealCard } from './Scene3D';
import { useI18n } from '../i18n';

const SPARK = ['#f0d68c', '#e6cf9c', '#5bc79f', '#e0707a', '#8fb4f0', '#fbf8f1'];

/** Trois gerbes d'artifice successives autour du bandeau : de petits points colorés qui partent du centre et s'éteignent. */
function Fireworks() {
  const reduce = useReducedMotion();
  const bursts = useMemo(
    () => [
      { x: '18%', y: '30%', delay: 0.2 },
      { x: '82%', y: '26%', delay: 0.7 },
      { x: '50%', y: '14%', delay: 1.2 },
    ].map((b, bi) => ({ ...b, dots: Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * Math.PI * 2, d: 38 + ((i * 13 + bi * 7) % 5) * 9, c: SPARK[(i + bi) % SPARK.length]! })) })),
    [],
  );
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {bursts.map((b, bi) =>
        b.dots.map((d, i) => (
          <motion.span
            key={`${bi}-${i}`}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{ left: b.x, top: b.y, backgroundColor: d.c, boxShadow: `0 0 8px ${d.c}` }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(d.a) * d.d, y: Math.sin(d.a) * d.d + 10, opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 0.6] }}
            transition={{ delay: b.delay, duration: 1.3, ease: 'easeOut', repeat: 1, repeatDelay: 2.2 }}
          />
        )),
      )}
    </div>
  );
}

/**
 * Seule mise en scène de combinaison du résultat d'une manche : la quinte flush. Bandeau doré, rayons, étincelles,
 * artifices et pluie de confettis ; les cartes de la quinte se retournent une à une. Sans mouvement si l'utilisateur
 * préfère moins d'animations (le bandeau reste, lui, affiché).
 */
export function StraightFlushFeast({ name, cards, line }: { name: string; cards: readonly string[]; line?: number }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  return (
    <motion.section
      data-testid="quinte-flush"
      aria-label={t('feast.title')}
      className="relative mt-3 overflow-hidden rounded-2xl border border-gold-400/70 bg-gradient-to-br from-gold-500/30 via-ink-900/90 to-gold-500/15 px-4 py-5 text-center shadow-[0_0_40px_-8px_rgba(240,214,140,0.55)]"
      initial={reduce ? false : { opacity: 0, scale: 0.8, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 190, damping: 15 }}
    >
      <Confetti count={90} />
      <LightRays />
      <Sparkles count={20} radius={170} />
      <Fireworks />
      <div className="relative">
        <p className="feast-title font-display text-3xl sm:text-4xl">{t('feast.title')}</p>
        <p className="mt-1 text-sm text-ivory-100">
          {line ? t('feast.by_line', { name, line }) : t('feast.by', { name })}
        </p>
        {cards.length > 0 && (
          <span className="mt-3 flex justify-center -space-x-1.5" role="group" aria-label={t('overlays.cartes_de_la')}>
            {cards.map((c, i) => (
              <RevealCard key={c} code={c} size="sm" index={i} />
            ))}
          </span>
        )}
      </div>
    </motion.section>
  );
}
