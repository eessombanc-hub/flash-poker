import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = ['#c9a25a', '#e6cf9c', '#3fae86', '#e0707a', '#6f9be0', '#fbf8f1'];

/** Une courte pluie de confettis, une seule fois au montage. Rien si `prefers-reduced-motion` est actif. */
export function Confetti({ count = 26 }: { count?: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 1.5 + Math.random() * 1.1,
        color: COLORS[i % COLORS.length]!,
        rotate: 180 + Math.random() * 360,
        w: 5 + Math.random() * 5,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ top: '-8%', left: `${p.x}%`, opacity: 1, rotate: 0 }}
          animate={{ top: '105%', rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          className="absolute rounded-sm"
          style={{ width: p.w, height: p.w * 0.5, backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}
