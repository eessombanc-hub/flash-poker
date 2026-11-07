import { CardSlot, type CardSize } from './Card';
import { useSettings } from '../lib/settings';
import type { RoundView } from '../lib/types';

const FIVE_LABELS = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];

/** Plateau commun : Hold'em / Aviation (5 cartes), 6-1 (5 cartes ouvertes d'emblée), 6-3 (4 cartes de base + 3 rivers),
 * Morpion (grille 3×3), Le 10 (aucun plateau commun). */
export function Board({ round, size = 'md' }: { round: RoundView; size?: CardSize }) {
  const { fourColor } = useSettings();
  const b = round.cards.board;
  if (round.variant === 'V6_3') return <Board63 board={b} line={Number(round.info.line ?? 1)} size={size} fourColor={fourColor} />;
  if (round.variant === 'MORPION') return <BoardMorpion board={b} size={size} fourColor={fourColor} />;
  if (round.variant === 'LE10') return null; // aucune carte commune
  const isAviation = round.variant === 'AVIATION' || round.variant === 'AVIA_6';
  if (b.length === 0) return null;
  return (
    <div role="group" aria-label="Cartes communes" className="flex items-end justify-center gap-1.5 sm:gap-2.5">
      {b.map((code, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <CardSlot code={code} size={size} fourColor={fourColor} dealIndex={i} label={isAviation ? FIVE_LABELS[i] : undefined} />
          {isAviation && <span className="text-xs uppercase tracking-widest text-ivory-200/60">{i === 0 || i === 3 || i === 4 ? FIVE_LABELS[i] : ''}</span>}
        </div>
      ))}
    </div>
  );
}

const LINE_CARD_LABELS = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];

/** 6-3 : 3 plateaux INDÉPENDANTS de 5 cartes (flop+turn+river) chacun, aucune carte partagée entre lignes.
 * La ligne 1 est entièrement visible d'emblée ; les rivers des lignes 2 et 3 restent des emplacements vides
 * (gérés par CardSlot) tant qu'elles n'ont pas été révélées par le moteur. */
function Board63({ board, line, size, fourColor }: { board: (string | null)[]; line: number; size: CardSize; fourColor: boolean }) {
  return (
    <div role="group" aria-label="Plateaux du 6-3" className="flex flex-col items-center gap-1 sm:gap-2.5">
      {[1, 2, 3].map((n) => {
        const cards = board.slice((n - 1) * 5, n * 5);
        const current = n === line;
        return (
          <div key={n} className={`flex items-center gap-2 rounded-xl px-2 py-1 sm:gap-2.5 sm:px-2.5 sm:py-1.5 ${current ? 'bg-gold-500/10 ring-1 ring-gold-400/50' : 'opacity-80'}`} aria-label={`Ligne ${n}`}>
            <span className={`w-12 shrink-0 text-[11px] font-semibold uppercase tracking-widest ${current ? 'text-gold-300' : 'text-ivory-200/60'}`}>Ligne {n}</span>
            <div className="flex items-end gap-1.5 sm:gap-2">
              {cards.map((code, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <CardSlot code={code} size={size} fourColor={fourColor} flip={n > 1 && i === 4 && code !== null} dealIndex={i} label={i === 4 ? `River ${n}` : LINE_CARD_LABELS[i]} />
                  {/* Sur téléphone, l'emplacement vide de la river porte déjà son nom : légendes masquées pour gagner de la hauteur. */}
                  <span className="hidden text-[9px] uppercase tracking-widest text-ivory-200/50 sm:block">{i === 4 ? `River ${n}` : i === 3 ? 'Turn' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Morpion : grille 3×3 de cartes communes (indices 0-8, lus ligne par ligne), toutes visibles d'emblée. */
export function BoardMorpion({ board, size, fourColor }: { board: (string | null)[]; size: CardSize; fourColor: boolean }) {
  return (
    <div role="group" aria-label="Grille du morpion" className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {board.map((code, i) => (
        <CardSlot key={i} code={code} size={size} fourColor={fourColor} dealIndex={i} />
      ))}
    </div>
  );
}
