import { motion, useReducedMotion } from 'framer-motion';
import { CardSlot, PlayingCard } from '../Card';
import { Badge } from '../ui';
import { ROMAN } from '../../lib/tableau';
import type { ColumnHand, TbGameDto } from '../../lib/types';

type CardLook = { fourColor: boolean; back: 'losange' | 'rayures' | 'etoile' };

/**
 * Une colonne du Tableau : cinq emplacements empilés, chaque carte laissant voir son coin (rang et couleur).
 * La largeur des cartes vient de --w, qui s'adapte à l'écran (cinq colonnes tiennent sur un téléphone de 320 px).
 */
export function ColumnStack({
  cards, label, index, side, fresh, selectable, pending, onPick, forming, look, owner,
}: {
  cards: string[];
  label: string;
  index: number;
  side: 'mine' | 'theirs';
  /** Dernière carte arrivée dans cette colonne : elle glisse depuis le centre. */
  fresh: boolean;
  selectable: boolean;
  pending: boolean;
  onPick: () => void;
  /** Combinaison finale : codes des cartes qui la forment (les autres sont atténuées). */
  forming?: string[];
  look: CardLook;
  owner: string;
}) {
  const reduce = useReducedMotion();
  const full = cards.length === 5;
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] ?? null);
  const name = `${owner}, colonne ${ROMAN[index]} : ${cards.length} carte${cards.length > 1 ? 's' : ''} sur 5. ${label}`;
  const body = (
    <span
      className={`relative flex flex-col items-center rounded-xl px-[2px] pb-1 pt-1 transition ${full ? 'bg-gold-500/10 ring-1 ring-gold-500/40' : 'bg-ink-950/25'} ${selectable ? 'ring-2 ring-gold-300/80' : ''} ${pending ? 'ring-[3px] ring-gold-200 bg-gold-500/20' : ''}`}
      style={{ ['--w' as string]: 'min(15.5vw, 4.3rem)' }}
    >
      {slots.map((code, i) => {
        const isFresh = fresh && i === cards.length - 1;
        const dim = forming !== undefined && code !== null && !forming.includes(code);
        return (
          <span key={i} className={i === 0 ? '' : '-mt-[calc(var(--w)*0.93)]'} style={{ zIndex: i }}>
            {code ? (
              <motion.span
                className="block"
                initial={isFresh && !reduce ? { y: side === 'mine' ? -120 : 120, scale: 1.25, opacity: 0.2 } : false}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                <PlayingCard code={code} size="col" fourColor={look.fourColor} dimmed={dim} highlight={forming?.includes(code)} />
              </motion.span>
            ) : pending && i === cards.length ? (
              <span className="inline-flex aspect-[5/7] w-[var(--w)] items-center justify-center rounded-[9px] border-2 border-dashed border-gold-200 bg-gold-500/20 text-[11px] font-semibold text-gold-100">Ici</span>
            ) : (
              <CardSlot code={null} size="col" label="" />
            )}
          </span>
        );
      })}
    </span>
  );
  const labelEl = (
    <span className={`mt-1 block min-h-[2.1rem] w-full px-0.5 text-center text-[10.5px] leading-tight sm:text-xs ${full ? 'font-semibold text-gold-200' : 'text-ivory-300/80'}`}>{label}</span>
  );
  const inner = (
    <>
      {side === 'theirs' && labelEl}
      {body}
      {side === 'mine' && labelEl}
    </>
  );
  return selectable ? (
    <button type="button" onClick={onPick} aria-label={`Poser la carte dans la colonne ${ROMAN[index]}. ${name}`} className="flex touch-manipulation flex-col items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
      {inner}
    </button>
  ) : (
    <div role="group" aria-label={name} className="flex flex-col items-center">
      {inner}
    </div>
  );
}

/** Bande centrale : numéro de colonne et verdict des colonnes déjà tranchées. */
export function VerdictRow({ verdicts, you, final }: { verdicts: TbGameDto['verdicts']; you: 0 | 1; final: boolean }) {
  return (
    <ol className="grid grid-cols-5 gap-1 text-center" aria-label="Verdict des colonnes">
      {ROMAN.map((r, i) => {
        const v = verdicts?.[i] ?? null;
        const tone = v === null ? 'border-ivory-100/15 text-ivory-300/70' : v === 'tie' ? 'border-amber-400/60 bg-amber-500/10 text-amber-200' : v === you ? 'border-jade-400/70 bg-jade-500/15 text-jade-300' : 'border-ruby-400/70 bg-ruby-500/15 text-ruby-200';
        const word = v === null ? (final ? '—' : 'ouverte') : v === 'tie' ? 'nulle' : v === you ? 'gagnée' : 'perdue';
        return (
          <li key={r} className={`rounded-lg border px-1 py-0.5 text-[11px] font-semibold ${tone}`}>
            <span className="font-display text-sm">{r}</span> <span className="block text-[10px] font-normal sm:inline">{word}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MiniHand({ hand, dim }: { hand: ColumnHand; dim?: boolean }) {
  return (
    <span className={`flex gap-0.5 ${dim ? 'opacity-70' : ''}`} aria-label={hand.label}>
      {hand.cards.map((c) => (
        <PlayingCard key={c} code={c} size="xs" dimmed={!hand.forming.includes(c)} highlight={hand.forming.includes(c)} />
      ))}
    </span>
  );
}

/** Écran de résultats : vainqueur, score, et pour chaque colonne les deux combinaisons avec les cartes qui les forment. */
export function ResultsTable({ dto }: { dto: TbGameDto }) {
  const reduce = useReducedMotion();
  const you = dto.you;
  const opp = (1 - you) as 0 | 1;
  const r = dto.result;
  if (!r) return null;
  return (
    <ol className="space-y-2" aria-label="Détail des cinq colonnes">
      {r.columns.map((v, i) => {
        const mine = you === 0 ? v.a : v.b;
        const theirs = you === 0 ? v.b : v.a;
        const outcome = v.winner === null ? 'tie' : v.winner === you ? 'win' : 'loss';
        const tone = outcome === 'win' ? 'border-jade-400/60 bg-jade-500/10' : outcome === 'loss' ? 'border-ruby-400/50 bg-ruby-500/10' : 'border-amber-400/50 bg-amber-500/10';
        return (
          <motion.li
            key={i}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.35 * i, duration: 0.3 }}
            className={`rounded-2xl border p-2.5 ${tone}`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-display text-lg text-ivory-50">Colonne {ROMAN[i]}</span>
              <Badge tone={outcome === 'win' ? 'green' : outcome === 'loss' ? 'red' : 'amber'}>{outcome === 'win' ? 'Gagnée' : outcome === 'loss' ? 'Perdue' : 'Égalité'}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className={outcome === 'win' ? '' : 'opacity-90'}>
                <p className="mb-1 text-xs text-ivory-300/80">Vous</p>
                <MiniHand hand={mine} />
                <p className={`mt-1 text-sm ${outcome === 'win' ? 'font-semibold text-jade-300' : 'text-ivory-100'}`}>{mine.label}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-ivory-300/80">{dto.players[opp]?.nickname ?? 'Adversaire'}</p>
                <MiniHand hand={theirs} />
                <p className={`mt-1 text-sm ${outcome === 'loss' ? 'font-semibold text-ruby-200' : 'text-ivory-100'}`}>{theirs.label}</p>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
