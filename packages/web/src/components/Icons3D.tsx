import { useId, type ReactNode } from 'react';

/**
 * Icônes « 3D » originales, dessinées en SVG : volumes en dégradé, reflet spéculaire et ombre portée.
 * Purement décoratives (aria-hidden) : le texte voisin porte toujours le sens.
 */
type IconProps = { size?: number; className?: string };

function Frame({ size = 64, className = '', children, defs }: IconProps & { children: ReactNode; defs: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] ${className}`} aria-hidden="true" focusable="false">
      <defs>{defs}</defs>
      <ellipse cx="32" cy="59" rx="18" ry="3.2" fill="rgba(0,0,0,0.35)" />
      {children}
    </svg>
  );
}

/** Dégradés partagés : or, ivoire, émeraude, saphir, rubis — teintes de la charte du jeu. */
function Gradients({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff1c4" />
        <stop offset="0.35" stopColor="#e7c26f" />
        <stop offset="0.75" stopColor="#b8862f" />
        <stop offset="1" stopColor="#7a5418" />
      </linearGradient>
      <linearGradient id={`${id}-ivory`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d9cfbb" />
      </linearGradient>
      <linearGradient id={`${id}-jade`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9be8c8" />
        <stop offset="0.5" stopColor="#2f9e75" />
        <stop offset="1" stopColor="#0f5a40" />
      </linearGradient>
      <linearGradient id={`${id}-sapphire`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9cc4ff" />
        <stop offset="0.5" stopColor="#3466c9" />
        <stop offset="1" stopColor="#173275" />
      </linearGradient>
      <linearGradient id={`${id}-ruby`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffb3b9" />
        <stop offset="0.5" stopColor="#d9404f" />
        <stop offset="1" stopColor="#7d1522" />
      </linearGradient>
      <radialGradient id={`${id}-shine`} cx="0.3" cy="0.25" r="0.6">
        <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
        <stop offset="1" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
    </>
  );
}

/** Trophée : vainqueur de la partie. */
export function TrophyIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M17 12 C8 12 7 27 19 30" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="4" strokeLinecap="round" />
      <path d="M47 12 C56 12 57 27 45 30" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="4" strokeLinecap="round" />
      <path d="M16 8 H48 V20 C48 32 41 38 32 38 C23 38 16 32 16 20 Z" fill={`url(#${id}-gold)`} />
      <path d="M20 11 H30 V22 C30 29 27 33 23 34 C21 31 20 27 20 22 Z" fill={`url(#${id}-shine)`} opacity="0.8" />
      <rect x="28.5" y="37" width="7" height="8" fill={`url(#${id}-gold)`} />
      <path d="M21 45 H43 L46 54 H18 Z" fill={`url(#${id}-gold)`} />
      <rect x="18" y="52" width="28" height="4" rx="1.5" fill="#6d4a14" />
      <path d="M32 15 l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="#fff6d6" opacity="0.95" />
    </Frame>
  );
}

/** Cartes en éventail : créer une partie. */
export function CardsIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <g transform="rotate(-16 32 40)">
        <rect x="14" y="12" width="24" height="34" rx="4" fill={`url(#${id}-sapphire)`} stroke="#0d1d47" strokeWidth="1" />
        <rect x="17" y="15" width="18" height="28" rx="2.5" fill="none" stroke="rgba(255,255,255,0.35)" />
      </g>
      <g transform="rotate(10 32 40)">
        <rect x="24" y="10" width="24" height="34" rx="4" fill={`url(#${id}-ivory)`} stroke="#b9ad94" strokeWidth="1" />
        <path d="M36 19 C31 24 28 27 31 31 C33 33 35 32 36 30 C37 32 39 33 41 31 C44 27 41 24 36 19 Z" fill={`url(#${id}-ruby)`} />
        <text x="28" y="18" fontSize="7" fontWeight="700" fill="#b3263a" fontFamily="Georgia, serif">A</text>
      </g>
      <circle cx="47" cy="47" r="9" fill={`url(#${id}-jade)`} stroke="#0b3d2b" />
      <path d="M47 42.5 V51.5 M42.5 47 H51.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="44.5" cy="44" rx="3.5" ry="2" fill={`url(#${id}-shine)`} />
    </Frame>
  );
}

/** Ticket d'entrée : rejoindre une partie avec un code. */
export function JoinIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M8 20 H56 V27 A5 5 0 0 0 56 37 V44 H8 V37 A5 5 0 0 0 8 27 Z" fill={`url(#${id}-gold)`} />
      <path d="M10 22 H40 V26 H10 Z" fill={`url(#${id}-shine)`} opacity="0.7" />
      <line x1="42" y1="21" x2="42" y2="43" stroke="#7a5418" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      <path d="M19 32 H33 M28 27 L33 32 L28 37" fill="none" stroke="#5a3c0e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

