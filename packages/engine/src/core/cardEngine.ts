import { ALL_CARDS, cardById, type Card } from './card';
import type { Rng } from './rng';
import { shuffleInPlace } from './shuffle';

export type PlayerId = string;

export type CardEngineErrorCode =
  | 'BAD_ARGUMENT'
  | 'UNKNOWN_PLAYER'
  | 'DECK_EXHAUSTED'
  | 'CARD_NOT_IN_HAND'
  | 'DUPLICATE_CARD'
  | 'NO_HIDDEN_CARD'
  | 'ALREADY_REVEALED'
  | 'BAD_SLOT'
  | 'INVARIANT_VIOLATED';

export class CardEngineError extends Error {
  constructor(
    readonly code: CardEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CardEngineError';
  }
}

interface Entry {
  card: Card;
  visible: boolean;
}

export interface EntrySnapshot {
  id: number;
  visible: boolean;
}

/** État sérialisable. CONTIENT DES SECRETS : réservé au serveur (persistance). */
export interface CardEngineSnapshot {
  players: PlayerId[];
  deck: number[];
  discard: number[];
  hands: Record<PlayerId, EntrySnapshot[]>;
  board: EntrySnapshot[];
  reshuffles: number;
}

export interface DealOptions {
  /** Cartes distribuées face visible (défaut : false). */
  visible?: boolean;
  /** Remélange la défausse si le paquet est épuisé (défaut : false). */
  allowReshuffle?: boolean;
}

export interface OwnHandView {
  kind: 'own';
  /** `code` vaut `null` pour une carte cachée dont la variante masque l'identité même à son propriétaire
   * (6-1, Le 10 : chacun découvre ses cartes en même temps que ses adversaires, au moment de la révélation). */
  cards: { code: string | null; visible: boolean }[];
}
export interface OpponentHandView {
  kind: 'opponent';
  shown: string[];
  hiddenCount: number;
}
/** Vue destinée à UN joueur : aucune carte cachée d'autrui, ni du paquet, ni de la défausse. */
export interface CardEngineView {
  deckCount: number;
  discardCount: number;
  /** null = emplacement du plateau encore caché. */
  board: (string | null)[];
  hands: Record<PlayerId, OwnHandView | OpponentHandView>;
}

/**
 * Moteur de cartes central, indépendant des variantes.
 * Un paquet de 52 cartes = une instance (le Hold'em de départage en crée une seconde).
 * Chaque carte est toujours dans exactement une zone : paquet, main, plateau ou défausse.
 * Primitives neutres : les règles (quand jeter, quand remélanger) sont décidées par les variantes.
 */
export class CardEngine {
  private deck: Card[];
  private discardPile: Card[] = [];
  private readonly hands = new Map<PlayerId, Entry[]>();
  private board: Entry[] = [];
  private reshuffles = 0;

  constructor(
    readonly players: readonly PlayerId[],
    private readonly rng: Rng,
    snapshot?: CardEngineSnapshot,
  ) {
    if (players.length === 0 || new Set(players).size !== players.length) {
      throw new CardEngineError('BAD_ARGUMENT', 'Liste de joueurs vide ou avec doublons');
    }
    for (const p of players) this.hands.set(p, []);
    if (snapshot) {
      this.deck = snapshot.deck.map(cardById);
      this.discardPile = snapshot.discard.map(cardById);
      for (const p of players) {
        this.hands.set(
          p,
          (snapshot.hands[p] ?? []).map((e) => ({ card: cardById(e.id), visible: e.visible })),
        );
      }
      this.board = snapshot.board.map((e) => ({ card: cardById(e.id), visible: e.visible }));
      this.reshuffles = snapshot.reshuffles;
      this.checkInvariants();
    } else {
      this.deck = shuffleInPlace([...ALL_CARDS], rng);
    }
  }

  static restore(snapshot: CardEngineSnapshot, rng: Rng): CardEngine {
    return new CardEngine(snapshot.players, rng, snapshot);
  }

