import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clockText, initials } from '../lib/format';
import type { Tone } from '../lib/events';
import { useI18n } from '../i18n';
import { DEFAULT_SPEC, encodeAvatar, parseAvatar } from '../lib/avatarSpec';
import { avatarImageUrl, isImageAvatar } from '../lib/avatarImage';
import { AvatarEditor } from './AvatarEditor';
import { AvatarFace } from './AvatarFace';

// ---------- Boutons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 shadow-[0_6px_18px_rgba(201,162,90,.25)] hover:from-gold-300 hover:to-gold-500 disabled:from-ink-600 disabled:to-ink-600 disabled:text-ivory-300/50 disabled:shadow-none',
  secondary: 'border border-gold-500/60 text-gold-300 hover:bg-gold-500/10 disabled:border-ink-500 disabled:text-ivory-300/40',
  ghost: 'text-ivory-200 hover:bg-ivory-100/10 disabled:text-ivory-300/40',
  danger: 'border border-ruby-500/70 text-ruby-300 hover:bg-ruby-500/15 disabled:opacity-50',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-[44px] select-none items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

// ---------- Surfaces ----------
export function Panel({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={`rounded-[28px] border border-ivory-100/10 bg-ink-800/95 shadow-panel ${className}`}>
      {children}
    </Tag>
  );
}

export function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-2xl tracking-wide text-ivory-50 ${className}`}>{children}</h2>;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-400 ${className}`}>{children}</p>;
}

// ---------- Formulaires ----------
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ivory-100">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ivory-300/70">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-ruby-300">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'w-full min-h-[44px] rounded-2xl border border-ivory-100/15 bg-ink-900 px-3.5 py-2.5 text-ivory-50 placeholder:text-ivory-300/40 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30';

/** Choix parmi quelques valeurs (2 à 6 joueurs, 1 à 5 points…). */
export function Segmented<T extends string | number>({ value, options, onChange, label, format }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string; format?: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`min-h-[44px] flex-1 rounded-xl border px-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${o === value ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-ivory-100/15 text-ivory-200 hover:border-ivory-100/35'}`}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

