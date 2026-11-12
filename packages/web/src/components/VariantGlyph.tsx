import type { VariantId } from '../lib/types';

/**
 * Emblème d'un jeu : une carte ivoire inclinée, un monogramme et une enseigne propres à chaque variante.
 * Formes pleines uniquement (ni filtre, ni dégradé, ni animation) : une vingtaine d'exemplaires restent légers.
 */
const GLYPHS: Record<VariantId, { mark: string; suit: '♠' | '♥' | '♦' | '♣' }> = {
  V6_3: { mark: '6·3', suit: '♠' },
  V6_1: { mark: '6·1', suit: '♥' },
  CLOSED_1: { mark: 'F1', suit: '♦' },
  CLOSED_2: { mark: 'F2', suit: '♣' },
  AVIATION: { mark: 'AV', suit: '♠' },
  AVIA_6: { mark: 'A6', suit: '♥' },
  MORPION: { mark: '3×3', suit: '♦' },
  LE10: { mark: '10', suit: '♣' },
};

export function VariantGlyph({ id, size = 44 }: { id: VariantId; size?: number }) {
  const g = GLYPHS[id];
  if (!g) return null;
  const red = g.suit === '♥' || g.suit === '♦';
  const ink = red ? '#b3202a' : '#1a1512';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="shrink-0">
      <rect x="9" y="7" width="30" height="36" rx="4.5" fill="#0a3325" transform="rotate(8 24 25)" />
      <rect x="9" y="5" width="30" height="36" rx="4.5" fill="#f4efe4" stroke="#c9a25a" strokeWidth="1.4" transform="rotate(-5 24 23)" />
      <g transform="rotate(-5 24 23)">
        <text x="14" y="16" fontSize="9" fill={ink} fontFamily="Georgia, serif">{g.suit}</text>
        <text x="24" y="31" textAnchor="middle" fontSize={g.mark.length > 2 ? 13 : 16} fontWeight="700" fill="#1a1512" fontFamily="Georgia, 'Iowan Old Style', serif">{g.mark}</text>
      </g>
    </svg>
  );
}