  /**
   * TESTS UNIQUEMENT : paquet dont les premières cartes tirées sont `drawOrder` (dans cet ordre),
   * le reste étant mélangé. Jamais utilisé par le serveur en production.
   */
  static stacked(players: readonly PlayerId[], rng: Rng, drawOrder: readonly Card[]): CardEngine {
    const engine = new CardEngine(players, rng);
    const ids = new Set(drawOrder.map((c) => c.id));
    if (ids.size !== drawOrder.length) throw new CardEngineError('DUPLICATE_CARD', 'Paquet truqué : cartes en double');
    engine.deck = [...engine.deck.filter((c) => !ids.has(c.id)), ...[...drawOrder].reverse()];
    return engine;
  }

  // ---------- Lecture (usage serveur) ----------

  get deckCount(): number {
    return this.deck.length;
  }
  get discardCount(): number {
    return this.discardPile.length;
  }
  get reshuffleCount(): number {
    return this.reshuffles;
  }
  getHand(player: PlayerId): { card: Card; visible: boolean }[] {
    return this.handOf(player).map((e) => ({ ...e }));
  }
  getBoard(): { card: Card; visible: boolean }[] {
    return this.board.map((e) => ({ ...e }));
  }
  hiddenCount(player: PlayerId): number {
    return this.handOf(player).filter((e) => !e.visible).length;
  }

  // ---------- Distribution ----------

  /** Distribue `count` cartes à un joueur. Atomique : rien n'est modifié en cas d'erreur. */
  dealToPlayer(player: PlayerId, count: number, options: DealOptions = {}): Card[] {
    const hand = this.handOf(player);
    const cards = this.take(count, options.allowReshuffle ?? false);
    for (const card of cards) hand.push({ card, visible: options.visible ?? false });
    return cards;
  }

  /**
   * Distribution une carte à la fois, tour de table dans l'ordre des joueurs.
   * `visibleFrom` : les cartes dont l'indice (0-based) est >= visibleFrom sont face visible
   * (6-1 : `dealRoundRobin(6, { visibleFrom: 5 })`).
   */
  dealRoundRobin(count: number, options: { visibleFrom?: number; allowReshuffle?: boolean } = {}): void {
    this.assertCount(count);
    const allow = options.allowReshuffle ?? false;
    this.assertAvailable(count * this.players.length, allow);
    for (let i = 0; i < count; i++) {
      for (const p of this.players) {
        const [card] = this.take(1, allow);
        this.handOf(p).push({ card: card!, visible: options.visibleFrom !== undefined && i >= options.visibleFrom });
      }
    }
  }

  /** Ajoute `count` cartes au plateau (face visible ou cachée). */
  dealBoard(count: number, visible: boolean, allowReshuffle = false): Card[] {
    const cards = this.take(count, allowReshuffle);
    for (const card of cards) this.board.push({ card, visible });
    return cards;
  }

  // ---------- Révélation ----------

  revealBoardSlot(index: number): Card {
    const slot = this.board[index];
    if (!slot) throw new CardEngineError('BAD_SLOT', `Emplacement de plateau inexistant : ${index}`);
    if (slot.visible) throw new CardEngineError('ALREADY_REVEALED', `Emplacement ${index} déjà visible`);
    slot.visible = true;
    return slot.card;
  }

  revealHandCard(player: PlayerId, card: Card): Card {
    const entry = this.handOf(player).find((e) => e.card.id === card.id);
    if (!entry) throw new CardEngineError('CARD_NOT_IN_HAND', `${card.code} n'est pas dans la main de ${player}`);
    if (entry.visible) throw new CardEngineError('ALREADY_REVEALED', `${card.code} est déjà visible`);
    entry.visible = true;
    return entry.card;
  }

  /** Retourne la première carte cachée, dans l'ordre de distribution (6-1). */
  revealNextHiddenCard(player: PlayerId): Card {
    const entry = this.handOf(player).find((e) => !e.visible);
    if (!entry) throw new CardEngineError('NO_HIDDEN_CARD', `${player} n'a plus de carte cachée`);
    entry.visible = true;
    return entry.card;
  }

  /** Showdown : toute la main devient visible. */
  revealAllHand(player: PlayerId): Card[] {
    const hand = this.handOf(player);
    for (const e of hand) e.visible = true;
    return hand.map((e) => e.card);
  }

  // ---------- Défausse ----------

