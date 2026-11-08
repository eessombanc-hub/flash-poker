import type { Card, Suit } from '../core/card';
import { ALL_CARDS } from '../core/card';
import type { Rng } from '../core/rng';
import { shuffleInPlace } from '../core/shuffle';
import { evaluate5 } from '../evaluation/handEvaluator';
import { cardOf, describePartial } from './evaluator';
import { COLUMNS, COLUMN_SIZE, decide, type TableauView } from './game';

/**
 * LE TABLEAU — intelligence artificielle.
 * Équité : l'IA ne reçoit que la `TableauView` de son siège (ses colonnes, celles de l'adversaire, sa carte piochée).
 * Elle ignore le paquet adverse et ses propres cartes à venir ; elle ne connaît que l'ensemble des cartes non vues.
 *
 *  - Débutant      : pose une carte à côté d'une carte de même valeur quand c'est possible, sinon remplit les colonnes
 *                    de gauche à droite ; se trompe volontairement une fois sur trois.
 *  - Intermédiaire : estime la force future de chaque colonne (paires, brelans, tirages couleur et quinte) d'après les
 *                    cartes encore non vues, et place la carte là où le gain est le plus grand ; une carte inutile
 *                    va dans la colonne la plus faible (colonne « sacrifiée »).
 *  - Expert        : simule des centaines de fins de partie plausibles (cartes non vues tirées au hasard, adversaire
 *                    jouant de façon raisonnable) et choisit la colonne qui maximise la probabilité de gagner au moins
 *                    trois colonnes. Le temps de réflexion est borné.
 */
export type AiLevel = 'beginner' | 'intermediate' | 'expert';
export const AI_LEVELS: readonly AiLevel[] = ['beginner', 'intermediate', 'expert'];
export const AI_LABELS_FR: Record<AiLevel, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Expert' };

export interface AiOptions {
  rng: Rng;
  /** Expert : plafond de temps de réflexion (ms). Défaut 350. */
  budgetMs?: number;
  /** Expert : nombre maximal de simulations. Défaut 240. */
  maxSims?: number;
  /** Débutant : probabilité d'un coup au hasard. Défaut 1/3. */
  blunder?: number;
}

/** Délai « de réflexion » affiché avant le coup de l'IA (confort de jeu, pas de calcul). */
export function thinkDelayMs(level: AiLevel, rng: Rng): number {
  const base = level === 'beginner' ? 700 : level === 'intermediate' ? 1100 : 1500;
  return base + rng.int(600);
}

// ---------------------------------------------------------------------------------------------------------------
// Estimation de la force d'une colonne

/** Valeur d'une combinaison faite, par catégorie 0..9 (carte haute … quinte flush royale). */
const V = [0, 1.0, 2.6, 3.6, 4.6, 5.4, 6.4, 7.6, 8.6, 9.2];

interface Pool {
  n: number;
  rank: number[];
  suit: Record<Suit, number>;
}
const DEFAULT_POOL: Pool = { n: 45, rank: new Array<number>(15).fill(3), suit: { c: 10, d: 10, h: 10, s: 10 } };

function poolOf(unseen: readonly Card[]): Pool {
  const p: Pool = { n: unseen.length, rank: new Array<number>(15).fill(0), suit: { c: 0, d: 0, h: 0, s: 0 } };
  for (const c of unseen) {
    p.rank[c.rank]!++;
    p.suit[c.suit]++;
  }
  return p;
}

/** Probabilité d'obtenir au moins une carte parmi `m` utiles dans `tries` occasions. */
function atLeastOne(m: number, pool: Pool, tries: number): number {
  if (m <= 0 || tries <= 0) return 0;
  return 1 - Math.pow(1 - Math.min(0.9, m / Math.max(1, pool.n)), tries);
}

