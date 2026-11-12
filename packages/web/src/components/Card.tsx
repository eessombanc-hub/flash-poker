import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { parseCode, type Suit } from '../lib/cards';
import type { CardBack as CardBackId } from '../lib/settings';
import { useI18n } from '../i18n';

export type CardSize = 'xs' | 'board' | 'sm' | 'md' | 'wide6' | 'fan' | 'lg' | 'col';
// `col` : carte d'une colonne du Tableau ; la largeur vient de la variable CSS --w posée par la colonne.
// `board` : cartes communes sur le tapis, un peu plus petites sur téléphone pour que la table et votre main
// tiennent ensemble dans l'écran.
// `wide6` : main de 6 cartes ou plus, un peu plus étroite sur téléphone pour tenir sur une seule ligne.
// `fan` : main de 5 cartes en éventail sur téléphone (cartes plus grandes, légèrement superposées), normale ailleurs.
const WIDTH: Record<CardSize, string> = { xs: 'w-9', board: 'w-10 sm:w-12', wide6: 'w-12 sm:w-16', fan: 'w-[4.6rem] sm:w-16', sm: 'w-12', md: 'w-[3.7rem] sm:w-16', lg: 'w-[4.6rem] sm:w-20', col: 'w-[var(--w)]' };

// Silhouettes des couleurs, dessinées dans une boîte de 100 × 100.
const SUIT_PATH: Record<Suit, string> = {
  d: 'M50 4 L90 50 L50 96 L10 50 Z',
  h: 'M50 90 C8 60 4 32 22 19 C37 9 50 21 50 32 C50 21 63 9 78 19 C96 32 92 60 50 90 Z',
  s: 'M50 6 C88 38 94 62 74 74 C62 81 53 74 50 66 C50 78 54 87 63 94 L37 94 C46 87 50 78 50 66 C47 74 38 81 26 74 C6 62 12 38 50 6 Z',
  c: 'M50 52 C50 74 46 86 37 94 L63 94 C54 86 50 74 50 52 Z',
};
const CLUB_CIRCLES: [number, number][] = [
  [50, 29],
  [28, 58],
  [72, 58],
];

/** Couleurs : classique (rouge / noir) ou quatre couleurs (aide à la lecture). */
export function suitColor(suit: Suit, fourColor: boolean): string {
  if (fourColor) return { s: '#14171a', h: '#b3202a', d: '#1f5fa8', c: '#1b7a43' }[suit];
  return suit === 'h' || suit === 'd' ? '#b3202a' : '#14171a';
}

function Suit({ suit, color }: { suit: Suit; color: string }) {
  return (
    <g fill={color}>
      <path d={SUIT_PATH[suit]} />
      {suit === 'c' && CLUB_CIRCLES.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={20} />)}
    </g>
  );
}

// Disposition des symboles des cartes 2 à 10 (colonnes gauche / centre / droite, lignes de haut en bas).
// Les symboles de la moitié basse sont retournés, comme sur un jeu réel.
const PIP_X = { L: 36, C: 50, R: 64 } as const;
const PIPS: Record<number, [keyof typeof PIP_X, number][]> = {
  2: [['C', 46], ['C', 94]],
  3: [['C', 46], ['C', 70], ['C', 94]],
  4: [['L', 46], ['R', 46], ['L', 94], ['R', 94]],
  5: [['L', 46], ['R', 46], ['C', 70], ['L', 94], ['R', 94]],
  6: [['L', 46], ['R', 46], ['L', 70], ['R', 70], ['L', 94], ['R', 94]],
  7: [['L', 46], ['R', 46], ['C', 58], ['L', 70], ['R', 70], ['L', 94], ['R', 94]],
  8: [['L', 46], ['R', 46], ['C', 58], ['L', 70], ['R', 70], ['C', 82], ['L', 94], ['R', 94]],
  9: [['L', 46], ['R', 46], ['L', 62], ['R', 62], ['C', 70], ['L', 78], ['R', 78], ['L', 94], ['R', 94]],
  10: [['L', 46], ['R', 46], ['C', 54], ['L', 62], ['R', 62], ['L', 78], ['R', 78], ['C', 86], ['L', 94], ['R', 94]],
};

