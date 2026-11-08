import { parseCard } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { categoryOf, combinationCodes, evaluatePartial } from '../evaluation/handEvaluator';
import { evaluateHoldem } from '../evaluation/holdemEvaluator';
import { rankGroups } from '../evaluation/ranking';
import { freshSel, publicEvent, RoundBase, type PhaseSel } from './roundBase';
import {
  RuleError,
  type RoundCommand,
  type RoundContext,
  type RoundEvent,
  type RoundSnapshot,
  type VariantId,
} from './types';

type Status = 'ACTIVE' | 'FOLDED';

interface DiscardState {
  step: 1 | 2; // défausse en cours : après le flop (1) ou après le turn (2)
  sel: PhaseSel;
  status: Record<PlayerId, Status>;
}

const CONFIG = {
  AVIATION: { start: 4, discard: 1 },
  AVIA_6: { start: 6, discard: 2 },
} as const;

/**
 * Aviation (4 cartes, jeter 1 puis 1) et Avia 6 (6 cartes, jeter 2 puis 2) : Hold'em avec 2 cartes restantes.
 * Défausse obligatoire et exacte. Minuteur (60 s, serveur) : sélection absente ou incomplète = main FOLDÉE
 * (hors manche jusqu'à la fin, aucun gain, cartes jamais révélées).
 */
export class HoldemDiscardRound extends RoundBase {
  readonly variant: VariantId;
  private readonly discardCount: number;
  private s!: DiscardState;

  constructor(variant: 'AVIATION' | 'AVIA_6', ctx: RoundContext, snapshot?: RoundSnapshot) {
    super(ctx, snapshot);
    this.variant = variant;
    this.discardCount = CONFIG[variant].discard;
    if (snapshot) {
      this.s = snapshot.state as DiscardState;
    } else {
      this.cards.dealRoundRobin(CONFIG[variant].start);
      this.cards.dealBoard(5, false); // flop, turn, river : cachés jusqu'à leur révélation
      for (const slot of [0, 1, 2]) this.cards.revealBoardSlot(slot); // flop
      const status: Record<PlayerId, Status> = {};
      for (const p of this.players) status[p] = 'ACTIVE';
      this.s = { step: 1, sel: freshSel(this.players), status };
    }
  }

  phase(): string {
    return this.outcome ? 'DONE' : `DISCARD_${this.s.step}`;
  }

  private active(): PlayerId[] {
    return this.players.filter((p) => this.s.status[p] === 'ACTIVE');
  }

  awaiting(): PlayerId[] {
    return this.outcome ? [] : this.active().filter((p) => !this.s.sel.validated.includes(p));
  }

  /** Avertissement neutre à 10 s pour qui n'a pas terminé sa sélection. */
  warnings(): PlayerId[] {
    return this.awaiting().filter((p) => this.s.sel.drafts[p]!.length < this.discardCount);
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    const eligible = (p: PlayerId): boolean => this.s.status[p] === 'ACTIVE';
    switch (cmd.type) {
      case 'SELECT': {
        this.assertOpenForSelection(this.s.sel, cmd.player, eligible);
        const cards = this.parseSelection(cmd.player, cmd.cards, this.discardCount);
        this.s.sel.drafts[cmd.player] = cards.map((c) => c.code);
        return;
      }
      case 'VALIDATE': {
        this.assertOpenForSelection(this.s.sel, cmd.player, eligible);
        if (this.s.sel.drafts[cmd.player]!.length !== this.discardCount) {
          throw new RuleError('INCOMPLETE_SELECTION', `Vous devez jeter exactement ${this.discardCount} carte(s)`);
        }
        this.s.sel.validated.push(cmd.player);
        if (this.awaiting().length === 0) this.closeDiscard(events);
        return;
      }
      case 'TIMEOUT':
        this.closeDiscard(events);
        return;
      default:
        throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue en ${this.variant}`);
    }
  }

  private closeDiscard(events: RoundEvent[]): void {
    for (const player of this.active()) {
      const draft = this.s.sel.drafts[player]!;
      if (draft.length === this.discardCount) {
        // sélection complète (validée ou non) : la défausse est appliquée
        this.cards.discard(player, draft.map(parseCard));
      } else {
        this.s.status[player] = 'FOLDED';
        events.push(publicEvent('PLAYER_FOLDED', { player, phase: this.phase() }));
      }
    }
    const active = this.active();
    if (active.length === 0) {
      this.finish({ kind: 'NO_WINNER', reason: 'ALL_FOLDED' }, events);
      return;
    }
    if (active.length === 1) {
      this.finish({ kind: 'WINNER', winner: active[0]!, points: 1, detail: { byFold: true } }, events);
      return;
    }
    if (this.s.step === 1) {
      const card = this.cards.revealBoardSlot(3);
      this.s.step = 2;
      this.s.sel = freshSel(this.players);
      events.push(publicEvent('BOARD_REVEALED', { slot: 3, card: card.code }));
    } else {
      const card = this.cards.revealBoardSlot(4);
      events.push(publicEvent('BOARD_REVEALED', { slot: 4, card: card.code }));
      this.showdown(active, events);
    }
  }

  private showdown(active: PlayerId[], events: RoundEvent[]): void {
    const board = this.boardCards();
    const entries = active.map((player) => {
      const hand = this.cards.revealAllHand(player);
      return { player, hand, rank: evaluateHoldem(hand, board).rank };
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
      step: this.s.step,
      discardCount: this.discardCount,
      status: { ...this.s.status },
      validated: [...this.s.sel.validated],
      yourDraft: viewer && !this.outcome ? [...(this.s.sel.drafts[viewer] ?? [])] : [],
      // Assistance : combinaison des cartes que le joueur GARDERAIT (main − brouillon de défausse) combinées
      // au plateau déjà révélé. Jamais de carte cachée dans le calcul.
      assistCategory:
        this.assistance && viewer && !this.outcome && this.s.status[viewer] === 'ACTIVE'
          ? categoryOf(evaluatePartial([...this.keptCards(viewer), ...this.visibleBoardCards()]))
          : null,
      // Assistance : cartes (main gardée et plateau révélé) qui forment cette combinaison.
      assistCards:
        this.assistance && viewer && !this.outcome && this.s.status[viewer] === 'ACTIVE'
          ? combinationCodes([...this.keptCards(viewer), ...this.visibleBoardCards()])
          : [],
    };
  }

  /** Cartes de la main que `player` garderait compte tenu de son brouillon de défausse actuel. */
  private keptCards(player: PlayerId) {
    const discard = new Set(this.s.sel.drafts[player] ?? []);
    return this.handOf(player).filter((c) => !discard.has(c.code));
  }
}