// ---------- Avatars ----------
export const AVATARS: Record<string, [string, string]> = {
  or: ['#e6cf9c', '#a9843f'],
  emeraude: ['#3fae86', '#0e4130'],
  saphir: ['#6f9be0', '#1d3f7a'],
  rubis: ['#e0707a', '#7c1520'],
  ambre: ['#f0b25c', '#9a5a12'],
  ardoise: ['#9aa7b4', '#3a4652'],
  perle: ['#f2ece0', '#b8ad96'],
  onyx: ['#5b636d', '#15181c'],
};
export const AVATAR_IDS = Object.keys(AVATARS);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Photo de profil ; si elle ne se charge pas (serveur injoignable, photo supprimée), on retombe sur un préréglage. */
function AvatarPhoto({ nickname, id, size, dim }: { nickname: string; id: string; size: number; dim: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Avatar nickname={nickname} avatar={null} size={size} dim={dim} />;
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-gold-500/50 ${dim ? 'opacity-50 grayscale' : ''}`} style={{ width: size, height: size }}>
      <img src={avatarImageUrl(id)} alt="" width={size} height={size} decoding="async" draggable={false} onError={() => setFailed(true)} style={{ width: size, height: size, objectFit: 'cover' }} />
    </span>
  );
}

export function Avatar({ nickname, avatar, size = 40, dim = false }: { nickname: string; avatar?: string | null; size?: number; dim?: boolean }) {
  if (isImageAvatar(avatar)) return <AvatarPhoto key={avatar} nickname={nickname} id={avatar} size={size} dim={dim} />;
  const custom = parseAvatar(avatar);
  if (custom) {
    return (
      <span aria-hidden="true" className={`inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-gold-500/50 ${dim ? 'opacity-50 grayscale' : ''}`} style={{ width: size, height: size }}>
        <AvatarFace spec={custom} size={size} />
      </span>
    );
  }
  const key = avatar && AVATARS[avatar] ? avatar : AVATAR_IDS[hash(nickname) % AVATAR_IDS.length]!;
  const [a, b] = AVATARS[key]!;
  const dark = key === 'onyx' || key === 'saphir' || key === 'rubis' || key === 'emeraude' || key === 'ardoise';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-2 ring-gold-500/50 ${dim ? 'opacity-50 grayscale' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${a}, ${b})`, color: dark ? '#fbf8f1' : '#1a1a1a' }}
    >
      {initials(nickname)}
    </span>
  );
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const custom = parseAvatar(value) !== null;
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('ui.avatar')} className="flex flex-wrap gap-2">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={t('ui.avatar2', { id })}
            onClick={() => onChange(id)}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${value === id ? 'ring-2 ring-gold-400' : 'opacity-70 hover:opacity-100'}`}
          >
            <Avatar nickname="?" avatar={id} size={38} />
          </button>
        ))}
        {custom && (
          <button
            type="button"
            role="radio"
            aria-checked
            aria-label={t('av.mine')}
            onClick={() => setEditing(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 ring-2 ring-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            <Avatar nickname="?" avatar={value} size={38} />
          </button>
        )}
      </div>
      {!editing && (
        <button
          type="button"
          onClick={() => {
            if (!custom) onChange(encodeAvatar(DEFAULT_SPEC));
            setEditing(true);
          }}
          className="min-h-[44px] rounded-xl border border-gold-500/60 px-4 text-sm font-semibold text-gold-300 transition hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
        >
          {custom ? t('av.edit') : t('av.create')}
        </button>
      )}
      {editing && <AvatarEditor value={custom ? value : encodeAvatar(DEFAULT_SPEC)} onChange={onChange} onClose={() => setEditing(false)} />}
    </div>
  );
}

// ---------- Indicateurs ----------
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'amber' }) {
  const t = {
    neutral: 'bg-ivory-100/10 text-ivory-200',
    gold: 'bg-gold-500/20 text-gold-300',
    green: 'bg-jade-500/15 text-jade-300',
    red: 'bg-ruby-500/25 text-ruby-200',
    amber: 'bg-amber-500/20 text-amber-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

/** Points d'un joueur : n pastilles sur l'objectif. */
export function ScorePips({ score, target, small = false }: { score: number; target: number; small?: boolean }) {
  const { t, tp } = useI18n();
  return (
    <span className={`inline-flex items-center ${small ? 'gap-0.5' : 'gap-1'}`} role="img" aria-label={tp('ui.point_sur', score, { target })}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`${small ? 'h-2 w-2' : 'h-2.5 w-2.5'} rounded-full border ${i < score ? 'border-gold-400 bg-gold-400' : 'border-ivory-100/30'}`} />
      ))}
    </span>
  );
}

/** Compte à rebours circulaire : or, ambre à 10 s, rouge à 5 s. */
export function CountdownRing({ secondsLeft, total = 30, size = 56, label }: { secondsLeft: number; total?: number; size?: number; label?: string }) {
  const { t, tp } = useI18n();
  const r = 22;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, secondsLeft / total));
  const color = secondsLeft <= 5 ? '#ef6a73' /* ruby-300 */ : secondsLeft <= 10 ? '#f0b25c' /* amber-400 */ : '#c9a25a' /* gold-500 */;
  return (
    <div className={`relative inline-flex items-center justify-center ${secondsLeft <= 5 ? 'animate-pulseRing' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={tp('ui.secondes', Math.ceil(secondsLeft), { label: label ?? t('ui.temps_restant') })}>
      <svg viewBox="0 0 52 52" width={size} height={size} className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(244,239,228,.12)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} style={{ transition: 'stroke-dashoffset .25s linear, stroke .25s' }} />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-ivory-50" aria-hidden="true">
        {clockText(secondsLeft)}
      </span>
    </div>
  );
}

// ---------- Fenêtres et notifications ----------
export function Modal({ title, onClose, children, wide = false, compact = false }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm sm:items-center sm:p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 28, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`w-full overflow-y-auto border border-gold-500/30 bg-ink-800 shadow-panel outline-none ${compact ? 'max-h-[98dvh] rounded-3xl p-4 sm:p-5' : 'max-h-[92vh] rounded-[28px] p-5 sm:p-7'} ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

const TOAST_TONE: Record<Tone, string> = {
  info: 'border-ivory-100/20 bg-ink-700 text-ivory-50',
  success: 'border-jade-400/40 bg-jade-950 text-jade-100',
  warning: 'border-amber-400/50 bg-amber-950 text-amber-100',
  error: 'border-ruby-500/60 bg-ruby-950 text-ruby-100',
};

export function ToastHost({ toasts, onDismiss }: { toasts: { id: number; tone: Tone; text: string }[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite" role="status">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ id, tone, text, onDismiss }: { id: number; tone: Tone; text: string; onDismiss: (id: number) => void }) {
  const { t, tp } = useI18n();
  useEffect(() => {
    const t = setTimeout(() => onDismiss(id), tone === 'error' || tone === 'warning' ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [id, tone, onDismiss]);
  return (
    <motion.div layout initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-panel ${TOAST_TONE[tone]}`}>
      <span className="flex-1">{text}</span>
      <button type="button" onClick={() => onDismiss(id)} aria-label={t('ui.fermer_la_notification')} className="-mr-1 rounded px-1 text-lg leading-none opacity-70 hover:opacity-100">
        ×
      </button>
    </motion.div>
  );
}
