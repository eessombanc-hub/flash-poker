import { useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Avatar, Button } from './ui';

/** Tuile du rail de jeux : bandeau de couleur, icône, titre ; toute la tuile est cliquable. */
export function RailTile({ icon, title, onClick, tone, suit }: { icon: ReactNode; title: string; onClick: () => void; tone: 'felt' | 'ruby' | 'gold' | 'ink' | 'sea'; suit: string }) {
  const tones = {
    felt: 'from-felt-700 to-felt-900 border-felt-500/50',
    ruby: 'from-ruby-600/70 to-ink-900 border-ruby-500/50',
    gold: 'from-gold-600/40 to-ink-900 border-gold-400/60',
    ink: 'from-ink-600 to-ink-900 border-ivory-100/20',
    sea: 'from-jade-500/30 to-ink-900 border-jade-400/40',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-h-[3.75rem] w-40 shrink-0 snap-start items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-br px-3 text-left transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 motion-reduce:transform-none lg:w-full ${tones[tone]}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-5 -right-1 select-none font-display text-6xl leading-none text-ivory-100/[0.07]">{suit}</span>
      <span aria-hidden="true" className="relative shrink-0 transition group-hover:scale-105 motion-reduce:transform-none">{icon}</span>
      <span className="relative font-display text-base leading-tight text-ivory-50">{title}</span>
    </button>
  );
}

export interface Slide {
  id: string;
  title: string;
  text: string;
  cta: string;
  onClick: () => void;
  icon: ReactNode;
  suit: string;
  /** Dégradé de fond de la diapositive. */
  bg: string;
}

/** Bandeau à diapositives : défilement automatique (suspendu au survol, au focus et si l'utilisateur limite les animations). */
export function Banner({ slides }: { slides: Slide[] }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const regionId = useId();
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = slides.length;
  const idx = Math.min(i, n - 1);

  useEffect(() => {
    if (paused || reduce || n < 2) return;
    const id = setInterval(() => setI((k) => (k + 1) % n), 7000);
    return () => clearInterval(id);
  }, [paused, reduce, n]);

  const s = slides[idx];
  if (!s) return null;
  const go = (k: number) => setI((k + n) % n);
  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('lob.banner')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`relative overflow-hidden rounded-3xl border border-gold-500/30 bg-gradient-to-br ${s.bg} shadow-gold`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-10 select-none font-display text-[16rem] leading-none text-ivory-100/[0.06]">{s.suit}</span>
      <div id={regionId} aria-live={paused || reduce ? 'polite' : 'off'} className="relative flex min-h-[15rem] flex-col justify-between gap-6 p-6 sm:min-h-[17rem] sm:flex-row sm:items-center sm:px-16 sm:py-9">
        <div key={s.id} className="max-w-lg motion-safe:animate-fadein">
          <h2 className="font-display text-3xl leading-tight tracking-wide text-ivory-50 sm:text-4xl">{s.title}</h2>
          <p className="mt-3 text-sm text-ivory-100/85 sm:text-base">{s.text}</p>
          <Button className="mt-5 px-6 py-3 text-base" onClick={s.onClick}>{s.cta}</Button>
        </div>
        <span aria-hidden="true" className="hidden shrink-0 scale-[2.2] sm:block sm:pr-16">{s.icon}</span>
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label={t('lob.prev')} onClick={() => go(idx - 1)} className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/60 text-ivory-50 hover:bg-ink-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 sm:flex">‹</button>
          <button type="button" aria-label={t('lob.next')} onClick={() => go(idx + 1)} className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/60 text-ivory-50 hover:bg-ink-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 sm:flex">›</button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((d, k) => (
              <button key={d.id} type="button" aria-label={t('lob.dot', { n: k + 1 })} aria-current={k === idx} onClick={() => setI(k)} className={`h-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${k === idx ? 'w-6 bg-gold-400' : 'w-2 bg-ivory-100/40 hover:bg-ivory-100/70'}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Tuile de section (« À la une », « Ma session »). */
export function InfoTile({ title, onClick, icon, tone = 'ink' }: { title: string; onClick: () => void; icon: ReactNode; tone?: 'ink' | 'gold' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold text-ivory-50 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 motion-reduce:transform-none ${tone === 'gold' ? 'border-gold-400/50 bg-gradient-to-br from-gold-500/20 to-ink-900' : 'border-ivory-100/12 bg-ink-800/70'}`}
    >
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      {title}
    </button>
  );
}

/** Panneau joueur : profil si connecté, invitation à ouvrir un compte sinon ; entrée rapide par code de partie. */
export function SidePanel({ me, onProfile, onRegister, onJoin, children }: { me?: { nickname: string; avatar?: string | null } | null; onProfile?: () => void; onRegister?: () => void; onJoin: (code: string) => void; children?: ReactNode }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const field = useId();
  return (
    <aside aria-label={t('lob.side')} className="space-y-3">
      <div className="rounded-2xl border border-ivory-100/12 bg-ink-800/70 p-4">
        {me ? (
          <div className="flex items-center gap-3">
            <Avatar nickname={me.nickname} avatar={me.avatar} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg text-ivory-50">{me.nickname}</p>
              {onProfile && <button type="button" onClick={onProfile} className="text-sm font-semibold text-gold-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('lob.me.open')}</button>}
            </div>
          </div>
        ) : (
          <div>
            <p className="font-display text-lg text-ivory-50">{t('lob.guest.title')}</p>
            <p className="mt-1 text-sm text-ivory-200/80">{t('lob.guest.text')}</p>
            {onRegister && <Button className="mt-3 w-full" onClick={onRegister}>{t('lob.guest.cta')}</Button>}
          </div>
        )}
      </div>
      {children}
      <form
        className="rounded-2xl border border-ivory-100/12 bg-ink-800/70 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(code.trim().toUpperCase());
        }}
      >
        <label htmlFor={field} className="text-sm font-semibold text-ivory-100">{t('lob.code.label')}</label>
        <div className="mt-2 flex gap-2">
          <input id={field} value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD" className="min-w-0 flex-1 rounded-lg border border-ivory-100/20 bg-ink-900 px-3 py-2 font-mono uppercase tracking-widest text-ivory-50 focus:border-gold-400 focus:outline-none" />
          <Button type="submit" variant="secondary" disabled={code.trim().length < 3}>{t('lob.code.go')}</Button>
        </div>
      </form>
    </aside>
  );
}
