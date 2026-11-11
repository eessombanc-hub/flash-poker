import { BACKGROUND_COLORS, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, shade, type AvatarSpec } from '../lib/avatarSpec';

const INK = '#1a1512';

/** Cheveux derrière la tête (coiffures longues, chignon, queue de cheval). */
function HairBack({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 2:
      return <path d="M14 31 C13 10 51 10 50 31 L53 53 L11 53 Z" fill={color} />;
    case 3:
      return <circle cx="32" cy="26" r="20" fill={color} />;
    case 4:
      return <circle cx="32" cy="9" r="6.5" fill={color} />;
    case 7:
      return <path d="M44 20 C58 20 58 40 50 50 C52 40 50 30 44 28 Z" fill={color} />;
    default:
      return null;
  }
}

/** Cheveux sur le front. */
function HairFront({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 1:
    case 4:
    case 7:
      return <path d="M18.5 29 C17 12 47 12 45.5 29 C43 22 38 20 32 20 C26 20 21 22 18.5 29 Z" fill={color} />;
    case 2:
      return <path d="M18.5 30 C17 12 47 12 45.5 30 C42 22 34 19 27 23 C23 25 20 27 18.5 30 Z" fill={color} />;
    case 3:
      return <path d="M18 27 C20 13 44 13 46 27 C42 21 22 21 18 27 Z" fill={color} />;
    case 5:
      return <path d="M28.5 5 H35.5 L36.5 22 H27.5 Z" fill={color} />;
    case 6:
      return <path d="M18.5 29 C16 11 48 10 45.5 27 C42 20 33 17 24 22 C21 24 19.5 26 18.5 29 Z" fill={color} />;
    default:
      return null;
  }
}

function Eyes({ style }: { style: number }) {
  const stroke = { stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, fill: 'none' };
  switch (style) {
    case 1:
      return (
        <g {...stroke}>
          <path d="M23.5 31 Q26 27.5 28.5 31" />
          <path d="M35.5 31 Q38 27.5 40.5 31" />
        </g>
      );
    case 2:
      return (
        <g {...stroke}>
          <path d="M23.5 30 H28.5" />
          <path d="M35.5 30 H40.5" />
        </g>
      );
    case 3:
      return (
        <g>
          <circle cx="26" cy="30" r="3.4" fill="#fff" />
          <circle cx="38" cy="30" r="3.4" fill="#fff" />
          <circle cx="26" cy="30" r="1.6" fill={INK} />
          <circle cx="38" cy="30" r="1.6" fill={INK} />
        </g>
      );
    case 4:
      return (
        <g>
          <circle cx="26" cy="30" r="1.9" fill={INK} />
          <path d="M35.5 30.5 Q38 27.5 40.5 30.5" {...stroke} />
        </g>
      );
    case 5:
      return (
        <g>
          <circle cx="26" cy="30.5" r="1.9" fill={INK} />
          <circle cx="38" cy="30.5" r="1.9" fill={INK} />
          <path d="M22.5 26 L29 25" {...stroke} strokeWidth={1.4} />
          <path d="M35 25 L41.5 26" {...stroke} strokeWidth={1.4} />
        </g>
      );
    default:
      return (
        <g fill={INK}>
          <circle cx="26" cy="30" r="1.9" />
          <circle cx="38" cy="30" r="1.9" />
        </g>
      );
  }
}

function Mouth({ style }: { style: number }) {
  const stroke = { stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, fill: 'none' };
  switch (style) {
    case 1:
      return <path d="M26 38.5 Q32 48 38 38.5 Z" fill="#7a1f2b" stroke={INK} strokeWidth={1} strokeLinejoin="round" />;
    case 2:
      return <path d="M28 41 H36" {...stroke} />;
    case 3:
      return <path d="M28 43 Q32 39 36 43" {...stroke} />;
    case 4:
      return <ellipse cx="32" cy="41.5" rx="2.2" ry="2.8" fill="#7a1f2b" />;
    case 5:
      return <path d="M28 41.5 Q33 43 37 38.5" {...stroke} />;
    default:
      return <path d="M27 39.5 Q32 44.5 37 39.5" {...stroke} />;
  }
}