  /** Retire les cartes de la main et les place dans la défausse (secrète). Atomique. */
  discard(player: PlayerId, cards: readonly Card[]): void {
    const hand = this.handOf(player);
    const ids = new Set<number>();
    for (const c of cards) {
      if (ids.has(c.id)) throw new CardEngineError('DUPLICATE_CARD', `${c.code} désignée deux fois`);
      ids.add(c.id);
      if (!hand.some((e) => e.card.id === c.id)) {
        throw new CardEngineError('CARD_NOT_IN_HAND', `${c.code} n'est pas dans la main de ${player}`);
      }
    }
    const kept = hand.filter((e) => !ids.has(e.card.id));
    const removed = hand.filter((e) => ids.has(e.card.id));
    hand.length = 0;
    hand.push(...kept);
    for (const e of removed) this.discardPile.push(e.card);
  }

  // ---------- Vues ----------

  /** Projection pour un joueur (ou `null` = spectateur). Seule sortie autorisée vers un client. */
  projectForPlayer(viewer: PlayerId | null): CardEngineView {
    const hands: CardEngineView['hands'] = {};
    for (const [p, entries] of this.hands) {
      if (p === viewer) {
        hands[p] = { kind: 'own', cards: entries.map((e) => ({ code: e.card.code, visible: e.visible })) };
      } else {
        hands[p] = {
          kind: 'opponent',
          shown: entries.filter((e) => e.visible).map((e) => e.card.code),
          hiddenCount: entries.filter((e) => !e.visible).length,
        };
      }
    }
    return {
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      board: this.board.map((s) => (s.visible ? s.card.code : null)),
      hands,
    };
  }

  // ---------- Persistance et invariants ----------

  snapshot(): CardEngineSnapshot {
    const hands: Record<PlayerId, EntrySnapshot[]> = {};
    for (const [p, entries] of this.hands) hands[p] = entries.map((e) => ({ id: e.card.id, visible: e.visible }));
    return {
      players: [...this.players],
      deck: this.deck.map((c) => c.id),
      discard: this.discardPile.map((c) => c.id),
      hands,
      board: this.board.map((e) => ({ id: e.card.id, visible: e.visible })),
      reshuffles: this.reshuffles,
    };
  }

  /** Invariant de conservation : 52 cartes, toutes distinctes, chacune dans une seule zone. */
  checkInvariants(): void {
    const seen = new Set<number>();
    const add = (c: Card): void => {
      if (seen.has(c.id)) throw new CardEngineError('INVARIANT_VIOLATED', `Carte en double : ${c.code}`);
      seen.add(c.id);
    };
    this.deck.forEach(add);
    this.discardPile.forEach(add);
    this.board.forEach((e) => add(e.card));
    for (const entries of this.hands.values()) entries.forEach((e) => add(e.card));
    if (seen.size !== 52) throw new CardEngineError('INVARIANT_VIOLATED', `${seen.size} cartes au lieu de 52`);
  }

  // ---------- Interne ----------

  private handOf(player: PlayerId): Entry[] {
    const hand = this.hands.get(player);
    if (!hand) throw new CardEngineError('UNKNOWN_PLAYER', `Joueur inconnu : ${player}`);
    return hand;
  }

  private assertCount(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new CardEngineError('BAD_ARGUMENT', `Nombre de cartes invalide : ${count}`);
  }

  private assertAvailable(count: number, allowReshuffle: boolean): void {
    const available = this.deck.length + (allowReshuffle ? this.discardPile.length : 0);
    if (count > available) {
      throw new CardEngineError('DECK_EXHAUSTED', `${count} cartes demandées, ${available} disponibles`);
    }
  }

  /** Tire depuis le paquet. La défausse n'est remélangée que si le paquet est vide au moment du besoin. */
  private take(count: number, allowReshuffle: boolean): Card[] {
    this.assertCount(count);
    this.assertAvailable(count, allowReshuffle);
    const out: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) this.reshuffleDiscards();
      out.push(this.deck.pop()!);
    }
    return out;
  }

  private reshuffleDiscards(): void {
    this.deck = shuffleInPlace(this.discardPile, this.rng);
    this.discardPile = [];
    this.reshuffles++;
  }
}
