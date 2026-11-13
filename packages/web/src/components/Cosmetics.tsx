import type { CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { Avatar } from './ui';

/** Libellés des récompenses (clés de traduction). */
export const REWARD_NAME = {
  'title.novice': 'rw.title.novice',
  'title.regular': 'rw.title.regular',
  'title.strategist': 'rw.title.strategist',
  'title.tactician': 'rw.title.tactician',
  'title.shark': 'rw.title.shark',
  'title.grandmaster': 'rw.title.grandmaster',
  'title.legend': 'rw.title.legend',
  'title.faithful': 'rw.title.faithful',
  'title.veteran': 'rw.title.veteran',
  'frame.bronze': 'rw.frame.bronze',
  'frame.silver': 'rw.frame.silver',
  'frame.gold': 'rw.frame.gold',
  'frame.platinum': 'rw.frame.platinum',
  'frame.diamond': 'rw.frame.diamond',
  'frame.aurora': 'rw.frame.aurora',
  'frame.ember': 'rw.frame.ember',
  'frame.jade': 'rw.frame.jade',
  'emblem.spade': 'rw.emblem.spade',
  'emblem.heart': 'rw.emblem.heart',
  'emblem.diamond': 'rw.emblem.diamond',
  'emblem.club': 'rw.emblem.club',
  'emblem.crown': 'rw.emblem.crown',
  'emblem.compass': 'rw.emblem.compass',
  'emblem.chips': 'rw.emblem.chips',
} as const;
export type RewardId = keyof typeof REWARD_NAME;
export const rewardKey = (id: string): (typeof REWARD_NAME)[RewardId] | null => (id in REWARD_NAME ? REWARD_NAME[id as RewardId] : null);

const FRAME: Record<string, { bg: string; glow: string }> = {
  'frame.bronze': { bg: 'linear-gradient(135deg,#f0c4a0,#8a4f2c)', glow: '#d9946a' },
  'frame.silver': { bg: 'linear-gradient(135deg,#ffffff,#8d96a3)', glow: '#c8cfd9' },
  'frame.gold': { bg: 'linear-gradient(135deg,#fff3c9,#b08a3c)', glow: '#e6cf9c' },
  'frame.platinum': { bg: 'linear-gradient(135deg,#e6ffff,#4f9fa6)', glow: '#8fe3e6' },
  'frame.diamond': { bg: 'conic-gradient(#e3efff,#3f6fd1,#a9ccff,#3f6fd1,#e3efff)', glow: '#7fb3ff' },
  'frame.aurora': { bg: 'conic-gradient(#5bc79f,#7a45c9,#3f6fd1,#5bc79f)', glow: '#9a7be0' },
  'frame.ember': { bg: 'conic-gradient(#ffb070,#d9363e,#ffe3c9,#d9363e,#ffb070)', glow: '#ff7a59' },
  'frame.jade': { bg: 'linear-gradient(135deg,#8fd9bc,#0c2b22)', glow: '#5bc79f' },
};

/** Avatar entouré du cadre équipé (anneau dégradé et halo) ; sans cadre, l'avatar est affiché tel quel. */
export function FramedAvatar({ nickname, avatar, size = 40, frame }: { nickname: string; avatar?: string | null; size?: number; frame?: string | null }) {
  const f = frame ? FRAME[frame] : undefined;
  if (!f) return <Avatar nickname={nickname} avatar={avatar} size={size} />;
  const pad = Math.max(2, Math.round(size / 12));
  const style: CSSProperties = { padding: pad, background: f.bg, boxShadow: `0 0 ${Math.round(size / 3)}px ${f.glow}66` };
  return (
    <span data-testid="avatar-frame" data-frame={frame} className="inline-flex shrink-0 rounded-full" style={style}>
      <span className="inline-flex rounded-full bg-ink-950 p-[1px]">
        <Avatar nickname={nickname} avatar={avatar} size={size} />
      </span>
    </span>
  );
}

const EMBLEM: Record<string, { glyph: string; a: string; b: string; fg: string }> = {
  'emblem.spade': { glyph: '♠', a: '#e4e8ee', b: '#59616e', fg: '#10141b' },
  'emblem.heart': { glyph: '♥', a: '#f3939a', b: '#8f1a22', fg: '#fff5f5' },
  'emblem.diamond': { glyph: '♦', a: '#f6d493', b: '#b8741f', fg: '#2e1d08' },
  'emblem.club': { glyph: '♣', a: '#8fd9bc', b: '#1a6b51', fg: '#06261c' },
  'emblem.crown': { glyph: '♛', a: '#fff3c9', b: '#b08a3c', fg: '#3a2a08' },
  'emblem.compass': { glyph: '✦', a: '#a9ccff', b: '#3f6fd1', fg: '#0c1b3a' },
  'emblem.chips': { glyph: '●', a: '#d2b0ff', b: '#7a45c9', fg: '#1f0f3a' },
};

/** Médaillon d'emblème. */
export function EmblemBadge({ id, size = 28 }: { id: string; size?: number }) {
  const { t } = useI18n();
  const e = EMBLEM[id];
  const key = rewardKey(id);
  if (!e) return null;
  return (
    <span
      role="img"
      aria-label={key ? t(key) : id}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display leading-none shadow-md ring-1 ring-white/40"
      style={{ width: size, height: size, fontSize: size * 0.58, background: `linear-gradient(145deg, ${e.a}, ${e.b})`, color: e.fg }}
    >
      <span aria-hidden="true">{e.glyph}</span>
    </span>
  );
}

/** Titre équipé, affiché à côté du pseudo. */
export function TitleTag({ id }: { id: string | null | undefined }) {
  const { t } = useI18n();
  const key = id ? rewardKey(id) : null;
  return key ? <span className="text-xs font-normal italic text-gold-300/90">{t(key)}</span> : null;
}
