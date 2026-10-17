import { parseCard } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { evaluate5, categoryOf } from '../evaluation/handEvaluator';
import { rankGroups } from '../evaluation/ranking';
import { freshSel, publicEvent, RoundBase, type PhaseSel } from './roundBase';
import {
  isVariantAvailable,
  RuleError,
  type RoundCommand,
  type RoundContext,
  type RoundEvent,
  type RoundSnapshot,
  type VariantId,
} from './types';

interface ClosedState {
  changeNo: number; // change en cours (1 ou 2)
  sel: PhaseSel;
}

/**
 * Poker fermé, 1 ou 2 changes. 5 cartes privées ; à chaque change, chaque joueur jette de 0 à 3 cartes
 * et reçoit exactement autant de nouvelles cartes. Changes simultanés et secrets.
 * Minuteur (60 s, géré par le serveur) : sans action, 0 carte changée. Personne ne se couche.
 */
export class ClosedRound extends RoundBase {
  readonly variant: VariantId;
  private readonly totalChanges: 1 | 2;
  private s!: ClosedState;

  constructor(variant: 'CLOSED_1' | 'CLOSED_2', ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    this.variant = variant;
    this.totalChanges = variant === 'CLOSED_1' ? 1 : 2;
    if (!isVariantAvailable(variant, this.players.length)) {
      throw new RuleError('VARIANT_UNAVAILABLE', `${variant} n'est pas jouable à ${this.players.length} joueurs`);
    }
    if (snapshot) {
      this.s = snapshot.state as ClosedState;
    } else {
      this.cards.dealRoundRobin(5);
      this.s = { changeNo: 1, sel: freshSel(this.players) };
    }
  }

  phase(): string {
    return this.outcome ? 'DONE' : `CHANGE_${this.s.changeNo}`;
  }

  awaiting(): PlayerId[] {
    return this.outcome ? [] : this.players.filter((p) => !this.s.sel.validated.includes(p));
  }

  /** Pas d'avertissement au Fermé : ne rien changer est un choix légal. */
  warnings(): PlayerId[] {
    return [];
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    switch (cmd.type) {
      case 'SELECT': {
        this.assertOpenForSelection(this.s.sel, cmd.player, () => true);
        const cards = this.parseSelection(cmd.player, cmd.cards, 3);
        this.s.sel.drafts[cmd.player] = cards.map((c) => c.code);
        return;
      }
      case 'VALIDATE': {
        this.assertOpenForSelection(this.s.sel, cmd.player, () => true);
        this.s.sel.validated.push(cmd.player);
        if (this.s.sel.validated.length === this.players.length) this.closeChange(events);
        return;
      }
      case 'TIMEOUT':
        this.closeChange(events);
        return;
      default:
        throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au poker fermé`);
    }
  }

  /**
   * Résolution simultanée. Décision validée (a) : on tire les remplacements AVANT de jeter,
   * de sorte que seules les défausses des changes PRÉCÉDENTS puissent être remélangées si le paquet est épuisé.
   */
  private closeChange(events: RoundEvent[]): void {
    const chosen = this.players.map((p) => ({ player: p, cards: this.s.sel.drafts[p]!.map(parseCard) }));
    for (const { player, cards } of chosen) {
      if (cards.length === 0) continue;
      const drawn = this.cards.dealToPlayer(player, cards.length, { allowReshuffle: true });
      events.push({
        type: 'CHANGE_APPLIED',
        visibility: 'PLAYER',
        audience: player,
        data: { received: drawn.map((c) => c.code) },
      });
    }
    for (const { player, cards } of chosen) this.cards.discard(player, cards);

    this.s.changeNo++;
    if (this.s.changeNo > this.totalChanges) {
      this.showdown(events);
    } else {
      this.s.sel = freshSel(this.players);
      events.push(publicEvent('CHANGE_PHASE_STARTED', { change: this.s.changeNo }));
    }
  }

  private showdown(events: RoundEvent[]): void {
    const entries = this.players.map((player) => {
      const hand = this.cards.revealAllHand(player);
      return { player, hand, rank: evaluate5(hand) };
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

  protected stateForSnapshot(): unknown {
    return this.s;
  }

  protected infoFor(viewer: PlayerId | null): Record<string, unknown> {
    return {
      change: Math.min(this.s.changeNo, this.totalChanges),
      totalChanges: this.totalChanges,
      validated: [...this.s.sel.validated],
      yourDraft: viewer && !this.outcome ? [...(this.s.sel.drafts[viewer] ?? [])] : [],
      // Assistance : simple indicateur du nom de la combinaison ACTUELLE (avant changement), jamais de suggestion.
      assistCategory: this.assistance && viewer && !this.outcome ? categoryOf(evaluate5(this.handOf(viewer))) : null,
    };
  }
}
