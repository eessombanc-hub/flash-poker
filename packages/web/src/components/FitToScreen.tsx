import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Sur grand écran, réduit son contenu pour qu'il tienne en entier dans la fenêtre, sans défiler.
 * Le contenu garde sa mise en page ; seul son rendu est réduit (jamais en dessous de `min`, jamais agrandi).
 * Sous 1024 px de large (téléphone, tablette), rien ne change : on défile normalement.
 */
export function FitToScreen({ children, enabled = true, min = 0.55 }: { children: ReactNode; enabled?: boolean; min?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const compute = () => {
      const natural = i.offsetHeight;
      if (!enabled || natural <= 0 || window.innerWidth < 1024) {
        setFit((f) => (f.scale === 1 && f.height === 0 ? f : { scale: 1, height: 0 }));
        return;
      }
      const top = o.getBoundingClientRect().top + window.scrollY;
      const avail = window.innerHeight - top - 56; // marge basse de la page (pb-12) incluse
      const scale = Math.max(min, Math.min(1, avail / natural));
      setFit((f) => (Math.abs(f.scale - scale) < 0.005 && f.height === natural ? f : { scale, height: natural }));
    };
    compute();
    window.addEventListener('resize', compute);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compute);
    ro?.observe(i);
    return () => {
      window.removeEventListener('resize', compute);
      ro?.disconnect();
    };
  }, [enabled, min]);

  const scaled = fit.scale < 1;
  return (
    <div ref={outer} style={scaled ? { height: fit.height * fit.scale } : undefined} data-fit-scale={scaled ? fit.scale.toFixed(2) : undefined}>
      <div ref={inner} style={scaled ? { transform: `scale(${fit.scale})`, transformOrigin: 'top center' } : undefined}>
        {children}
      </div>
    </div>
  );
}