/** Force attendue d'une colonne (complète ou non) : combinaison déjà faite + améliorations probables. */
export function columnPotential(cards: readonly Card[], pool: Pool = DEFAULT_POOL): number {
  const n = cards.length;
  if (n === 0) return 0;
  const cnt: number[] = new Array<number>(15).fill(0);
  let maxRank = 0;
  for (const c of cards) {
    cnt[c.rank]!++;
    if (c.rank > maxRank) maxRank = c.rank;
  }
  if (n === COLUMN_SIZE) return V[tableauCat(cards)]! + (maxRank / 14) * 0.9;

  let fours = 0;
  let threes = 0;
  let pairs = 0;
  let pairRank = 0;
  let tripRank = 0;
  for (let r = 2; r <= 14; r++) {
    const k = cnt[r]!;
    if (k === 4) fours++;
    else if (k === 3) {
      threes++;
      tripRank = r;
    } else if (k === 2) {
      pairs++;
      pairRank = Math.max(pairRank, r);
    }
  }
  const f = COLUMN_SIZE - n;
  const tries = 1.6 * f;
  let made = 0;
  let hi = maxRank;
  if (fours) made = V[7]!;
  else if (threes && pairs) made = V[6]!;
  else if (threes) {
    made = V[3]!;
    hi = tripRank;
  } else if (pairs >= 2) made = V[2]!;
  else if (pairs === 1) {
    made = V[1]!;
    hi = pairRank;
  }
  let value = made + (hi / 14) * 0.9;

  // Améliorations par groupes
  if (!fours && f > 0) {
    if (threes && !pairs) {
      value += atLeastOne(pool.rank[tripRank]!, pool, tries) * (V[7]! - V[3]!) * 0.7;
      const singles = cards.filter((c) => cnt[c.rank] === 1).map((c) => c.rank);
      value += atLeastOne(singles.reduce((s, r) => s + pool.rank[r]!, 0), pool, tries) * (V[6]! - V[3]!) * 0.5;
    } else if (pairs === 1 && !threes) {
      value += atLeastOne(pool.rank[pairRank]!, pool, tries) * (V[3]! - V[1]!);
      const singles = cards.filter((c) => cnt[c.rank] === 1).map((c) => c.rank);
      value += atLeastOne(singles.reduce((s, r) => s + pool.rank[r]!, 0), pool, tries) * (V[2]! - V[1]!);
    } else if (pairs === 2) {
      const singles = cards.filter((c) => cnt[c.rank] === 2).map((c) => c.rank);
      value += atLeastOne(singles.reduce((s, r) => s + pool.rank[r]!, 0), pool, tries) * (V[6]! - V[2]!) * 0.6;
    } else if (pairs === 0 && threes === 0) {
      value += atLeastOne(cards.reduce((s, c) => s + pool.rank[c.rank]!, 0), pool, tries) * (V[1]! - made);
    }
  }

  // Tirage couleur : toutes les cartes de la même couleur
  if (n >= 2 && f > 0 && cards.every((c) => c.suit === cards[0]!.suit)) {
    const m = pool.suit[cards[0]!.suit];
    const p = Math.min(0.85, Math.pow(Math.max(0, m / Math.max(1, pool.n)) * 1.6, f));
    value += p * (V[5]! - value);
  }

  // Tirage quinte : rangs distincts tenant dans une même fenêtre de 5
  if (n >= 2 && f > 0 && fours === 0 && threes === 0 && pairs === 0) {
    let best = 0;
    for (let lo = 1; lo <= 10; lo++) {
      let ok = true;
      let p = 1;
      for (let r = lo; r <= lo + 4; r++) {
        const real = r === 1 ? 14 : r;
        if (cnt[real]) continue;
        p *= atLeastOne(pool.rank[real]!, pool, tries);
      }
      for (const c of cards) {
        const inWin = (c.rank >= lo && c.rank <= lo + 4) || (c.rank === 14 && lo === 1);
        if (!inWin) {
          ok = false;
          break;
        }
      }
      if (ok && p > best) best = p;
    }
    value += best * (V[4]! - value) * 0.9;
  }
  return value;
}

function tableauCat(cards: readonly Card[]): number {
  const rank = evaluate5(cards);
  const base = Math.floor(rank / 15 ** 5);
  if (base === 8 && Math.floor(rank / 15 ** 4) % 15 === 14) return 9;
  return base;
}

// ---------------------------------------------------------------------------------------------------------------
// Vue -> contexte

function unseenCards(view: TableauView): Card[] {
  const seen = new Set<string>(view.hand);
  for (const side of view.columns) for (const col of side) for (const c of col) seen.add(c);
  if (view.yourCard) seen.add(view.yourCard);
  return ALL_CARDS.filter((c) => !seen.has(c.code));
}