function Face({ code, fourColor, id }: { code: string; fourColor: boolean; id: string }) {
  const c = parseCode(code);
  const color = suitColor(c.suit, fourColor);
  const court = c.rank >= 11 && c.rank <= 13; // J Q K : lettre ornementale dans un cadre
  const ace = c.rank === 14 || c.label === 'A';
  const pips = PIPS[c.rank];
  const pip = (x: number, y: number, k: string, size = 0.18) => (
    <g key={k} transform={`translate(${x} ${y}) ${y > 70 ? 'rotate(180)' : ''} scale(${size}) translate(-50 -50)`}>
      <Suit suit={c.suit} color={color} />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f1e9d6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={`url(#${id}-paper)`} stroke="#cfc6b1" strokeWidth="1.2" />
      <rect x="4" y="4" width="92" height="132" rx="6.5" fill="none" stroke={color} strokeOpacity=".14" strokeWidth=".8" />
      {[false, true].map((flipped) => (
        <g key={String(flipped)} transform={flipped ? 'rotate(180 50 70)' : undefined}>
          <text x="10" y="25" fontSize={c.label === '10' ? 20 : 24} fontWeight="700" fill={color} fontFamily="Georgia, 'Times New Roman', serif" textAnchor="start" letterSpacing={c.label === '10' ? '-1' : '0'}>
            {c.label}
          </text>
          <g transform="translate(7 30) scale(.19)">
            <Suit suit={c.suit} color={color} />
          </g>
        </g>
      ))}
      {court ? (
        <>
          <rect x="25" y="34" width="50" height="72" rx="4" fill={color} fillOpacity=".06" stroke={color} strokeOpacity=".55" strokeWidth="1" />
          <rect x="28" y="37" width="44" height="66" rx="2.5" fill="none" stroke="#c9a25a" strokeOpacity=".7" strokeWidth=".8" />
          <g transform="translate(50 49) scale(.17) translate(-50 -50)"><Suit suit={c.suit} color={color} /></g>
          <text x="50" y="84" fontSize="40" fontWeight="700" fill={color} fontFamily="Georgia, 'Times New Roman', serif" textAnchor="middle">
            {c.label}
          </text>
          <g transform="translate(50 91) rotate(180) scale(.17) translate(-50 -50)"><Suit suit={c.suit} color={color} /></g>
        </>
      ) : ace ? (
        <g transform="translate(50 70) scale(.58) translate(-50 -50)">
          <Suit suit={c.suit} color={color} />
        </g>
      ) : pips ? (
        pips.map(([col, y], i) => pip(PIP_X[col], y, String(i)))
      ) : (
        <g transform="translate(24 44) scale(.52)">
          <Suit suit={c.suit} color={color} />
        </g>
      )}
    </>
  );
}

/** Les 3 motifs de dos proposés dans les Paramètres. Chacun reste sobre (deux teintes + or), pour rester
 * lisible en très petite taille (sièges, mains d'adversaires). */
function BackPattern({ id, back }: { id: string; back: CardBackId }) {
  if (back === 'rayures') {
    return (
      <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill="#5c1a24" />
        <rect width="4.5" height="9" fill="#7a2230" />
      </pattern>
    );
  }
  if (back === 'etoile') {
    return (
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" style={{ fill: 'rgb(var(--ink-800))' }} />
        <path d="M8 3 L9.4 6.6 L13 8 L9.4 9.4 L8 13 L6.6 9.4 L3 8 L6.6 6.6 Z" fill="#c9a25a" opacity=".85" />
      </pattern>
    );
  }
  return (
    <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="12" height="12" fill="#13543f" />
      <path d="M0 6 H12 M6 0 V12" stroke="#0a3325" strokeWidth="1.4" />
      <circle cx="6" cy="6" r="1.3" fill="#c9a25a" opacity=".65" />
    </pattern>
  );
}

const BACK_BORDER: Record<CardBackId, string> = { losange: '#0a3325', rayures: '#3a0f17', etoile: '#0c2050' };

