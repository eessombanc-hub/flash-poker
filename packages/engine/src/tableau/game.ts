import { ALL_CARDS } from '../core/card';
import { shuffleInPlace } from '../core/shuffle';
import type { Rng } from '../core/rng';
import { sha256Hex } from '../blackjack/sha256';
import { compareColumns, evaluateColumn, type ColumnHand } from './evaluator';

/**
 * LE TABLEAU — règles et distribution vérifiable.
 *
 * Deux joueurs, 52 cartes, aucun doublon : chacun reçoit 26 cartes = 5 cartes de départ (une par colonne) + un paquet
 * personnel de 21 cartes. Il reste 20 places libres par joueur (5 colonnes × 5 cartes − 5 cartes de départ) : on pioche donc
 * 20 fois, la 21e carte du paquet ne peut jamais être jouée et aucune carte ne peut être défaussée.
 * Une carte placée est définitive. La partie se termine après 20 placements par joueur (40 coups).
 */
export const COLUMNS = 5;
export const COLUMN_SIZE = 5;
export const DECK_SIZE = 21;
export const PLAYABLE = 20;
export const TURN_MS = 30_000;
export const TOTAL_PLIES = 2 * PLAYABLE;
/**
 * « Tableau 5 cartes » : comme au Tableau, une carte de départ ouvre chaque colonne, et chaque joueur reçoit en plus une
 * main de 5 cartes prélevée sur son paquet (qui passe de 21 à 16 cartes). On pioche 15 fois (la 16e carte reste dans le
 * paquet), puis la main termine les colonnes : 15 + 5 = 20 placements, comme en variante classique.
 */
export const HAND_SIZE = 5;
export const HAND_PLAYABLE = PLAYABLE - HAND_SIZE;
export type TableauVariant = 'classic' | 'hand5';
export const TABLEAU_VARIANTS: readonly TableauVariant[] = ['classic', 'hand5'];
export const VARIANT_LABELS_FR: Record<TableauVariant, string> = { classic: 'Le Tableau', hand5: 'Tableau 5 cartes' };

const DOMAIN = 'flashpoker-tableau-v1';

export type Seat = 0 | 1;

export function tableauCommitment(seed: string): string {
  return sha256Hex(`${DOMAIN}:commit:${seed}`);
}
export function verifyTableauSeed(seed: string, commitment: string): boolean {
  return tableauCommitment(seed) === commitment;
}

/** Flux d'entiers uniformes dérivé de la graine (SHA-256 en mode compteur, rejet des valeurs biaisées). */
class SeedStream implements Rng {
  private counter = 0;
  private words: number[] = [];
  constructor(private readonly seed: string) {}
  private nextWord(): number {
    if (this.words.length === 0) {
      const hex = sha256Hex(`${DOMAIN}:stream:${this.seed}:${this.counter++}`);
      for (let i = 0; i < 64; i += 8) this.words.push(parseInt(hex.slice(i, i + 8), 16));
    }
    return this.words.shift()!;
  }
  int(maxExclusive: number): number {
    const limit = 0x100000000 - (0x100000000 % maxExclusive);
    for (;;) {
      const w = this.nextWord();
      if (w < limit) return w % maxExclusive;
    }
  }
}

export interface TableauDeal {
  /** Joueur qui joue en premier (tiré de la graine). */
  first: Seat;
  /** Pour chaque siège : 5 cartes de départ et paquet de 21 cartes (la carte d'indice 0 est piochée en premier). */
  initial: [string[], string[]];
  deck: [string[], string[]];
}

/**
 * Ordre du mélange (Fisher-Yates sur les 52 codes, flux dérivé de la graine) puis découpe :
 * [0..4] départ du siège 0 · [5..9] départ du siège 1 · [10..30] paquet du siège 0 · [31..51] paquet du siège 1.
 * Le premier joueur est le tirage suivant du même flux.
 */
export function dealFromSeed(seed: string): TableauDeal {
  const stream = new SeedStream(seed);
  const codes = shuffleInPlace(
    ALL_CARDS.map((c) => c.code),
    stream,
  );
  const first = stream.int(2) as Seat;
  return {
    first,
    initial: [codes.slice(0, 5), codes.slice(5, 10)],
    deck: [codes.slice(10, 31), codes.slice(31, 52)],
  };
}

export type TableauErrorCode = 'FINISHED' | 'NOT_YOUR_TURN' | 'BAD_COLUMN' | 'COLUMN_FULL' | 'BAD_CARD';
export class TableauError extends Error {
  constructor(
    public readonly code: TableauErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TableauError';
  }
}

export interface Placement {
  seat: Seat;
  col: number;
  card: string;
  /** Vrai si le placement a été imposé par l'expiration du délai. */
  auto: boolean;
}

