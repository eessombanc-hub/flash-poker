import { parseCard, type Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { categoryOf, combinationCodes, evaluate5 } from '../evaluation/handEvaluator';
import { rankGroups } from '../evaluation/ranking';
import { publicEvent, RoundBase } from './roundBase';
import { RuleError, type RoundCommand, type RoundContext, type RoundEvent, type RoundSnapshot, type VariantId } from './types';

/** Les 8 alignements de la grille 3×3 (indices 0-8, lus ligne par ligne) : 3 lignes, 3 colonnes, 2 diagonales. */
export const MORPION_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

interface Draft {
  cards: string[];
  line: number | null;
}

interface StateMorpion {
  drafts: Record<PlayerId, Draft>;
  validated: PlayerId[];
}

/**
 * Morpion (Hold'em). 4 cartes privées par joueur ; 9 cartes communes disposées en grille 3×3, toutes visibles
 * dès le départ. Chaque joueur désigne 2 de ses 4 cartes privées ET l'un des 8 alignements de la grille
 * (ligne, colonne ou diagonale) ; sa main est ces 2 cartes + les 3 cartes de l'alignement choisi, évaluée
 * comme au Hold'em classique. Aucune aide n'est fournie pendant la désignation. Sans désignation complète
 * (2 cartes + un alignement) à l'échéance : le joueur ne compte pas pour la manche.
 */
export class RoundMorpion extends RoundBase {
  readonly variant: VariantId = 'MORPION';
  private s!: StateMorpion;

  constructor(ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    if (snapshot) {
      this.s = snapshot.state as StateMorpion;
    } else {
      this.cards.dealRoundRobin(4);
      this.cards.dealBoard(9, true); // grille 3×3, tout visible d'emblée
      const drafts: Record<PlayerId, Draft> = {};
      for (const p of this.players) drafts[p] = { cards: [], line: null };
      this.s = { drafts, validated: [] };
    }
  }

  phase(): string {
    return this.outcome ? 'DONE' : 'SELECTION';
  }

  awaiting(): PlayerId[] {
    return this.outcome ? [] : this.players.filter((p) => !this.s.validated.includes(p));
  }

  /** Avertissement neutre à 10 s pour qui a commencé sans avoir complété les 2 cartes ET un alignement. */
  warnings(): PlayerId[] {
    return this.awaiting().filter((p) => {
      const d = this.s.drafts[p]!;
      return (d.cards.length > 0 || d.line !== null) && (d.cards.length !== 2 || d.line === null);
    });
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    switch (cmd.type) {
      case 'SELECT': {
        this.assertPlayer(cmd.player);
        if (this.s.validated.includes(cmd.player)) throw new RuleError('ALREADY_VALIDATED', `${cmd.player} a déjà validé`);
        const cards = this.parseSelection(cmd.player, cmd.cards, 2);
        if (cmd.line !== undefined && cmd.line !== null && (!Number.isInteger(cmd.line) || cmd.line < 0 || cmd.line > 7)) {
          throw new RuleError('BAD_COMMAND', 'Alignement invalide. Un index de 0 à 7 est attendu');
        }
        const draft = this.s.drafts[cmd.player]!;
        draft.cards = cards.map((c) => c.code);
        if (cmd.line !== undefined) draft.line = cmd.line;
        return;
      }
      case 'VALIDATE': {
        this.assertPlayer(cmd.player);
        if (this.s.validated.includes(cmd.player)) throw new RuleError('ALREADY_VALIDATED', `${cmd.player} a déjà validé`);
        const d = this.s.drafts[cmd.player]!;
        if (d.cards.length !== 2 || d.line === null) {
          throw new RuleError('INCOMPLETE_SELECTION', 'Désignez 2 cartes et un alignement (ligne, colonne ou diagonale)');
        }
        this.s.validated.push(cmd.player);
        if (this.s.validated.length === this.players.length) this.showdown(events);
        return;
      }
      case 'TIMEOUT':
        this.showdown(events);
        return;
      default:
        throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au morpion`);
    }
  }

  private showdown(events: RoundEvent[]): void {
    const board = this.boardCards(); // 9 cartes, indices 0-8
    const entries = this.players.map((player) => {
      const d = this.s.drafts[player]!;
      if (d.cards.length !== 2 || d.line === null) return { player, hand: null as Card[] | null, rank: null as number | null };
      const [a, b, c] = MORPION_LINES[d.line]!;
      const hand = [...d.cards.map(parseCard), board[a]!, board[b]!, board[c]!];
      return { player, hand, rank: evaluate5(hand) };
    });
    const played = entries.filter((e): e is { player: PlayerId; hand: Card[]; rank: number } => e.rank !== null);
    events.push(
      publicEvent('SHOWDOWN', {
        hands: Object.fromEntries(played.map((e) => [e.player, { cards: e.hand.map((c) => c.code), category: categoryOf(e.rank), rank: e.rank }])),
      }),
    );
    if (played.length === 0) {
      this.finish({ kind: 'NO_WINNER', reason: 'NO_DESIGNATION' }, events);
      return;
    }
    const top = rankGroups(played.map((e) => ({ player: e.player, rank: e.rank })))[0]!;
    this.finish(top.length === 1 ? { kind: 'WINNER', winner: top[0]!, points: 1 } : { kind: 'TIE', tied: top }, events);
  }

  protected stateForSnapshot(): unknown {
    return this.s;
  }

  protected infoFor(viewer: PlayerId | null): Record<string, unknown> {
    const draft = viewer && !this.outcome ? this.s.drafts[viewer]! : { cards: [], line: null };
    let assistCategory: number | null = null;
    let assistCards: string[] = [];
    if (this.assistance && draft.cards.length === 2 && draft.line !== null) {
      const [a, b, c] = MORPION_LINES[draft.line]!;
      const board = this.boardCards();
      const five = [...draft.cards.map(parseCard), board[a]!, board[b]!, board[c]!];
      assistCategory = categoryOf(evaluate5(five));
      assistCards = combinationCodes(five);
    }
    return {
      validated: [...this.s.validated],
      yourDraft: { cards: [...draft.cards], line: draft.line },
      // Assistance : combinaison des 2 cartes désignées + les 3 cartes de l'alignement choisi.
      assistCategory,
      assistCards,
    };
  }
}