function Back({ id, back = 'losange' }: { id: string; back?: CardBackId }) {
  return (
    <>
      <defs>
        <BackPattern id={id} back={back} />
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={BACK_BORDER[back]} stroke="#c9a25a" strokeWidth="1.6" />
      <rect x="8" y="8" width="84" height="124" rx="5" fill={`url(#${id})`} stroke="#c9a25a" strokeWidth=".8" opacity=".95" />
      <rect x="13" y="13" width="74" height="114" rx="3" fill="none" stroke="#c9a25a" strokeOpacity=".55" strokeWidth=".6" />
      <g transform="translate(50 70)">
        <ellipse rx="17" ry="22" fill={BACK_BORDER[back]} stroke="#c9a25a" strokeWidth="1.2" />
        <ellipse rx="13" ry="18" fill="none" stroke="#c9a25a" strokeOpacity=".6" strokeWidth=".6" />
        <path d="M3 -13 L-7 2 H-1 L-3 13 L7 -2 H1 Z" fill="#e6c27a" />
      </g>
    </>
  );
}

/** Décalage (s) de l'arrivée d'une carte selon sa position dans la distribution. Aucun décalage pour les
 * cartes qui se retournent (`flip`, un tout autre effet), ni si l'utilisateur préfère moins d'animations, ni
 * sans position fournie. Plafonné à 12 cartes pour qu'une très grande main ne fasse pas trop attendre. */
export function dealDelay(dealIndex: number | undefined, reduce: boolean, flip: boolean): number {
  if (reduce || flip || !dealIndex) return 0;
  return Math.min(dealIndex, 12) * 0.05;
}

interface CardProps {
  /** Code de la carte (« As », « Td »…) ; `null` = dos. */
  code: string | null;
  size?: CardSize;
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  /** Liseré doré (carte mise en avant, ex. prochaine carte à révéler au 6-1). */
  highlight?: boolean;
  /** Assistance : la carte fait partie de la combinaison du joueur (halo lumineux, par-dessus la sélection). */
  assist?: boolean;
  fourColor?: boolean;
  /** Motif du dos (carte face cachée uniquement). Par défaut « losange ». */
  back?: CardBackId;
  /** Animation de retournement à l'apparition (révélations). */
  flip?: boolean;
  /** Position dans la distribution (0, 1, 2…) : décale l'arrivée de quelques dizaines de ms par carte, pour
   * qu'une main ou un plateau semble réellement distribué plutôt qu'apparaître d'un bloc. Sans effet sur les
   * cartes qui se retournent (`flip`) ni en dehors du tout premier affichage de cette carte (jamais rejoué au
   * fil des re-rendus : la sélection d'une carte, par exemple, ne redéclenche rien). */
  dealIndex?: number;
  onClick?: () => void;
  /** Complète le nom lu par les lecteurs d'écran. */
  hint?: string;
  className?: string;
}

/** Nom lu par les lecteurs d'écran : « Roi de carreau (K) » pour une figure, « 9 de pique » sinon. */
export function spokenName(code: string): string {
  const c = parseCode(code);
  return c.rank >= 11 && c.rank <= 13 ? `${c.name} (${c.label})` : c.name;
}

