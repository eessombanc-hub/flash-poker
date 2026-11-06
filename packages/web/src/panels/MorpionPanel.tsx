import { useEffect, useRef, useState } from 'react';
import { AssistBadge } from '../components/AssistBadge';
import { assistCategory } from '../lib/roundInfo';
import { SelectableHand } from '../components/Hand';
import { Button } from '../components/ui';
import { sortHand } from '../lib/cards';
import { useClient } from '../lib/context';
import { morpionInfo, type MorpionDraft } from '../lib/roundInfo';
import { ownCards } from '../lib/selectors';
import { useMediaQuery } from '../lib/media';
import { useTable } from '../lib/table';
import { PanelShell, WaitingNote } from './Shell';

/** Les 8 alignements, dans l'ordre exact du moteur (index 0-7) : 3 lignes, 3 colonnes, 2 diagonales. */
const ALIGNMENTS = ['Ligne 1', 'Ligne 2', 'Ligne 3', 'Colonne 1', 'Colonne 2', 'Colonne 3', 'Diagonale ↘', 'Diagonale ↗'];
/** Les 3 cases (0-8, lues ligne par ligne) que chaque alignement combine — mêmes indices que le moteur. */
const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Mini grille 3×3 décorative : reconnaissance immédiate de l'alignement, sans avoir à lire son nom. */
function MiniGrid({ line, active }: { line: number; active: boolean }) {
  const cells = LINES[line]!;
  return (
    <svg viewBox="0 0 36 36" className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) * 12 + 1;
        const y = Math.floor(i / 3) * 12 + 1;
        return <rect key={i} x={x} y={y} width={10} height={10} rx={2} fill={cells.includes(i) ? (active ? '#c9a25a' : '#a9843f') : 'rgba(244,239,228,.14)'} />;
      })}
    </svg>
  );
}

/** Brouillon {cartes, alignement} : même principe que `useDraft` (référence synchrone contre les doubles-taps),
 * étendu aux deux champs à la fois. Resynchronisé avec le serveur à chaque nouvelle phase (et au premier rendu). */
function useMorpionDraft(server: MorpionDraft, phaseKey: string, send: (d: MorpionDraft) => void) {
  const [draft, setDraftState] = useState<MorpionDraft>(server);
  const latest = useRef(draft);
  const setDraft = (d: MorpionDraft) => {
    latest.current = d;
    setDraftState(d);
  };
  const lastKey = useRef(phaseKey);
  useEffect(() => {
    if (lastKey.current !== phaseKey) {
      lastKey.current = phaseKey;
      setDraft(server);
    }
  }, [phaseKey, server]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      setDraft(server);
    }
  }, [server]);

  function toggleCard(code: string) {
    const cur = latest.current.cards;
    const next = cur.includes(code) ? cur.filter((c) => c !== code) : cur.length < 2 ? [...cur, code] : cur;
    if (next === cur) return;
    const d = { ...latest.current, cards: next };
    setDraft(d);
    send(d);
  }
  function setLine(line: number) {
    const d = { ...latest.current, line };
    setDraft(d);
    send(d);
  }
  return { draft, toggleCard, setLine };
}

/** Morpion : désignez 2 de vos 4 cartes privées et un alignement (ligne, colonne, diagonale). Aucune aide. */
export function MorpionPanel() {
  const client = useClient();
  const { game, round, me, canAct, timerKey } = useTable();
  const wide = useMediaQuery('(min-width: 640px)');
  const info = round ? morpionInfo(round) : null;
  const { draft, toggleCard, setLine } = useMorpionDraft(
    info?.yourDraft ?? { cards: [], line: null },
    timerKey,
    (d) => void client.command({ type: 'SELECT', cards: d.cards, line: d.line }),
  );
  if (!round || !info) return null;
  const hand = sortHand(ownCards(round, me).map((c) => c.code!));
  const validated = info.validated.includes(me);
  const total = game.players.length;
  const complete = draft.cards.length === 2 && draft.line !== null;

  return (
    <PanelShell
      eyebrow="Morpion"
      title="Choisissez 2 cartes et un alignement"
      hint="Combinez 2 de vos 4 cartes avec les 3 cartes d’une ligne, d’une colonne ou d’une diagonale de la grille. Aucune aide n’est fournie. Sans désignation complète à l’échéance, vous ne comptez pas pour la manche."
    >
      {canAct ? (
        <>
          <SelectableHand label="Votre main" cards={hand} selected={draft.cards} max={2} disabled={validated} onToggle={toggleCard} size={wide ? 'md' : 'sm'} />
          <fieldset className="mt-1.5 sm:mt-3">
            <legend className="sr-only sm:not-sr-only sm:mb-1 sm:text-sm sm:font-medium sm:text-ivory-100">Alignement</legend>
            {/* Les 8 alignements en une seule rangée. */}
            <div className="grid grid-cols-8 gap-1 sm:gap-1.5" role="radiogroup" aria-label="Alignement">
              {ALIGNMENTS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={draft.line === i}
                  aria-label={label}
                  disabled={validated}
                  onClick={() => setLine(i)}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${draft.line === i ? 'border-gold-500 bg-gold-500/15' : 'border-ivory-100/15 hover:border-ivory-100/35'} ${validated ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <MiniGrid line={i} active={draft.line === i} />
                  {/* Nom visible sur écran large ; sur téléphone, la mini-grille suffit (le nom reste lu par les lecteurs d'écran). */}
                  <span className={`hidden text-[10px] font-medium leading-tight sm:block ${draft.line === i ? 'text-gold-300' : 'text-ivory-200'}`}>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <AssistBadge active={game.assistance} category={assistCategory(round)} waiting="Choisissez 2 cartes et un alignement" />
          <div className="mt-2 flex flex-row items-center justify-center gap-2 sm:mt-3 sm:gap-4">
            <p className="text-xs text-ivory-200/80 sm:text-sm" aria-live="polite">
              {draft.cards.length}/2 carte{draft.cards.length > 1 ? 's' : ''} · {draft.line === null ? 'aucun alignement' : ALIGNMENTS[draft.line]}
            </p>
            <Button disabled={validated || !complete} onClick={() => void client.command({ type: 'VALIDATE' })} className="flex-1 px-3 sm:flex-none sm:min-w-[16rem] sm:px-5">
              {validated ? 'Combinaison verrouillée' : 'Valider ma combinaison'}
            </Button>
            {validated && (
              <p className="text-sm text-ivory-200/80">
                En attente des autres joueurs ({info.validated.length} / {total})
              </p>
            )}
          </div>
        </>
      ) : (
        <WaitingNote>Vous suivez la partie en spectateur.</WaitingNote>
      )}
    </PanelShell>
  );
}
