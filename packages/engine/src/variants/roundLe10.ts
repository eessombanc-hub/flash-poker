import type { Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { bestOf, categoryOf, evaluatePartial, type HandRank } from '../evaluation/handEvaluator';
import { rankGroups } from '../evaluation/ranking';
import { publicEvent, RoundBase } from './roundBase';
import { RuleError, type RoundCommand, type RoundContext, type RoundEvent, type RoundSnapshot, type VariantId } from './types';

export type NextReason10 = 'LOWEST_FIRST_CARD' | 'WEAKEST' | 'TIE_LAST_REVEALER' | 'TIE_POSITION';

export interface RevealStep10 {
  revealer: PlayerId;
  card: string;
  /** Classement APRÈS la révélation, calculé sur les seules cartes visibles de chacun (pas de plateau commun). */
  ranking: Record<PlayerId, { category: number; rank: number }>;
  nextRevealer: PlayerId | null;
  reason: NextReason10 | null;
}

interface State10 {
  next: PlayerId | null;
  reason: NextReason10 | null;
  reveals: number;
  history: RevealStep10[];
}

/**
 * Le 10 (Hold'em). Jusqu'à 5 joueurs. 10 cartes privées chacun, distribuées une à une : 9 cachées, la 10e
 * visible ; aucune carte commune. Le joueur à la main visible la plus faible retourne sa prochaine carte
 * (dans l'ordre de distribution), dans un délai de 60 s (TIMEOUT : retournement automatique) ; l'ordre est
 * recalculé après CHAQUE révélation, sur les seules cartes visibles de chacun (à moins de 5 cartes visibles,
 * quinte et couleur sont impossibles : comparaison par effectifs de rang). Showdown final : meilleure main de
 * 5 cartes parmi les 10, sans aucune contrainte (règle du Hold'em, pas de split Omaha).
 */
export class RoundLe10 extends RoundBase {
  readonly variant: VariantId = 'LE10';
  private s!: State10;

  constructor(ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    if (this.players.length > 5) {
      throw new RuleError('BAD_TABLE_SIZE', 'Le 10 se joue au maximum à 5 joueurs');
    }
    if (snapshot) {
      this.s = snapshot.state as State10;
    } else {
      this.cards.dealRoundRobin(10, { visibleFrom: 9 });
      // Premier révélateur : on compare les 10es cartes SEULES, As haut, couleurs sans effet
      const tenth = this.players.map((p) => ({ p, rank: this.cards.getHand(p)[9]!.card.rank as number }));
      const low = Math.min(...tenth.map((x) => x.rank));
      const first = tenth.find((x) => x.rank === low)!.p; // égalité : ordre UTG → dernier
      this.s = { next: first, reason: 'LOWEST_FIRST_CARD', reveals: 0, history: [] };
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

  /** Meilleure main de chaque joueur d'après ses seules cartes visibles (pas de plateau : 1 à 9 cartes). */
  private visibleRanks(): Record<PlayerId, HandRank> {
    const out: Record<PlayerId, HandRank> = {};
    for (const p of this.players) {
      const visible: Card[] = this.cards.getHand(p).filter((e) => e.visible).map((e) => e.card);
      out[p] = evaluatePartial(visible);
    }
    return out;
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    if (cmd.type === 'TIMEOUT') {
      this.revealFor(this.s.next!, events, true);
      return;
    }
    if (cmd.type !== 'REVEAL') throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au 10`);
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

    if (this.s.reveals === 9 * this.players.length) {
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
    let reason: NextReason10;
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
    const entries = this.players.map((player) => {
      const hand = this.handOf(player);
      return { player, hand, rank: bestOf(hand).rank };
    });
    events.push(
      publicEvent('SHOWDOWN', {
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
