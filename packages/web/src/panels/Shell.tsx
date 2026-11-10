import type { ReactNode } from 'react';
import { CountdownRing, Eyebrow, Panel } from '../components/ui';
import { useSecondsLeft } from '../lib/context';
import { useMediaQuery } from '../lib/media';
import { useTable } from '../lib/table';
import { useI18n } from '../i18n';

/** Cadre commun des panneaux d'action : titre, consigne, compte à rebours de 60 s. */
export function PanelShell({ eyebrow, title, hint, children, timerLabel }: { eyebrow: string; title: ReactNode; hint?: ReactNode; children: ReactNode; timerLabel?: string }) {
  const { t } = useI18n();
  const { deadlineAt } = useTable();
  const left = useSecondsLeft(deadlineAt);
  // Écran haut : consigne affichée. Écran bas (téléphone, portable) : repliée sous « Consigne », pour que les
  // cartes et les boutons tiennent dans l'écran sans défiler.
  const roomy = useMediaQuery('(min-height: 900px)');
  return (
    <Panel className="p-2.5 sm:p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="hidden sm:block">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h2 className="font-display text-base leading-tight text-ivory-50 sm:mt-0.5 sm:text-2xl">{title}</h2>
          {hint &&
            (roomy ? (
              <p className="mt-1 max-w-2xl text-xs text-ivory-200/80 sm:text-sm">{hint}</p>
            ) : (
              <details className="mt-0.5 max-w-2xl text-xs text-ivory-200/80 sm:text-sm">
                <summary className="cursor-pointer select-none text-gold-300/90">{t('shell.consigne')}</summary>
                <p className="mt-1">{hint}</p>
              </details>
            ))}
        </div>
        {left !== null && <CountdownRing secondsLeft={left} label={timerLabel} size={40} />}
      </div>
      <div className="mt-1.5 sm:mt-2.5">{children}</div>
    </Panel>
  );
}

export function WaitingNote({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 rounded-lg border border-ivory-100/10 bg-ink-900/60 px-3 py-2 text-center text-sm text-ivory-200/85">{children}</p>;
}