/** Une carte : face, ou dos si `code` est nul. Cliquable (sélection) ou purement décorative. */
export function PlayingCard({ code, size = 'md', selected = false, disabled = false, dimmed = false, highlight = false, assist = false, fourColor = false, back = 'losange', flip = false, dealIndex, onClick, hint, className = '' }: CardProps) {
  const { t } = useI18n();
  const uid = useId();
  const reduce = useReducedMotion();
  // Figures : la lettre dessinée (J, Q, K) figure aussi dans le nom, pour la commande vocale (« cliquer K »).
  const label = code ? spokenName(code) : t('card.carte_face_cachee');
  if (assist && !hint) hint = t('card.dans_votre_combinaison');
  const interactive = !!onClick && !disabled;
  const base = selected ? 'shadow-gold' : highlight ? 'ring-2 ring-gold-400' : 'shadow-card';
  const ring = assist ? (selected ? `${base} ring-[3px] ring-gold-200` : 'ring-[3px] ring-gold-200 shadow-[0_0_18px_4px_rgba(240,214,140,0.7)]') : base;
  // Carte cliquable : c'est le bouton qui porte le nom ; le dessin est alors décoratif (sinon le nom serait
  // lu deux fois, et le texte dessiné « K ♦ » ne correspondrait pas au nom « Roi de carreau »).
  const inner = (
    <svg viewBox="0 0 100 140" className="block h-auto w-full" {...(onClick ? { 'aria-hidden': true, focusable: false } : { role: 'img', 'aria-label': hint ? `${label}, ${hint}` : label })}>
      {code ? <Face code={code} fourColor={fourColor} id={`face-${uid}`} /> : <Back id={`back-${uid}`} back={back} />}
    </svg>
  );
  // Carte atténuée : voile sombre opaque plutôt que transparence, pour que les cartes superposées ne se voient pas à travers.
  const veil = dimmed ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[9px] bg-black/45" /> : null;
  const common = {
    initial: reduce ? false : flip ? { rotateY: 90, opacity: 0.4 } : { y: -22, opacity: 0, scale: 0.94, rotate: dealIndex === undefined ? 0 : ((dealIndex % 3) - 1) * 2.5 },
    animate: { ...(flip ? { rotateY: 0 } : {}), rotate: 0, scale: 1, y: selected ? (reduce ? 0 : -14) : 0, opacity: 1 },
    // Ressort plutôt que tracé fixe : la carte se pose avec un très léger rebond, et la sélection répond sans à-coup.
    transition: reduce
      ? { duration: 0 }
      : flip
        ? { duration: 0.34, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay: dealDelay(dealIndex, false, true) }
        : { type: 'spring' as const, stiffness: 330, damping: 26, mass: 0.9, delay: dealDelay(dealIndex, false, false), opacity: { duration: 0.2 } },
    // La perspective 3D n'est utile qu'au retournement : sans elle, une carte ne crée pas de couche graphique 3D
    // (des dizaines de couches saturent la mémoire graphique de certains téléphones et abîment l'image).
    style: flip ? { transformPerspective: 700 } : undefined,
    className: `relative inline-block shrink-0 rounded-[9px] ${WIDTH[size]} ${ring} ${className}`,
  };
  if (onClick) {
    return (
      <motion.button
        type="button"
        layout="position"
        {...common}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={`${common.className} ${interactive ? 'cursor-pointer hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400' : 'cursor-not-allowed'} touch-manipulation`}
      >
        {/* Nom du bouton porté par un texte réservé aux lecteurs d'écran, le dessin étant décoratif : le
            rang dessiné en double (coins, centre) n'entre pas en conflit avec le nom (WCAG 2.5.3). */}
        <span className="sr-only">{hint ? `${label}, ${hint}` : label}</span>
        {inner}
        {veil}
      </motion.button>
    );
  }
  return (
    <motion.span {...common}>
      {inner}
      {veil}
    </motion.span>
  );
}

/** Emplacement de plateau : carte, ou gabarit en pointillés tant qu'elle n'est pas dévoilée. */
export function CardSlot({ code, size = 'md', label, fourColor, flip, dealIndex, assist }: { code: string | null; size?: CardSize; label?: string; fourColor?: boolean; flip?: boolean; dealIndex?: number; assist?: boolean }) {
  const { t } = useI18n();
  if (code) return <PlayingCard code={code} size={size} fourColor={fourColor} flip={flip} dealIndex={dealIndex} assist={assist} />;
  return (
    <span
      className={`relative inline-flex aspect-[5/7] shrink-0 items-center justify-center rounded-[9px] border border-dashed border-ivory-100/25 bg-ink-950/25 text-center text-[11px] leading-tight text-ivory-200/60 ${WIDTH[size]}`}
      aria-label={label ?? t('card.carte_pas_encore')}
      role="img"
    >
      {label ?? ''}
    </span>
  );
}