function legalOf(view: TableauView): number[] {
  return view.legal.length ? view.legal : view.columns[view.you]!.map((c, i) => (c.length < COLUMN_SIZE ? i : -1)).filter((i) => i >= 0);
}

/** Cartes jouables à ce tour : la carte piochée, puis la main (variante 5 cartes). */
function optionsOf(view: TableauView): string[] {
  return [...(view.yourCard ? [view.yourCard] : []), ...view.hand];
}

/** Un coup : la carte jouée et la colonne choisie. */
export interface TableauMove {
  card: string;
  col: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Niveaux

function beginner(view: TableauView, o: AiOptions): TableauMove {
  const legal = legalOf(view);
  const opts = optionsOf(view);
  if (o.rng.int(1000) < (o.blunder ?? 1 / 3) * 1000) return { card: opts[o.rng.int(opts.length)]!, col: legal[o.rng.int(legal.length)]! };
  const mine = view.columns[view.you]!;
  for (const code of opts) {
    const card = cardOf(code);
    for (const i of legal) if (mine[i]!.some((c) => cardOf(c).rank === card.rank)) return { card: code, col: i };
  }
  // sinon : la carte piochée (ou la première de la main) dans la colonne la moins remplie, la plus à gauche
  return { card: opts[0]!, col: legal.reduce((best, i) => (mine[i]!.length < mine[best]!.length ? i : best), legal[0]!) };
}

interface Gain extends TableauMove {
  gain: number;
  base: number;
  rank: number;
}
function gains(view: TableauView): Gain[] {
  const pool = poolOf(unseenCards(view));
  const mine = view.columns[view.you]!;
  const out: Gain[] = [];
  for (const code of optionsOf(view)) {
    const card = cardOf(code);
    for (const col of legalOf(view)) {
      const cur = mine[col]!.map(cardOf);
      const base = columnPotential(cur, pool);
      out.push({ card: code, col, base, rank: card.rank, gain: columnPotential([...cur, card], pool) - base });
    }
  }
  return out;
}

function sortGains(g: Gain[]): Gain[] {
  // meilleur gain ; à gain égal, on joue la carte la plus faible dans la colonne la plus faible
  return g.sort((a, b) => b.gain - a.gain || a.rank - b.rank || a.base - b.base || a.col - b.col);
}

function intermediate(view: TableauView): TableauMove {
  const g = sortGains(gains(view))[0]!;
  return { card: g.card, col: g.col };
}

// Expert : simulations -------------------------------------------------------------------------------------------

function greedyCol(cols: Card[][], card: Card): number {
  let best = -1;
  let bestGain = -Infinity;
  let bestBase = Infinity;
  for (let i = 0; i < COLUMNS; i++) {
    const col = cols[i]!;
    if (col.length >= COLUMN_SIZE) continue;
    const base = columnPotential(col);
    const gain = columnPotential([...col, card]) - base;
    if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) <= 1e-9 && base < bestBase)) {
      best = i;
      bestGain = gain;
      bestBase = base;
    }
  }
  return best;
}

function outcome(you: Card[][], opp: Card[][]): number {
  let a = 0;
  let b = 0;
  for (let c = 0; c < COLUMNS; c++) {
    const ra = evaluate5(you[c]!);
    const rb = evaluate5(opp[c]!);
    if (ra > rb) a++;
    else if (rb > ra) b++;
  }
  const w = decide(a, b);
  return (w === 0 ? 1 : w === null ? 0.5 : 0) + 0.04 * (a - b);
}

