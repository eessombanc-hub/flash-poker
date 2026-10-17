import type { ReactNode } from 'react';
import { CountdownRing, Eyebrow, Panel } from '../components/ui';
import { useSecondsLeft } from '../lib/context';
import { useTable } from '../lib/table';

/** Cadre commun des panneaux d'action : titre, consigne, compte à rebours de 60 s. */
export function PanelShell({ eyebrow, title, hint, children, timerLabel }: { eyebrow: string; title: ReactNode; hint?: ReactNode; children: ReactNode; timerLabel?: string }) {
  const { deadlineAt } = useTable();
  const left = useSecondsLeft(deadlineAt);
  return (
    <Panel className="p-3 sm:p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-0.5 font-display text-lg leading-tight text-ivory-50 sm:text-2xl">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-xs text-ivory-200/80 sm:text-sm">{hint}</p>}
        </div>
        {left !== null && <CountdownRing secondsLeft={left} label={timerLabel} size={44} />}
      </div>
      <div className="mt-2.5">{children}</div>
    </Panel>
  );
}

export function WaitingNote({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 rounded-lg border border-ivory-100/10 bg-ink-900/60 px-3 py-2 text-center text-sm text-ivory-200/85">{children}</p>;
}