/** Jetons empilés : parties ouvertes, bankroll. */
export function ChipsIcon(props: IconProps) {
  const id = useId();
  const chip = (y: number, fill: string) => (
    <g key={y}>
      <ellipse cx="32" cy={y + 4} rx="17" ry="6" fill="#0a0f1e" opacity="0.5" />
      <ellipse cx="32" cy={y} rx="17" ry="6" fill={fill} />
      <ellipse cx="32" cy={y} rx="11" ry="3.6" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" strokeDasharray="3 2.4" />
    </g>
  );
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      {chip(46, `url(#${id}-ruby)`)}
      {chip(38, `url(#${id}-jade)`)}
      {chip(30, `url(#${id}-sapphire)`)}
      {chip(22, `url(#${id}-gold)`)}
      <ellipse cx="26" cy="20" rx="6" ry="2" fill={`url(#${id}-shine)`} />
    </Frame>
  );
}

/** Livre ouvert : règles. */
export function RulesIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M32 16 C24 11 15 11 8 14 V50 C15 47 24 47 32 52 Z" fill={`url(#${id}-ivory)`} stroke="#b9ad94" />
      <path d="M32 16 C40 11 49 11 56 14 V50 C49 47 40 47 32 52 Z" fill={`url(#${id}-ivory)`} stroke="#b9ad94" />
      <path d="M32 16 V52" stroke="#9c8f74" strokeWidth="1.5" />
      <path d="M13 22 H27 M13 28 H27 M13 34 H24 M37 22 H51 M37 28 H51 M37 34 H48" stroke="#8d8270" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M44 38 L48 38 L48 52 L46 50 L44 52 Z" fill={`url(#${id}-ruby)`} />
    </Frame>
  );
}

/** Buste : profil, connexion. */
export function ProfileIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <circle cx="32" cy="32" r="24" fill={`url(#${id}-sapphire)`} />
      <circle cx="32" cy="26" r="9" fill={`url(#${id}-ivory)`} />
      <path d="M16 48 C18 39 25 36 32 36 C39 36 46 39 48 48 C44 52 38 54 32 54 C26 54 20 52 16 48 Z" fill={`url(#${id}-ivory)`} />
      <ellipse cx="24" cy="18" rx="9" ry="5" fill={`url(#${id}-shine)`} opacity="0.7" />
    </Frame>
  );
}

/** Cadenas : salle privée. */
export function LockIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M22 28 V20 C22 14 26.5 10 32 10 C37.5 10 42 14 42 20 V28" fill="none" stroke="#9aa3b5" strokeWidth="5" strokeLinecap="round" />
      <rect x="14" y="27" width="36" height="27" rx="6" fill={`url(#${id}-gold)`} />
      <circle cx="32" cy="38" r="4" fill="#5a3c0e" />
      <rect x="30.5" y="40" width="3" height="7" rx="1.5" fill="#5a3c0e" />
      <ellipse cx="22" cy="31" rx="6" ry="2.5" fill={`url(#${id}-shine)`} />
    </Frame>
  );
}

/** Étoile : favoris. */
export function StarIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M32 6 l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8 16.8 52.8l2.9-16.9-12.3-12 17-2.5z" fill={`url(#${id}-gold)`} stroke="#7a5418" strokeWidth="1" strokeLinejoin="round" />
      <path d="M32 12 l5 10.2 -10 1.5z" fill={`url(#${id}-shine)`} />
    </Frame>
  );
}

/** Graphique en barres : statistiques. */
export function StatsIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <rect x="10" y="34" width="11" height="20" rx="2" fill={`url(#${id}-ruby)`} />
      <rect x="26.5" y="22" width="11" height="32" rx="2" fill={`url(#${id}-gold)`} />
      <rect x="43" y="12" width="11" height="42" rx="2" fill={`url(#${id}-jade)`} />
      <rect x="44.5" y="14" width="3" height="20" rx="1.5" fill="rgba(255,255,255,0.45)" />
      <rect x="28" y="24" width="3" height="14" rx="1.5" fill="rgba(255,255,255,0.45)" />
    </Frame>
  );
}

/** Cloche : notifications. */
export function BellIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <path d="M32 9 C22 9 17 17 17 27 V37 L12 45 H52 L47 37 V27 C47 17 42 9 32 9 Z" fill={`url(#${id}-gold)`} />
      <circle cx="32" cy="49" r="5" fill="#7a5418" />
      <ellipse cx="25" cy="20" rx="4" ry="7" fill={`url(#${id}-shine)`} />
      <circle cx="47" cy="14" r="6" fill={`url(#${id}-ruby)`} stroke="#fff" strokeWidth="1.5" />
    </Frame>
  );
}

/** Jeton seul, vu de face : solde et boutique de jetons. */
export function CoinIcon(props: IconProps) {
  const id = useId();
  return (
    <Frame {...props} defs={<Gradients id={id} />}>
      <circle cx="32" cy="32" r="22" fill="#5a3d10" />
      <circle cx="32" cy="30" r="22" fill={`url(#${id}-gold)`} />
      <circle cx="32" cy="30" r="15" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="32" cy="30" r="9" fill={`url(#${id}-sapphire)`} />
      <path d="M32 24l2 4 4 .6-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.6z" fill="#fff1c4" />
      <circle cx="32" cy="30" r="22" fill={`url(#${id}-shine)`} opacity="0.5" />
    </Frame>
  );
}
