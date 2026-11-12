import { useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Button } from './ui';

export interface Showcase {
  id: string;
  /** Nom court du jeu : étiquette de la pastille de navigation. */
  name: string;
  title: string;
  text: string;
  cta: string;
  onClick: () => void;
  cta2?: string;
  onClick2?: () => void;
  art: ReactNode;
  /** Dégradé de fond : chaque jeu a sa propre couleur. */
  bg: string;
  /** Filigrane (couleur de carte) du fond. */
  suit: string;
}

const EVERY_MS = 6500;

/**
 * Bandeau central : le tour des jeux, un par diapositive, chacun avec sa couleur et sa scène.
 * Défilement automatique, suspendu au survol et au focus, arrêté dès que le joueur navigue lui-même ou limite les
 * animations ; un bouton pause / lecture reste toujours disponible.
 */
export function GameShowcase({ slides, label }: { slides: Showcase[]; label: string }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [stopped, setStopped] = useState(false);
  const regionId = useId();
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = slides.length;
  const idx = Math.min(i, n - 1);
  const running = !stopped && !hover && !reduce && n > 1;

  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setI((k) => (k + 1) % n), EVERY_MS);
    return () => clearTimeout(id);
  }, [running, idx, n]);

  const s = slides[idx];
  if (!s) return null;
  const go = (k: number) => {
    setStopped(true); // le joueur prend la main : plus de défilement tant qu'il ne relance pas
    setI((k + n) % n);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative overflow-hidden rounded-3xl border border-gold-500/40 bg-gradient-to-br ${s.bg} shadow-gold transition-[background] duration-500`}
      data-testid="game-showcase"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -left-6 -top-14 select-none font-display text-[19rem] leading-none text-ivory-100/[0.05]">{s.suit}</span>
      <div id={regionId} aria-live={running ? 'off' : 'polite'} className="relative grid min-h-[26rem] items-center gap-4 px-5 pb-20 pt-10 sm:min-h-[22rem] sm:px-14 sm:pb-16 sm:pt-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div key={s.id} className="max-w-lg motion-safe:animate-fadein" role="group" aria-roledescription="slide" aria-label={`${idx + 1} / ${n}`}>
          <h2 className="font-display text-3xl leading-tight tracking-wide text-ivory-50 sm:text-4xl">{s.title}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ivory-100/90 sm:text-base">{s.text}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button className="px-6 py-3 text-base" onClick={s.onClick}>{s.cta}</Button>
            {s.cta2 && s.onClick2 && <Button variant="ghost" onClick={s.onClick2}>{s.cta2}</Button>}
          </div>
        </div>
        <div key={`${s.id}-art`} className="min-w-0">{s.art}</div>
      </div>

      {n > 1 && (
        <>
          <button type="button" aria-label={t('lob.prev')} onClick={() => go(idx - 1)} className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/60 text-ivory-50 hover:bg-ink-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 sm:flex">‹</button>
          <button type="button" aria-label={t('lob.next')} onClick={() => go(idx + 1)} className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/60 text-ivory-50 hover:bg-ink-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 sm:flex">›</button>
          <button
            type="button"
            aria-label={stopped ? t('gs.play') : t('gs.pause')}
            aria-pressed={stopped}
            onClick={() => setStopped((v) => !v)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950/60 text-xs text-ivory-50 hover:bg-ink-950/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            {stopped ? '▶' : '❚❚'}
          </button>
          <div role="tablist" aria-label={label} className="absolute inset-x-0 bottom-3 flex flex-wrap justify-center gap-x-1 gap-y-1 px-3">
            {slides.map((d, k) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={k === idx}
                aria-label={d.name}
                onClick={() => go(k)}
                className={`relative overflow-hidden rounded-full px-2.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${k === idx ? 'bg-gold-400 text-ink-950' : 'bg-ink-950/50 text-ivory-100/85 hover:bg-ink-950/80'}`}
              >
                {d.name}
                {k === idx && running && <span aria-hidden="true" key={idx} className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-gsbar bg-ink-950/60" />}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
