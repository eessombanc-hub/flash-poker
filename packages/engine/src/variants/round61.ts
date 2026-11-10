import type { Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { categoryOf, type HandRank } from '../evaluation/handEvaluator';
import { evaluateOmaha } from '../evaluation/omahaEvaluator';
import { rankGroups } from '../evaluation/ranking';
import { evaluateVisible } from '../evaluation/visibleEvaluator';
import { publicEvent, RoundBase } from './roundBase';
import {
  RuleError,
  type RoundCommand,
  type RoundContext,
  type RoundEvent,
  type RoundSnapshot,
  type VariantId,
} from './types';

export type NextReason = 'LOWEST_SIXTH_CARD' | 'WEAKEST' | 'TIE_LAST_REVEALER' | 'TIE_POSITION';

export interface RevealStep {
  revealer: PlayerId;
  card: string;
  /** Classement APRÈS la révélation, calculé sur les seules cartes visibles. */
  ranking: Record<PlayerId, { category: number; rank: number }>;
  nextRevealer: PlayerId | null;
  reason: NextReason | null;
}

interface State61 {
  next: PlayerId | null;
  reason: NextReason | null;
  reveals: number;
  history: RevealStep[];
}

/**
 * 6-1 (Omaha). 6 cartes par joueur distribuées une à une : 5 cachées, la 6e visible ; plateau commun de
 * 5 cartes visible d'emblée. Le joueur à la main la plus faible retourne sa prochaine carte (dans l'ordre de
 * distribution), dans un délai de 60 s (le serveur envoie `TIMEOUT` : retournement automatique) ; l'ordre est recalculé après CHAQUE révélation, sur les seules cartes visibles
 * (meilleure main de 5 cartes parmi plateau + cartes visibles, sans contrainte 2+3). Showdown final Omaha 2+3.
 */
export class Round61 extends RoundBase {
  readonly variant: VariantId = 'V6_1';
  private s!: State61;

  constructor(ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    if (snapshot) {
      this.s = snapshot.state as State61;
    } else {
      this.cards.dealRoundRobin(6, { visibleFrom: 5 });
      this.cards.dealBoard(5, true);
      // Premier révélateur : on compare les 6es cartes SEULES (sans le plateau), As haut, couleurs sans effet
      const sixth = this.players.map((p) => ({ p, rank: this.cards.getHand(p)[5]!.card.rank as number }));
      const low = Math.min(...sixth.map((x) => x.rank));
      const first = sixth.find((x) => x.rank === low)!.p; // égalité : ordre UTG → UTG+5
      this.s = { next: first, reason: 'LOWEST_SIXTH_CARD', reveals: 0, history: [] };
    }
  }

  phase(): string {
    return this.outcome ? 'DONE' : 'REVEAL';
  }

  /** Chaque retournement est une nouvelle phase de 60 s (même si le même joueur révèle deux fois de suite). */
  override phaseKey(): string {
    return this.outcome ? 'DONE' : `REVEAL_${this.s.reveals}`;
  }

  awaiting(): PlayerId[] {
    return this.s.next && !this.outcome ? [this.s.next] : [];
  }

  warnings(): PlayerId[] {
    return [];
  }

  /** Meilleure main de chaque joueur d'après ses seules cartes visibles + le plateau. */
  private visibleRanks(): Record<PlayerId, HandRank> {
    const board = this.boardCards();
    const out: Record<PlayerId, HandRank> = {};
    for (const p of this.players) {
      const visible: Card[] = this.cards.getHand(p).filter((e) => e.visible).map((e) => e.card);
      out[p] = evaluateVisible(board, visible).rank;
    }
    return out;
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    if (cmd.type === 'TIMEOUT') {
      // Minuteur de 60 s écoulé : la prochaine carte du joueur désigné est retournée automatiquement
      this.revealFor(this.s.next!, events, true);
      return;
    }
    if (cmd.type !== 'REVEAL') throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au 6-1`);
    this.assertPlayer(cmd.player);
    if (cmd.player !== this.s.next) throw new RuleError('NOT_YOUR_TURN', `${cmd.player} n'est pas le joueur désigné`);
    this.revealFor(cmd.player, events, false);
  }

  /** Retourne la prochaine carte cachée (ordre de distribution) du joueur désigné, puis recalcule l'ordre. */
  private revealFor(player: PlayerId, events: RoundEvent[], auto: boolean): void {
    const card = this.cards.revealNextHiddenCard(player);
    this.s.reveals++;
    const ranks = this.visibleRanks();
    const ranking = Object.fromEntries(this.players.map((p) => [p, { category: categoryOf(ranks[p]!), rank: ranks[p]! }]));

    if (this.s.reveals === 5 * this.players.length) {
      this.s.history.push({ revealer: player, card: card.code, ranking, nextRevealer: null, reason: null });
      events.push(publicEvent('CARD_REVEALED', { player, card: card.code, ranking, auto }));
      this.s.next = null;
      this.s.reason = null;
      this.showdown(events);
      return;
    }

    // Prochain révélateur : la main la plus faible PARMI les joueurs qui ont encore une carte cachée.
    const candidates = this.players.filter((p) => this.cards.hiddenCount(p) > 0);
    const low = Math.min(...candidates.map((p) => ranks[p]!));
    const group = candidates.filter((p) => ranks[p] === low);
    let next: PlayerId;
    let reason: NextReason;
    if (group.length === 1) {
      next = group[0]!;
      reason = 'WEAKEST';
    } else if (group.includes(player)) {
      next = player; // égalité : le dernier révélateur en retourne une nouvelle
      reason = 'TIE_LAST_REVEALER';
    } else {
      next = group[0]!; // sinon : le joueur à égalité le plus proche dans l'ordre UTG
      reason = 'TIE_POSITION';
    }
    this.s.next = next;
    this.s.reason = reason;
    this.s.history.push({ revealer: player, card: card.code, ranking, nextRevealer: next, reason });
    events.push(publicEvent('CARD_REVEALED', { player, card: card.code, ranking, auto }));
    events.push(publicEvent('REVEAL_ORDER_RECOMPUTED', { next, reason }));
  }

  private showdown(events: RoundEvent[]): void {
    const board = this.boardCards();
    const entries = this.players.map((player) => {
      const hand = this.cards.getHand(player).map((e) => e.card);
      return { player, hand, rank: evaluateOmaha(hand, board).rank };
    });
    events.push(
      publicEvent('SHOWDOWN', {
        // Plateau final tel que le moteur l'a évalué : le récapitulatif l'affiche tel quel.
        board: board.map((c) => c.code),
        hands: Object.fromEntries(
          entries.map((e) => [e.player, { cards: e.hand.map((c) => c.code), category: categoryOf(e.rank) }]),
        ),
      }),
    );
    const top = rankGroups(entries.map((e) => ({ player: e.player, rank: e.rank })))[0]!;
    this.finish(top.length === 1 ? { kind: 'WINNER', winner: top[0]!, points: 1 } : { kind: 'TIE', tied: top }, events);
  }

  protected override maskOwnHiddenCards(): boolean {
    return true;
  }

  protected stateForSnapshot(): unknown {
    return this.s;
  }

  protected infoFor(): Record<string, unknown> {
    // Tout est public : le classement ne repose que sur des cartes visibles
    return { next: this.s.next, reason: this.s.reason, reveals: this.s.reveals, history: this.s.history };
  }
}
