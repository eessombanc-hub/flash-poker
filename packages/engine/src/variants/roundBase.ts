import { parseCard, type Card } from '../core/card';
import { CardEngine, type PlayerId } from '../core/cardEngine';
import {
  RuleError,
  type Round,
  type RoundCommand,
  type RoundContext,
  type RoundEvent,
  type RoundResult,
  type RoundSnapshot,
  type RoundView,
  type VariantId,
} from './types';

/** Sélection simultanée : brouillons (codes de cartes) + joueurs ayant validé. */
export interface PhaseSel {
  drafts: Record<PlayerId, string[]>;
  validated: PlayerId[];
}

export function freshSel(players: readonly PlayerId[]): PhaseSel {
  const drafts: Record<PlayerId, string[]> = {};
  for (const p of players) drafts[p] = [];
  return { drafts, validated: [] };
}

export function publicEvent(type: string, data: Record<string, unknown>): RoundEvent {
  return { type, visibility: 'PUBLIC', data };
}

export abstract class RoundBase implements Round {
  abstract readonly variant: VariantId;
  readonly players: readonly PlayerId[];
  protected cards: CardEngine;
  protected outcome: RoundResult | null;
  /** Partie « avec assistance » : voir `RoundContext.assistance`. */
  protected readonly assistance: boolean;

  protected constructor(ctx: RoundContext, snapshot?: RoundSnapshot) {
    if (ctx.players.length < 2 || ctx.players.length > 6 || new Set(ctx.players).size !== ctx.players.length) {
      throw new RuleError('BAD_TABLE_SIZE', 'Une manche se joue de 2 à 6 joueurs distincts');
    }
    this.players = [...ctx.players];
    this.assistance = ctx.assistance ?? false;
    if (snapshot) {
      this.cards = CardEngine.restore(snapshot.cards, ctx.rng);
      this.outcome = snapshot.outcome;
    } else {
      this.cards = ctx.stackedDeck
        ? CardEngine.stacked(this.players, ctx.rng, ctx.stackedDeck.map(parseCard))
        : new CardEngine(this.players, ctx.rng);
      this.outcome = null;
    }
  }

  abstract phase(): string;
  phaseKey(): string {
    return this.phase();
  }
  abstract awaiting(): PlayerId[];
  abstract warnings(): PlayerId[];
  protected abstract handle(cmd: RoundCommand, events: RoundEvent[]): void;
  protected abstract stateForSnapshot(): unknown;
  protected abstract infoFor(viewer: PlayerId | null): Record<string, unknown>;

  apply(cmd: RoundCommand): RoundEvent[] {
    if (this.outcome) throw new RuleError('ROUND_OVER', 'La manche est terminée');
    const events: RoundEvent[] = [];
    this.handle(cmd, events);
    return events;
  }

  result(): RoundResult | null {
    return this.outcome;
  }

  view(viewer: PlayerId | null): RoundView {
    const cards = this.cards.projectForPlayer(viewer);
    if (viewer && this.maskOwnHiddenCards()) {
      const own = cards.hands[viewer];
      if (own && own.kind === 'own') {
        cards.hands[viewer] = { kind: 'own', cards: own.cards.map((c) => (c.visible ? c : { code: null, visible: false })) };
      }
    }
    return {
      variant: this.variant,
      phase: this.phase(),
      awaiting: this.awaiting(),
      cards,
      info: this.infoFor(viewer),
      result: this.outcome,
    };
  }

  /** 6-1 et Le 10 : le propriétaire ne voit pas non plus ses cartes encore cachées — il les découvre en même
   * temps que ses adversaires, au moment de la révélation. Faux pour toutes les autres variantes (l'identité
   * des cartes non encore jouées reste nécessaire au joueur pour faire son choix). */
  protected maskOwnHiddenCards(): boolean {
    return false;
  }

  snapshot(): RoundSnapshot {
    return {
      variant: this.variant,
      players: [...this.players],
      cards: this.cards.snapshot(),
      state: JSON.parse(JSON.stringify(this.stateForSnapshot())),
      outcome: this.outcome ? JSON.parse(JSON.stringify(this.outcome)) : null,
    };
  }

  checkInvariants(): void {
    this.cards.checkInvariants();
  }

  // ---------- Aides communes ----------

  protected finish(result: RoundResult, events: RoundEvent[]): void {
    this.outcome = result;
    events.push(publicEvent('ROUND_ENDED', { result }));
  }

  protected assertPlayer(player: PlayerId): void {
    if (!this.players.includes(player)) throw new RuleError('UNKNOWN_PLAYER', `Joueur inconnu. ${player}`);
  }

  /** Cartes de la main du joueur (usage serveur). */
  protected handOf(player: PlayerId): Card[] {
    return this.cards.getHand(player).map((e) => e.card);
  }

  /** Valide une sélection : au plus `max` cartes, distinctes, présentes dans la main. */
  protected parseSelection(player: PlayerId, codes: readonly string[], max: number): Card[] {
    this.assertPlayer(player);
    if (codes.length > max) throw new RuleError('TOO_MANY_CARDS', `${max} carte(s) au maximum`);
    const hand = this.handOf(player);
    const seen = new Set<number>();
    return codes.map((code) => {
      let card: Card;
      try {
        card = parseCard(code);
      } catch {
        throw new RuleError('BAD_CARD', `Carte invalide. ${code}`);
      }
      if (seen.has(card.id)) throw new RuleError('DUPLICATE_CARD', `${code} désignée deux fois`);
      seen.add(card.id);
      if (!hand.some((c) => c.id === card.id)) throw new RuleError('CARD_NOT_IN_HAND', `${code} n'est pas dans votre main`);
      return card;
    });
  }

  protected assertOpenForSelection(sel: PhaseSel, player: PlayerId, eligible: (p: PlayerId) => boolean): void {
    this.assertPlayer(player);
    if (!eligible(player)) throw new RuleError('NOT_AWAITED', `${player} n'est pas attendu`);
    if (sel.validated.includes(player)) throw new RuleError('ALREADY_VALIDATED', `${player} a déjà validé`);
  }

  protected boardCards(): Card[] {
    return this.cards.getBoard().map((s) => s.card);
  }

  /** Cartes du plateau déjà révélées uniquement — jamais les cases encore cachées (utilisé par l'assistance,
   * pour ne jamais laisser deviner une carte future à partir de la combinaison affichée). */
  protected visibleBoardCards(): Card[] {
    return this.cards
      .getBoard()
      .filter((s) => s.visible)
      .map((s) => s.card);
  }
}
