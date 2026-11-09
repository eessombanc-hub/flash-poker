import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, type ReactNode } from 'react';

/** Rayons de lumière dorés qui tournent lentement derrière le vainqueur. */
export function LightRays({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[260%] -translate-x-1/2 -translate-y-1/2 ${className}`}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      <motion.div
        className="h-full w-full rounded-full"
        style={{
          background: 'repeating-conic-gradient(from 0deg, rgba(240,214,140,0.30) 0deg 7deg, rgba(240,214,140,0) 7deg 24deg)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, rgba(0,0,0,0.55) 28%, transparent 62%)',
          maskImage: 'radial-gradient(circle, #000 0%, rgba(0,0,0,0.55) 28%, transparent 62%)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  );
}

/** Étincelles à quatre branches projetées autour du centre, une seule fois, puis scintillement discret. */
export function Sparkles({ count = 14, radius = 120 }: { count?: number; radius?: number }) {
  const reduce = useReducedMotion();
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.22;
        const dist = radius * (0.65 + ((i * 37) % 10) / 22);
        return { id: i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 8 + ((i * 7) % 4) * 3, delay: 0.25 + (i % 7) * 0.07 };
      }),
    [count, radius],
  );
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
      {stars.map((s) => (
        <motion.svg
          key={s.id}
          viewBox="0 0 20 20"
          width={s.size}
          height={s.size}
          className="absolute -left-2 -top-2 text-gold-300"
          initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
          animate={{ x: s.x, y: s.y, scale: [0, 1.25, 0.85], opacity: [0, 1, 0.9, 0.3, 0.9, 0.2], rotate: 90 }}
          transition={{ delay: s.delay, duration: 2.4, ease: 'easeOut' }}
        >
          <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="currentColor" />
        </motion.svg>
      ))}
    </div>
  );
}

/**
 * Mise en scène du vainqueur : lumière derrière lui, étincelles autour, et l'élément (trophée, avatar…) qui se
 * pose en ressort. Sans effet pour qui préfère moins d'animations : seul le contenu est rendu.
 */
export function WinnerSpotlight({ children, active = true, className = '' }: { children: ReactNode; active?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return <div className={className}>{children}</div>;
  return (
    <div className={`relative ${className}`}>
      <LightRays />
      <Sparkles />
      <motion.div className="relative" initial={{ scale: 0.55, y: 18, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 170, damping: 14, delay: 0.1 }}>
        {children}
      </motion.div>
    </div>
  );
}

/** Titre de victoire : apparition en ressort, puis une lueur dorée qui s'épanouit et se calme. */
export function VictoryTitle({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.h2
      data-testid={testId}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.9, textShadow: '0 0 0px rgba(240,214,140,0)' }}
      animate={
        reduce
          ? undefined
          : { opacity: 1, y: 0, scale: 1, textShadow: ['0 0 0px rgba(240,214,140,0)', '0 0 28px rgba(240,214,140,0.95)', '0 0 10px rgba(240,214,140,0.35)'] }
      }
      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: reduce ? 0 : 0.35, textShadow: { duration: 1.8, delay: 0.45, times: [0, 0.4, 1] } }}
    >
      {children}
    </motion.h2>
  );
}