/** Accessoires portés sur le visage (barbe, moustache), dessinés sous la bouche et les yeux. */
function FaceHair({ accessory, color }: { accessory: number; color: string }) {
  if (accessory === 6) return <path d="M18.5 33 Q19 53 32 54 Q45 53 45.5 33 Q41 45 32 45 Q23 45 18.5 33 Z" fill={color} />;
  if (accessory === 5) return <path d="M24 38 Q28 34.5 32 37.5 Q36 34.5 40 38 Q36 41 32 38.5 Q28 41 24 38 Z" fill={color} />;
  return null;
}

/** Lunettes et couvre-chefs, dessinés en dernier. */
function Gear({ accessory, outfit }: { accessory: number; outfit: string }) {
  switch (accessory) {
    case 1:
      return (
        <g fill="none" stroke={INK} strokeWidth={1.5}>
          <circle cx="26" cy="30" r="5.2" />
          <circle cx="38" cy="30" r="5.2" />
          <path d="M31.2 30 H32.8" />
        </g>
      );
    case 2:
      return (
        <g fill="#14171b" stroke={INK} strokeWidth={1}>
          <rect x="20" y="26.5" width="11.5" height="7.5" rx="3" />
          <rect x="32.5" y="26.5" width="11.5" height="7.5" rx="3" />
          <path d="M31.5 29.5 H32.5" />
        </g>
      );
    case 3:
      return (
        <g>
          <path d="M17.5 22 C19 16 45 16 46.5 22 L46.5 25 H17.5 Z" fill="#2f7d5a" />
          <path d="M17.5 25 H50 Q52 28.5 46 28.5 H17.5 Z" fill="#245f45" />
        </g>
      );
    case 4:
      return (
        <g>
          <ellipse cx="32" cy="21" rx="21" ry="4.2" fill="#2a2420" />
          <path d="M22 21 L23.5 8.5 Q32 5.5 40.5 8.5 L42 21 Z" fill="#3a322c" />
          <path d="M22.4 17.5 H41.6 L42 21 H22 Z" fill="#c9a25a" />
        </g>
      );
    case 7:
      return (
        <g>
          <path d="M17.5 25 C17.5 8 46.5 8 46.5 25 Z" fill="#b4361f" />
          <path d="M17.5 25 H52 Q53 29 45 29 H17.5 Z" fill="#8f2916" />
          <circle cx="32" cy="10.5" r="1.4" fill={outfit} />
        </g>
      );
    default:
      return null;
  }
}

/** Visage SVG léger : formes pleines uniquement, ni filtre, ni dégradé, ni animation. */
export function AvatarFace({ spec, size = 64 }: { spec: AvatarSpec; size?: number }) {
  const skin = SKIN_TONES[spec.skin]!;
  const hair = HAIR_COLORS[spec.hairColor]!;
  const outfit = OUTFIT_COLORS[spec.outfit]!;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <rect width="64" height="64" fill={BACKGROUND_COLORS[spec.background]!} />
      <HairBack style={spec.hair} color={hair} />
      <rect x="27" y="38" width="10" height="12" fill={shade(skin)} />
      <path d="M6 66 C6 52 19 47 32 47 C45 47 58 52 58 66 Z" fill={outfit} />
      <path d="M26 47.5 L32 55 L38 47.5 Z" fill={shade(skin, 0.78)} />
      <circle cx="18.6" cy="32" r="3" fill={skin} />
      <circle cx="45.4" cy="32" r="3" fill={skin} />
      <ellipse cx="32" cy="30" rx="13.5" ry="15.5" fill={skin} />
      <HairFront style={spec.hair} color={hair} />
      <FaceHair accessory={spec.accessory} color={hair} />
      <Mouth style={spec.mouth} />
      <Eyes style={spec.eyes} />
      <Gear accessory={spec.accessory} outfit={outfit} />
    </svg>
  );
}
