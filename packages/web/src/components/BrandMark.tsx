import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useId } from 'react';
import { useI18n } from '../i18n';

const BOLT = 'M38 4 L14 38 H27 L22 60 L50 22 H35 Z';

/**
 * Emblème en volume : deux cartes en éventail derrière un jeton d'or marqué d'un éclair. Le jeton et l'éclair sont
 * des couches empilées en profondeur (CSS 3D) : l'ensemble garde son épaisseur quand il se balance ou suit le pointeur.
 */
function Emblem({ size, rx, ry }: { size: number; rx: ReturnType<typeof useSpring>; ry: ReturnType<typeof useSpring> }) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div className="relative shrink-0 [perspective:520px]" style={{ width: size, height: size }} aria-hidden="true">
      <motion.div className="absolute inset-0 [transform-style:preserve-3d]" style={{ rotateX: rx, rotateY: ry }}>
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          animate={reduce ? undefined : { rotateY: [-16, 16, -16], y: [0, -3, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* cartes */}
          <div className="absolute left-[8%] top-[6%] h-[62%] w-[44%] origin-bottom rounded-[7px] border border-[#b9ad94] bg-gradient-to-br from-ivory-50 to-ivory-200 shadow-[0_6px_10px_rgba(0,0,0,.45)] [transform:translateZ(-26px)_rotate(-18deg)]">
            <span className="absolute left-[10%] top-[4%] font-display text-[0.9em] font-bold leading-none text-ink-900" style={{ fontSize: size * 0.2 }}>A<br />♠</span>
          </div>
          <div className="absolute left-[40%] top-[4%] h-[62%] w-[44%] origin-bottom rounded-[7px] border border-[#b9ad94] bg-gradient-to-br from-ivory-50 to-ivory-200 shadow-[0_6px_10px_rgba(0,0,0,.45)] [transform:translateZ(-14px)_rotate(14deg)]">
            <span className="absolute left-[10%] top-[4%] font-display font-bold leading-none text-ruby-500" style={{ fontSize: size * 0.2 }}>A<br />♥</span>
          </div>
          {/* jeton : épaisseur par couches, puis face */}
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} className="absolute inset-[14%] rounded-full bg-[#7a5a22]" style={{ transform: `translateZ(${-6 + k * 2}px)`, top: '24%', bottom: '2%' }} />
          ))}
          <div className="absolute rounded-full border-2 border-[#f3dfa6] bg-[conic-gradient(from_20deg,#c9a25a,#f6e2a8,#a9843f,#e6cf9c,#846531,#e6cf9c,#c9a25a)] shadow-[0_10px_16px_rgba(0,0,0,.5)]" style={{ inset: '24% 14% 2% 14%', transform: 'translateZ(6px)' }}>
            <div className="absolute inset-[11%] rounded-full border border-dashed border-[#5b4116]/70" />
            <div className="absolute inset-[20%] rounded-full bg-gradient-to-br from-felt-600 to-felt-900 shadow-[inset_0_2px_4px_rgba(0,0,0,.6)]" />
          </div>
          {/* éclair en relief */}
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <svg key={k} viewBox="0 0 64 64" className="absolute" style={{ inset: '26% 24% 6% 22%', transform: `translateZ(${8 + k * 1.6}px)`, width: '54%', height: '66%' }}>
              <path d={BOLT} fill={k === 5 ? `url(#${id}-b)` : '#8a6a2a'} stroke={k === 5 ? '#fff4c9' : 'none'} strokeWidth="1.2" strokeLinejoin="round" />
              {k === 5 && (
                <defs>
                  <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fff6cf" />
                    <stop offset=".5" stopColor="#f0c75a" />
                    <stop offset="1" stopColor="#b98a2b" />
                  </linearGradient>
                </defs>
              )}
            </svg>
          ))}
        </motion.div>
      </motion.div>
      {/* étincelles */}
      <span className="absolute -right-1 top-0 animate-[twinkle_3.2s_ease-in-out_infinite] text-gold-300" style={{ fontSize: size * 0.2 }}>✦</span>
      <span className="absolute -left-2 bottom-[18%] animate-[twinkle_3.2s_ease-in-out_1.4s_infinite] text-ivory-100" style={{ fontSize: size * 0.14 }}>✦</span>
    </div>
  );
}

const rise = { hidden: { opacity: 0, rotateX: -80, y: 14 }, show: { opacity: 1, rotateX: 0, y: 0 } };

/**
 * Titre d'accueil : emblème en 3D et nom en lettres d'or extrudées. Les lettres se redressent une à une à l'ouverture,
 * un reflet traverse le nom à intervalles réguliers, l'ensemble s'incline vers le pointeur. Immobile si les animations
 * sont réduites. Le nom reste lisible (et unique) pour les lecteurs d'écran.
 */
export function BrandMark({ size = 76 }: { size?: number }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const name = t('home.flash_poker');
  const [first = '', ...rest] = name.split(' ');
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 90, damping: 14 });
  const sy = useSpring(my, { stiffness: 90, damping: 14 });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    sy.set(((e.clientX - r.left) / r.width - 0.5) * 30);
    sx.set(((e.clientY - r.top) / r.height - 0.5) * -20);
  };
  const onLeave = () => {
    sx.set(0);
    sy.set(0);
  };
  const words = [first, rest.join(' ')].filter(Boolean);
  return (
    <div className="flex items-center gap-3 sm:gap-4" onPointerMove={onMove} onPointerLeave={onLeave} data-testid="brand-mark">
      <Emblem size={size} rx={sx} ry={sy} />
      <p className="sr-only">{name}</p>
      <motion.div
        aria-hidden="true"
        className="select-none leading-[0.9] [perspective:600px]"
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: reduce ? 0 : 0.045, delayChildren: 0.2 }}
      >
        {words.map((w, wi) => (
          <div key={w} className={`flex font-display font-bold uppercase tracking-[0.06em] ${wi === 0 ? 'text-[1.7rem] sm:text-[2.6rem]' : 'text-[1.15rem] sm:text-[1.75rem] tracking-[0.34em]'}`}>
            {Array.from(w).map((ch, i) => (
              <motion.span key={i} variants={rise} transition={{ type: 'spring', stiffness: 160, damping: 14 }} className="relative inline-block [transform-origin:50%_100%]">
                {/* épaisseur : copie sombre décalée vers le bas, puis face dorée avec reflet */}
                <span className="absolute left-0 top-0 text-[#6b4d1c] [text-shadow:0_1px_0_#7a5a22,0_2px_0_#6b4d1c,0_3px_0_#5b4116,0_4px_0_#4a3412,0_8px_10px_rgba(0,0,0,.55)]" aria-hidden="true">{ch}</span>
                <span className="relative bg-[linear-gradient(100deg,#a9843f_0%,#f6e2a8_20%,#c9a25a_38%,#fff7d6_50%,#c9a25a_62%,#e6cf9c_80%,#a9843f_100%)] bg-[length:260%_100%] bg-clip-text text-transparent motion-safe:animate-brandshine" style={{ animationDelay: `${wi * 0.25 + i * 0.05}s` }}>{ch}</span>
              </motion.span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
