import { motion, useReducedMotion } from 'framer-motion';
import { PlayingCard } from './Card';
import { CoinIcon } from './Icons3D';
import { TablePreview } from './TablePreview';

/**
 * Illustrations des diapositives du bandeau central : une scène par jeu, toutes composées des vraies cartes de
 * l'application. Purement décoratives (le texte de la diapositive porte l'information) et jouées une fois à l'apparition ;
 * immobiles si l'utilisateur limite les animations.
 */

type Rise = { delay: number; children: React.ReactNode; className?: string; rotate?: number };

function Rise({ delay, children, className = '', rotate = 0 }: Rise) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18, rotate: rotate * 2 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ delay: reduce ? 0 : delay, type: 'spring', stiffness: 130, damping: 15 }}
    >
      {children}
    </motion.div>
  );
}

const frame = 'relative mx-auto flex w-full max-w-[30rem] select-none items-center justify-center';

/** Poker : la table et sa quinte flush royale. */
export function PokerArt() {
  return <TablePreview />;
}

/** 6-3 : trois lignes, chacune avec ses deux cartes désignées (en or) parmi les cartes de la ligne. */
export function OmahaArt() {
  const rows: string[][] = [
    ['Ah', 'Kh', 'Qh', '7c', '2d'],
    ['Ad', 'Js', 'Qh', '7c', '9s'],
    ['Ac', 'Th', 'Qh', '7c', '4h'],
  ];
  return (
    <div className={`${frame} flex-col gap-2`} aria-hidden="true">
      {rows.map((row, r) => (
        <Rise key={r} delay={0.15 + r * 0.25} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-400/60 bg-ink-900/70 font-display text-sm text-gold-300">{r + 1}</span>
          <div className="flex gap-1">
            {row.map((c, i) => (
              <PlayingCard key={c + i} code={c} size="xs" highlight={i < 2} />
            ))}
          </div>
        </Rise>
      ))}
    </div>
  );
}

/** Poker fermé : cinq cartes en éventail, deux écartées pour le change. */
export function ClosedArt() {
  const hand = ['As', 'Ad', '7c', '7h', 'Kd'];
  return (
    <div className={`${frame} h-48`} aria-hidden="true">
      <div className="flex items-end">
        {hand.map((c, i) => (
          <Rise key={c} delay={0.1 + i * 0.12} rotate={(i - 2) * 7} className={`-ml-3 first:ml-0 ${i === 4 ? 'translate-y-0' : ''}`}>
            <div className={i === 2 || i === 4 ? '-translate-y-6' : ''}>
              <PlayingCard code={c} size="sm" highlight={i === 2 || i === 4} />
            </div>
          </Rise>
        ))}
      </div>
      <span className="absolute right-[10%] top-0 rounded-full border border-gold-300/70 bg-ink-900/80 px-3 py-1 font-display text-lg text-gold-200">⇄</span>
    </div>
  );
}

/** Hold'em revisité : la grille 3×3 du Morpion, une diagonale gagnante. */
export function HoldemArt() {
  const grid = ['As', '7d', 'Kc', '3h', 'Ah', '9c', 'Jd', '2s', 'Ac'];
  return (
    <div className={`${frame} flex-col`} aria-hidden="true">
      <div className="grid grid-cols-3 gap-1.5">
        {grid.map((c, i) => (
          <Rise key={c} delay={0.08 * i}>
            <PlayingCard code={c} size="xs" highlight={i % 4 === 0} dimmed={i % 4 !== 0} />
          </Rise>
        ))}
      </div>
    </div>
  );
}

/** Blackjack : as et roi, le 21 et quelques jetons. */
export function BlackjackArt() {
  return (
    <div className={`${frame} h-52`} aria-hidden="true">
      <Rise delay={0.1} rotate={-8} className="-mr-6">
        <PlayingCard code="As" size="lg" />
      </Rise>
      <Rise delay={0.3} rotate={7}>
        <PlayingCard code="Kh" size="lg" />
      </Rise>
      <Rise delay={0.6} className="absolute -top-1 right-[14%]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-300 bg-ink-950/85 font-display text-3xl text-gold-200 shadow-gold">21</span>
      </Rise>
      <Rise delay={0.8} className="absolute bottom-0 left-[12%]">
        <CoinIcon size={44} />
      </Rise>
    </div>
  );
}

/** Tableau : cinq colonnes de cartes, trois d'entre elles remportées. */
export function TableauArt() {
  const tops = ['Qh', '9s', 'Ad', '5c', 'Kh'];
  return (
    <div className={`${frame} items-start gap-2`} aria-hidden="true">
      {tops.map((c, col) => (
        <Rise key={c} delay={0.1 + col * 0.12} className="flex flex-col items-center">
          <PlayingCard code={null} size="xs" className="mb-[-2.1rem]" />
          <PlayingCard code={null} size="xs" className="mb-[-2.1rem]" />
          <PlayingCard code={c} size="xs" highlight={col % 2 === 0} />
        </Rise>
      ))}
    </div>
  );
}
