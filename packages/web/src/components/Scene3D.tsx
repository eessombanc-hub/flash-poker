import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import { useSettings } from '../lib/settings';
import { PlayingCard } from './Card';
import { ChipsIcon, TrophyIcon } from './Icons3D';

/**
 * Effets en trois dimensions, en CSS pur (perspective et rotations) : aucune bibliothèque 3D à charger.
 * Tous respectent `prefers-reduced-motion` : l'utilisateur voit alors les mêmes éléments, immobiles.
 */

/** Carte à deux faces : `flipped` la montre de dos (rotation de 180° autour de l'axe vertical). */
export function Flip3D({ front, back, flipped = false, delay = 0, duration = 0.7, className = '' }: { front: ReactNode; back: ReactNode; flipped?: boolean; delay?: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`relative [transform-style:preserve-3d] ${className}`}
      initial={false}
      animate={{ rotateY: flipped ? 180 : 0 }}
      transition={{ duration: reduce ? 0 : duration, delay: reduce ? 0 : delay, type: 'spring', stiffness: 120, damping: 16 }}
      style={{ transformPerspective: 900 }}
    >
      <div className="[backface-visibility:hidden]">{front}</div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>
    </motion.div>
  );
}

/** Carte qui arrive de dos puis se retourne, une fois, avec un décalage (pour dévoiler une main, une combinaison). */
export function RevealCard({ code, index = 0, size = 'xs', hint }: { code: string; index?: number; size?: 'xs' | 'sm' | 'md'; hint?: string }) {
  const { fourColor, cardBack } = useSettings();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(!!reduce);
  return (
    <motion.span
      className="inline-block"
      initial={reduce ? false : { y: -28, opacity: 0, scale: 0.85 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.15 + index * 0.16, ease: 'easeOut' }}
      onAnimationComplete={() => setShown(true)}
    >
      <Flip3D
        flipped={!shown}
        duration={0.8}
        front={<PlayingCard code={code} size={size} fourColor={fourColor} hint={hint} />}
        back={
          <span aria-hidden="true" className="block">
            <PlayingCard code={null} size={size} back={cardBack} />
          </span>
        }
      />
    </motion.span>
  );
}