export interface ColumnVerdict {
  a: ColumnHand;
  b: ColumnHand;
  /** Siège vainqueur de la colonne, null pour une égalité parfaite. */
  winner: Seat | null;
}
export interface TableauResult {
  columns: ColumnVerdict[];
  /** Colonnes gagnées par chaque siège. */
  score: [number, number];
  ties: number;
  /** Siège vainqueur, null pour un match nul. */
  winner: Seat | null;
}

/** Décision finale : 3 colonnes ou plus gagnent la partie ; sinon (dont 2-2 + une égalité) c'est un match nul. */
export function decide(a: number, b: number): Seat | null {
  if (a >= 3) return 0;
  if (b >= 3) return 1;
  return null;
}

export interface Provisional {
  /** Colonnes déjà complètes des deux côtés (donc tranchées). */
  decided: number;
  score: [number, number];
  ties: number;
}

export interface TableauView {
  variant: TableauVariant;
  /** Votre main (Tableau 5 cartes), visible de vous seul ; vide en variante classique. */
  hand: string[];
  /** Cartes en main de chaque siège (seul le nombre est public). */
  handCount: [number, number];
  /** Pioches restantes de chaque siège (la dernière carte du paquet ne se pioche jamais). */
  pile: [number, number];
  you: Seat;
  first: Seat;
  turn: Seat | null;
  finished: boolean;
  /** Coups déjà joués (0..40). */
  ply: number;
  /** columns[siège][colonne] = cartes placées, de haut en bas. */
  columns: string[][][];
  /** Carte piochée par VOUS (visible de vous seul), null si ce n'est pas votre tour. */
  yourCard: string | null;
  /** Placements restants à jouer par siège (20 → 0). */
  remaining: [number, number];
  placed: [number, number];
  /** Colonnes où votre carte peut être posée. */
  legal: number[];
  provisional: Provisional;
}

export class TableauGame {
  readonly deal: TableauDeal;
  readonly log: Placement[] = [];
  private cols: string[][][];
  private hands: [string[], string[]];
  private placedCount: [number, number] = [0, 0];
  private draws: [number, number] = [0, 0];

  constructor(
    readonly seed: string,
    readonly variant: TableauVariant = 'classic',
  ) {
    this.deal = dealFromSeed(seed);
    if (variant === 'classic') {
      this.cols = [0, 1].map((s) => this.deal.initial[s]!.map((c) => [c]));
      this.hands = [[], []];
    } else {
      this.cols = [0, 1].map((s) => this.deal.initial[s]!.map((c) => [c]));
      this.hands = [this.deal.deck[0]!.slice(0, HAND_SIZE), this.deal.deck[1]!.slice(0, HAND_SIZE)];
    }
  }

  /** Nombre de pioches possibles par joueur (la carte suivante reste dans le paquet). */
  get playable(): number {
    return this.variant === 'classic' ? PLAYABLE : HAND_PLAYABLE;
  }
  private drawPile(seat: Seat): readonly string[] {
    return this.variant === 'classic' ? this.deal.deck[seat]! : this.deal.deck[seat]!.slice(HAND_SIZE);
  }

  static replay(seed: string, log: readonly (Pick<Placement, 'seat' | 'col'> & { card?: string })[], variant: TableauVariant = 'classic'): TableauGame {
    const g = new TableauGame(seed, variant);
    for (const p of log) g.place(p.seat, p.col, false, p.card);
    return g;
  }

  /** Placements par joueur : 20 dans les deux variantes (en 5 cartes : 15 pioches + les 5 cartes de la main). */
  get perPlayer(): number {
    return PLAYABLE;
  }
  get totalPlies(): number {
    return 2 * this.perPlayer;
  }
  get ply(): number {
    return this.log.length;
  }
  get finished(): boolean {
    return this.log.length >= this.totalPlies;
  }
  get turn(): Seat | null {
    return this.finished ? null : (((this.deal.first + this.log.length) % 2) as Seat);
  }
  get placed(): [number, number] {
    return [...this.placedCount];
  }

  /** Carte piochée par `seat` à son tour ; null hors de son tour ou quand il n'y a plus rien à piocher (la 21e carte reste dans le paquet). */
  drawn(seat: Seat): string | null {
    if (this.turn !== seat || this.draws[seat] >= this.playable) return null;
    return this.drawPile(seat)[this.draws[seat]] ?? null;
  }
  handOf(seat: Seat): string[] {
    return [...this.hands[seat]];
  }

  columnsOf(seat: Seat): string[][] {
    return this.cols[seat]!.map((c) => [...c]);
  }

  legalColumns(seat: Seat): number[] {
    if (this.turn !== seat) return [];
    return this.cols[seat]!.map((c, i) => (c.length < COLUMN_SIZE ? i : -1)).filter((i) => i >= 0);
  }

  /** Cartes jouables à ce tour : la carte piochée et, en variante 5 cartes, la main. */
  options(seat: Seat): string[] {
    if (this.turn !== seat) return [];
    const d = this.drawn(seat);
    return this.variant === 'classic' ? (d ? [d] : []) : [...(d ? [d] : []), ...this.hands[seat]];
  }

