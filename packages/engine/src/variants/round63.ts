import { parseCard, type Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { categoryOf, HandCategory } from '../evaluation/handEvaluator';
import { evaluateOmahaWithPair } from '../evaluation/omahaEvaluator';
import { freshSel, publicEvent, RoundBase, type PhaseSel } from './roundBase';
import {
  RuleError,
  type RoundCommand,
  type RoundContext,
  type RoundEvent,
  type RoundSnapshot,
  type VariantId,
} from './types';

/** Un point de ligne = 60 unités : divisible par 1 à 6 joueurs, donc aucun calcul décimal. */
export const LINE_UNITS = 60;

export interface LineDesignation {
  pair: [string, string];
  rank: number;
  category: HandCategory;
}

export interface LineResult {
  line: 1 | 2 | 3;
  /** null = aucune combinaison à temps : ligne perdue. */
  designations: Record<PlayerId, LineDesignation | null>;
  winners: PlayerId[];
  unitsEach: number;
}

interface State63 {
  line: 1 | 2 | 3;
  sel: PhaseSel;
  lines: LineResult[];
  done: boolean;
}

/**
 * 6-3 (Omaha). 6 cartes privées, et 3 plateaux INDÉPENDANTS de 5 cartes chacun (flop 3 + turn 1 + river 1),
 * soit 15 cartes communes au total. Le flop et le turn de chaque ligne sont visibles dès le début de la manche ;
 * seule la river de la ligne 1 est visible d'emblée (13 cartes visibles). Les rivers des lignes 2 et 3 restent
 * cachées et ne sont révélées qu'après la clôture de la ligne précédente (2 cartes cachées au départ).
 * À chaque ligne, le joueur désigne 2 cartes privées (réutilisables à chaque ligne) ; la ligne est évaluée sur
 * la paire désignée combinée au plateau de CETTE ligne uniquement, sans aucune aide. Sans paire de 2 cartes à
 * l'échéance : ligne perdue.
 */
export class Round63 extends RoundBase {
  readonly variant: VariantId = 'V6_3';
  private s!: State63;

  /** Résultats des lignes déjà résolues (lecture seule, pour le résumé de la manche). */
  lineResults(): readonly LineResult[] {
    return this.s.lines;
  }

  constructor(ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    if (snapshot) {
      this.s = snapshot.state as State63;
    } else {
      this.cards.dealRoundRobin(6);
      this.cards.dealBoard(5, true); // ligne 1 : flop + turn + river, tout visible d'emblée
      this.cards.dealBoard(4, true); // ligne 2 : flop + turn visibles
      this.cards.dealBoard(1, false); // ligne 2 : river cachée
      this.cards.dealBoard(4, true); // ligne 3 : flop + turn visibles
      this.cards.dealBoard(1, false); // ligne 3 : river cachée
      this.s = { line: 1, sel: freshSel(this.players), lines: [], done: false };
    }
  }

  phase(): string {
    return this.s.done ? 'DONE' : `LINE_${this.s.line}`;
  }

  awaiting(): PlayerId[] {
    return this.s.done ? [] : this.players.filter((p) => !this.s.sel.validated.includes(p));
  }

  /** Avertissement neutre à 10 s pour qui n'a désigné qu'une seule carte. */
  warnings(): PlayerId[] {
    return this.awaiting().filter((p) => this.s.sel.drafts[p]!.length === 1);
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    switch (cmd.type) {
      case 'SELECT': {
        this.assertOpenForSelection(this.s.sel, cmd.player, () => true);
        const cards = this.parseSelection(cmd.player, cmd.cards, 2);
        this.s.sel.drafts[cmd.player] = cards.map((c) => c.code);
        return;
      }
      case 'VALIDATE': {
        this.assertOpenForSelection(this.s.sel, cmd.player, () => true);
        if (this.s.sel.drafts[cmd.player]!.length !== 2) {
          throw new RuleError('INCOMPLETE_SELECTION', 'Désignez exactement 2 cartes');
        }
        this.s.sel.validated.push(cmd.player);
        if (this.s.sel.validated.length === this.players.length) this.closeLine(events);
        return;
      }
      case 'TIMEOUT':
        this.closeLine(events);
        return;
      default:
        throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au 6-3`);
    }
  }

  /** Plateau INDÉPENDANT de la ligne k : 5 cartes propres (flop + turn + river), aucune carte partagée entre lignes. */
  private lineBoard(line: number): Card[] {
    const start = (line - 1) * 5;
    return this.cards
      .getBoard()
      .slice(start, start + 5)
      .map((s) => s.card);
  }

  private closeLine(events: RoundEvent[]): void {
    const line = this.s.line;
    const board = this.lineBoard(line);
    const designations: Record<PlayerId, LineDesignation | null> = {};
    for (const p of this.players) {
      const draft = this.s.sel.drafts[p]!;
      if (draft.length !== 2) {
        designations[p] = null; // sélection absente ou incomplète : ligne perdue
        continue;
      }
      const pair = [parseCard(draft[0]!), parseCard(draft[1]!)] as [Card, Card];
      const res = evaluateOmahaWithPair(pair, this.handOf(p), board);
      designations[p] = { pair: [pair[0].code, pair[1].code], rank: res.rank, category: categoryOf(res.rank) };
    }
    const designated = this.players.filter((p) => designations[p] !== null);
    const best = designated.reduce((m, p) => Math.max(m, designations[p]!.rank), -1);
    const winners = designated.filter((p) => designations[p]!.rank === best);
    const result: LineResult = {
      line,
      designations,
      winners,
      unitsEach: winners.length > 0 ? LINE_UNITS / winners.length : 0,
    };
    this.s.lines.push(result);
    events.push(publicEvent('LINE_RESOLVED', { ...result }));

    // Quinte flush DÉSIGNÉE sur une ligne : fin de partie immédiate (6-3 uniquement).
    const flushers = designated.filter((p) => designations[p]!.category === HandCategory.StraightFlush);
    if (flushers.length > 0) {
      const top = flushers.reduce((a, b) => (designations[b]!.rank > designations[a]!.rank ? b : a));
      this.s.done = true;
      this.finish({ kind: 'INSTANT_VICTORY', winner: top, line }, events);
      return;
    }

    if (line < 3) {
      const riverIndex = line * 5 + 4; // river de la ligne suivante : ligne 2 → index 9, ligne 3 → index 14
      const river = this.cards.revealBoardSlot(riverIndex);
      this.s.line = (line + 1) as 2 | 3;
      this.s.sel = freshSel(this.players);
      events.push(publicEvent('BOARD_REVEALED', { slot: riverIndex, card: river.code, line: this.s.line }));
      return;
    }
    this.s.done = true;
    this.tally(events);
  }

  /** Points de ligne cumulés par joueur (en unités de 1/60). */
  units(): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {};
    for (const p of this.players) {
      out[p] = this.s.lines.reduce((n, l) => n + (l.winners.includes(p) ? l.unitsEach : 0), 0);
    }
    return out;
  }

  private tally(events: RoundEvent[]): void {
    const units = this.units();
    const top = Math.max(...this.players.map((p) => units[p]!));
    if (top === 0) {
      this.finish({ kind: 'NO_WINNER', reason: 'NO_DESIGNATION' }, events);
      return;
    }
    const leaders = this.players.filter((p) => units[p] === top);
    if (leaders.length > 1) {
      // Égalité en tête : 0 point à 2-3 joueurs, Hold'em de départage à 4-6 joueurs (règle de table)
      if (this.players.length <= 3) this.finish({ kind: 'NO_WINNER', reason: 'TIE_SMALL_TABLE' }, events);
      else this.finish({ kind: 'TIE', tied: leaders }, events);
      return;
    }
    const winner = leaders[0]!;
    const soloAllLines = this.s.lines.every((l) => l.winners.length === 1 && l.winners[0] === winner);
    this.finish({ kind: 'WINNER', winner, points: soloAllLines ? 2 : 1, detail: { units } }, events);
  }

  protected stateForSnapshot(): unknown {
    return this.s;
  }

  protected infoFor(viewer: PlayerId | null): Record<string, unknown> {
    const draft = viewer ? (this.s.sel.drafts[viewer] ?? []) : [];
    return {
      line: this.s.line,
      validated: [...this.s.sel.validated],
      yourDraft: viewer && !this.s.done ? [...draft] : [],
      // Lignes closes : désignations révélées ensemble (publiques), jamais les brouillons en cours
      lines: this.s.lines,
      unitsScale: LINE_UNITS,
      // Assistance : combinaison de la paire désignée + le plateau de la ligne en cours, avec le même
      // évaluateur que la résolution réelle de la ligne.
      assistCategory:
        this.assistance && viewer && !this.s.done && draft.length === 2
          ? categoryOf(evaluateOmahaWithPair([parseCard(draft[0]!), parseCard(draft[1]!)], this.handOf(viewer), this.lineBoard(this.s.line)).rank)
          : null,
    };
  }
}