/** Pièce d'or qui tourne sur son axe vertical (effet de rotation 3D d'une pièce lancée). */
function Coin({ size, spin }: { size: number; spin: number }) {
  return (
    <motion.span
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 35% 30%, #f6e7b8 0%, #d8b872 38%, #a9843f 78%, #846531 100%)',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.35), inset 0 -3px 5px rgba(80,50,10,.45), 0 2px 6px rgba(0,0,0,.35)',
      }}
      animate={{ rotateY: [0, 360] }}
      transition={{ duration: spin, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/** Pluie de pièces d'or qui tournent en tombant (fin de partie). Ne montre rien si les animations sont réduites. */
export function CoinRain({ count = 22 }: { count?: number }) {
  const reduce = useReducedMotion();
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: 4 + ((i * 37) % 92),
        delay: (i % 7) * 0.22,
        fall: 2.6 + (i % 5) * 0.35,
        size: 16 + (i % 4) * 5,
        spin: 0.9 + (i % 3) * 0.35,
        drift: ((i % 5) - 2) * 14,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden [perspective:700px]" aria-hidden="true">
      {coins.map((c) => (
        <motion.div
          key={c.id}
          className="absolute"
          style={{ left: `${c.x}%`, top: 0 }}
          initial={{ y: '-10vh', x: 0, opacity: 1 }}
          animate={{ y: '108vh', x: c.drift, opacity: [1, 1, 0.9] }}
          transition={{ duration: c.fall, delay: c.delay, ease: 'easeIn' }}
        >
          <Coin size={c.size} spin={c.spin} />
        </motion.div>
      ))}
    </div>
  );
}

/** Trophée qui pivote lentement sur lui-même avec un halo doré qui respire. */
export function SpinTrophy({ size = 84, className = '' }: { size?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative inline-block [perspective:500px] ${className}`} style={{ width: size, height: size }}>
      {!reduce && (
        <motion.span
          className="absolute inset-[-18%] rounded-full bg-gold-400/25 blur-xl"
          aria-hidden="true"
          animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <motion.div
        className="relative [transform-style:preserve-3d]"
        initial={reduce ? false : { rotateY: -540, scale: 0.4, opacity: 0 }}
        animate={reduce ? undefined : { rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 1.1, type: 'spring', stiffness: 60, damping: 12 }}
      >
        <motion.div animate={reduce ? undefined : { rotateY: [0, 18, 0, -18, 0], y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}>
          <TrophyIcon size={size} />
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Balayage de lumière qui traverse un bandeau une fois (mise en valeur du vainqueur). */
export function Shine({ delay = 0.6 }: { delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
      <motion.span
        className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        initial={{ x: '0%' }}
        animate={{ x: '420%' }}
        transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
      />
    </span>
  );
}

/**
 * Scène d'accueil : un éventail de cinq cartes en volume, qui flotte et s'incline vers le pointeur
 * (souris ou doigt). Un clic sur une carte la retourne. Jetons et trophée sont à des profondeurs différentes,
 * ce qui crée la parallaxe. Immobile si les animations sont réduites.
 */
export function HeroScene() {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 90, damping: 14 });
  const sy = useSpring(ry, { stiffness: 90, damping: 14 });
  const chipX = useTransform(sy, (v) => v * -1.6);
  const trophyX = useTransform(sy, (v) => v * 1.4);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const cards = ['As', 'Ks', 'Qh', 'Jd', 'Tc'];

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 24);
    rx.set(((e.clientY - r.top) / r.height - 0.5) * -16);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div className="relative mx-auto h-48 w-full max-w-md [perspective:900px] sm:h-60" onPointerMove={onMove} onPointerLeave={onLeave} data-testid="hero-scene">
      <motion.div className="absolute inset-0 [transform-style:preserve-3d]" style={{ rotateX: sx, rotateY: sy }}>
        <div className="absolute inset-x-0 bottom-4 flex items-end justify-center [transform-style:preserve-3d]">
          {cards.map((c, i) => {
            const k = i - 2;
            return (
              <motion.div
                key={c}
                className="-mx-3 origin-bottom [transform-style:preserve-3d]"
                style={{ rotate: k * 9, translateY: Math.abs(k) * 6, translateZ: (2 - Math.abs(k)) * 18 }}
                initial={reduce ? false : { y: 90, opacity: 0, rotateX: 60 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                transition={{ duration: 0.8, delay: 0.15 + i * 0.12, type: 'spring', stiffness: 70, damping: 12 }}
              >
                <motion.div
                  animate={reduce ? undefined : { y: [0, -7 - Math.abs(k), 0] }}
                  transition={{ duration: 3.4 + i * 0.35, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                  className="drop-shadow-[0_12px_18px_rgba(0,0,0,0.5)]"
                >
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
                    aria-label={flipped[i] ? 'Retourner la carte face visible' : 'Retourner la carte'}
                    aria-pressed={!!flipped[i]}
                    className="block cursor-pointer rounded-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
                  >
                    <Flip3D flipped={!!flipped[i]} front={<PlayingCard code={c} size="lg" />} back={
                      <span aria-hidden="true" className="block">
                        <PlayingCard code={null} size="lg" back="etoile" />
                      </span>
                    } />
                  </button>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
        <motion.div className="pointer-events-none absolute bottom-0 left-2 sm:left-6" style={{ x: chipX, translateZ: 60, rotate: -12 }}>
          <motion.div animate={reduce ? undefined : { y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <ChipsIcon size={74} />
          </motion.div>
        </motion.div>
        <motion.div className="pointer-events-none absolute right-2 top-0 sm:right-8" style={{ x: trophyX, translateZ: 80, rotate: 6 }}>
          <motion.div animate={reduce ? undefined : { rotateY: [0, 25, 0, -25, 0], y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
            <TrophyIcon size={64} />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