  /** Placement automatique (délai dépassé) : la carte piochée, sinon la première de la main, dans la première colonne libre. */
  autoColumn(seat: Seat): number {
    const legal = this.legalColumns(seat);
    if (legal.length === 0) throw new TableauError('FINISHED', 'Aucune colonne disponible');
    return legal[0]!;
  }
  autoCard(seat: Seat): string {
    return this.options(seat)[0]!;
  }

  place(seat: Seat, col: number, auto = false, card?: string): Placement {
    if (this.finished) throw new TableauError('FINISHED', 'La partie est terminée');
    if (this.turn !== seat) throw new TableauError('NOT_YOUR_TURN', "Ce n'est pas votre tour");
    if (!Number.isInteger(col) || col < 0 || col >= COLUMNS) throw new TableauError('BAD_COLUMN', 'Colonne inconnue');
    const column = this.cols[seat]![col]!;
    if (column.length >= COLUMN_SIZE) throw new TableauError('COLUMN_FULL', 'Cette colonne est déjà complète');
    const drawn = this.drawn(seat);
    const played = card ?? this.options(seat)[0];
    if (played === undefined || !this.options(seat).includes(played)) throw new TableauError('BAD_CARD', 'Cette carte n’est pas jouable');
    if (played !== drawn) {
      // Carte de la main : elle quitte la main, la carte piochée la remplace.
      const h = this.hands[seat];
      h.splice(h.indexOf(played), 1);
      if (drawn) h.push(drawn);
    }
    if (drawn) this.draws[seat]++;
    column.push(played);
    this.placedCount[seat]++;
    const p: Placement = { seat, col, card: played, auto };
    this.log.push(p);
    return p;
  }

  provisional(): Provisional {
    const score: [number, number] = [0, 0];
    let ties = 0;
    let decided = 0;
    for (let c = 0; c < COLUMNS; c++) {
      const a = this.cols[0]![c]!;
      const b = this.cols[1]![c]!;
      if (a.length < COLUMN_SIZE || b.length < COLUMN_SIZE) continue;
      decided++;
      const cmp = compareColumns(a, b);
      if (cmp > 0) score[0]++;
      else if (cmp < 0) score[1]++;
      else ties++;
    }
    return { decided, score, ties };
  }

  /** Résultat final ; null tant que la partie n'est pas terminée. */
  result(): TableauResult | null {
    if (!this.finished) return null;
    const columns: ColumnVerdict[] = [];
    const score: [number, number] = [0, 0];
    let ties = 0;
    for (let c = 0; c < COLUMNS; c++) {
      const a = evaluateColumn(this.cols[0]![c]!);
      const b = evaluateColumn(this.cols[1]![c]!);
      const winner: Seat | null = a.rank > b.rank ? 0 : a.rank < b.rank ? 1 : null;
      if (winner === null) ties++;
      else score[winner]++;
      columns.push({ a, b, winner });
    }
    return { columns, score, ties, winner: decide(score[0], score[1]) };
  }

  /** Vue d'un siège : jamais le paquet ni la main de l'adversaire, ni sa carte piochée, ni vos cartes à venir. */
  view(you: Seat): TableauView {
    return {
      variant: this.variant,
      hand: this.handOf(you),
      handCount: [this.hands[0].length, this.hands[1].length],
      pile: [this.playable - this.draws[0], this.playable - this.draws[1]],
      you,
      first: this.deal.first,
      turn: this.turn,
      finished: this.finished,
      ply: this.ply,
      columns: [this.columnsOf(0), this.columnsOf(1)],
      yourCard: this.drawn(you),
      remaining: [this.perPlayer - this.placedCount[0], this.perPlayer - this.placedCount[1]],
      placed: this.placed,
      legal: this.legalColumns(you),
      provisional: this.provisional(),
    };
  }

  /** Après la partie seulement : de quoi rejouer et contrôler le mélange (graine, ordre des 52 cartes). */
  reveal(): { seed: string; commitment: string; order: string[] } | null {
    if (!this.finished) return null;
    const d = this.deal;
    return { seed: this.seed, commitment: tableauCommitment(this.seed), order: [...d.initial[0], ...d.initial[1], ...d.deck[0], ...d.deck[1]] };
  }
}

/** Contrôle indépendant d'une partie terminée : graine conforme à l'engagement, 52 cartes distinctes, mélange reproductible. */
export function verifyTableauReveal(r: { seed: string; commitment: string; order: readonly string[] }): boolean {
  if (!verifyTableauSeed(r.seed, r.commitment)) return false;
  const d = dealFromSeed(r.seed);
  const expected = [...d.initial[0], ...d.initial[1], ...d.deck[0], ...d.deck[1]];
  return expected.length === 52 && new Set(expected).size === 52 && expected.every((c, i) => c === r.order[i]);
}