function expert(view: TableauView, o: AiOptions): TableauMove {
  const me = view.you;
  const opp = (1 - me) as 0 | 1;
  const ranked = sortGains(gains(view));
  if (ranked.length === 1) return { card: ranked[0]!.card, col: ranked[0]!.col };
  const cands = ranked.slice(0, 8); // les huit coups les plus prometteurs sont départagés par simulation
  const unseen = unseenCards(view);
  const opts = optionsOf(view);
  const myCols = view.columns[me]!.map((c) => c.map(cardOf));
  const oppCols = view.columns[opp]!.map((c) => c.map(cardOf));
  const myTotal = view.remaining[me] - 1; // cartes qu'il reste à placer après ce coup
  const oppNeed = view.remaining[opp];
  const t0 = Date.now();
  const budget = o.budgetMs ?? 350;
  const maxSims = o.maxSims ?? 240;
  const score = cands.map(() => 0);
  let sims = 0;
  const pool = [...unseen];
  while (sims < maxSims && (sims < 8 || Date.now() - t0 < budget)) {
    sims++;
    shuffleInPlace(pool, o.rng);
    cands.forEach((cand, k) => {
      // cartes déjà connues (main, carte piochée non jouée) puis cartes de pioche tirées au hasard
      const known = opts.filter((c) => c !== cand.card).map(cardOf);
      const mine = [...known, ...pool.slice(0, Math.max(0, myTotal - known.length))];
      const theirs = pool.slice(Math.max(0, myTotal - known.length), Math.max(0, myTotal - known.length) + oppNeed);
      const A = myCols.map((c) => [...c]);
      const B = oppCols.map((c) => [...c]);
      A[cand.col]!.push(cardOf(cand.card));
      let mi = 0;
      let oi = 0;
      let oppToMove = true;
      while (mi < mine.length || oi < oppNeed) {
        if (oppToMove) {
          if (oi < oppNeed) {
            const c = theirs[oi++]!;
            B[greedyCol(B, c)]!.push(c);
          }
        } else if (mi < mine.length) {
          const c = mine[mi++]!;
          A[greedyCol(A, c)]!.push(c);
        }
        oppToMove = !oppToMove;
      }
      score[k] = score[k]! + outcome(A, B);
    });
  }
  let best = 0;
  let bestV = -Infinity;
  cands.forEach((c, k) => {
    const v = score[k]! / sims + 1e-4 * c.gain;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  });
  return { card: cands[best]!.card, col: cands[best]!.col };
}

/** Coup de l'IA (carte et colonne), d'après la seule vue de son siège (il faut que ce soit son tour). */
export function chooseMove(view: TableauView, level: AiLevel, options: AiOptions): TableauMove {
  if (view.legal.length === 0 || optionsOf(view).length === 0) throw new RangeError('Ce n’est pas le tour de ce siège');
  if (level === 'beginner') return beginner(view, options);
  if (level === 'intermediate') return intermediate(view);
  return expert(view, options);
}

/** Variante classique : seule la colonne se choisit. */
export function chooseColumn(view: TableauView, level: AiLevel, options: AiOptions): number {
  return chooseMove(view, level, options).col;
}

// ---------------------------------------------------------------------------------------------------------------
// Pédagogie (mode Entraînement)

export interface TableauAdvice {
  col: number;
  /** Carte à jouer (utile dans la variante 5 cartes). */
  card: string;
  /** Phrase d'explication en français. */
  text: string;
}

/** Conseil de placement (niveau intermédiaire) avec une explication lisible par un débutant. */
export function adviseColumn(view: TableauView): TableauAdvice {
  const { col, card } = intermediate(view);
  const before = view.columns[view.you]![col]!;
  const after = [...before, card];
  const c = cardOf(card);
  const fromHand = view.hand.includes(card) ? ' de votre main' : '';
  const name = `${c.rank === 14 ? 'As' : c.rank === 13 ? 'Roi' : c.rank === 12 ? 'Dame' : c.rank === 11 ? 'Valet' : c.rank}`;
  const result = describePartial(after);
  const gain = before.length > 0 && describePartial(before) !== result;
  const text = gain
    ? `Placez le ${name}${fromHand} en colonne ${col + 1} : elle devient « ${result} ».`
    : before.length === 0
      ? `Placez le ${name}${fromHand} en colonne ${col + 1} : c’est une colonne encore vide.`
      : `Le ${name}${fromHand} n’améliore aucune colonne : posez-le en colonne ${col + 1}, votre colonne la plus faible, pour garder vos meilleures colonnes intactes.`;
  return { col, card, text };
}

/** Commentaire après un placement : ce que la carte a changé dans la colonne. */
export function explainPlacement(before: readonly string[], card: string): string {
  const prev = describePartial(before);
  const next = describePartial([...before, card]);
  return prev === next ? `Colonne : ${next}.` : `Colonne : ${prev} → ${next}.`;
}
