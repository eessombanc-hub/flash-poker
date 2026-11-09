import { parseCard, type Card } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import { bestOf, categoryOf, combinationCodes, HandCategory } from '../evaluation/handEvaluator';
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
  /** Rang de la combinaison, tétines comprises (c'est lui qui désigne le gagnant de la ligne). */
  rank: number;
  category: HandCategory;
  /** Rang SANS les tétines, selon la règle du 6-3 classique (2 cartes de la main + 3 du plateau) : il départage
   * les paris extérieurs. Égal à `rank` quand la manche se joue sans tétine. */
  baseRank: number;
}

/** Pari extérieur d'un joueur : une ligne et un montant en jetons. */
export interface SideBet {
  line: 1 | 2 | 3;
  amount: number;
}

/** Pari accordé : au moins 2 joueurs ont choisi la même ligne et le même montant. Les mises sont engagées. */
export interface SideBetPool {
  line: 1 | 2 | 3;
  amount: number;
  members: PlayerId[];
}

/** Résultat d'un pari extérieur à la clôture de sa ligne. Le gain est versé immédiatement. */
export interface SideBetResult extends SideBetPool {
  winners: PlayerId[];
  /** Variation de jetons de chaque membre (gain − mise) ; 0 si le pari est rendu. */
  net: Record<PlayerId, number>;
  /** Aucun membre n'avait désigné de combinaison à temps : les mises sont rendues. */
  refunded: boolean;
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
  /** Nombre de tétines (0 à 2). */
  teats: number;
  /** Phase de paris extérieurs avant la distribution ('BETS'), puis les trois lignes ('LINES'). */
  stage: 'BETS' | 'LINES';
  sideBets: boolean;
  budgets: Record<PlayerId, number>;
  betDrafts: Record<PlayerId, SideBet[]>;
  betsValidated: PlayerId[];
  pools: SideBetPool[];
  sideResults: SideBetResult[];
}

/** Nombre maximal de tétines. */
export const MAX_TEATS = 2;
const BOARD_LINES_SIZE = 15;

/**
 * 6-3 (Omaha). 6 cartes privées, et 3 plateaux INDÉPENDANTS de 5 cartes chacun (flop 3 + turn 1 + river 1),
 * soit 15 cartes communes au total. Le flop et le turn de chaque ligne sont visibles dès le début de la manche ;
 * seule la river de la ligne 1 est visible d'emblée (13 cartes visibles). Les rivers des lignes 2 et 3 restent
 * cachées et ne sont révélées qu'après la clôture de la ligne précédente (2 cartes cachées au départ).
 * À chaque ligne, le joueur désigne 2 cartes privées (réutilisables à chaque ligne) ; la ligne est évaluée sur
 * la paire désignée combinée au plateau de CETTE ligne uniquement, sans aucune aide. Sans paire de 2 cartes à
 * l'échéance : ligne perdue.
 *
 * Tétines (0 à 2, au choix du joueur qui choisit le 6-3) : cartes communes supplémentaires, visibles dès le départ,
 * posées sur la ligne en cours ; elles coulissent à la ligne suivante dès que la ligne est résolue. Avec des
 * tétines, la combinaison d'une ligne est la meilleure main de 5 cartes parmi les 2 cartes désignées, les 5 cartes
 * de la ligne et les tétines (sans contrainte « 2 + 3 »).
 *
 * Paris extérieurs (option du même joueur) : avant la distribution, chacun peut parier une ou plusieurs lignes, avec
 * un montant. Quand au moins 2 joueurs s'accordent sur la même ligne et le même montant, le pari est engagé : à la
 * clôture de la ligne, la meilleure combinaison SANS tétines (règle classique) parmi ces joueurs rafle les mises
 * (égalité : partage). Un pari sans adversaire d'accord est ignoré.
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
      // Les parties enregistrées avant les tétines et les paris n'ont pas ces champs : valeurs neutres.
      const st = snapshot.state as Partial<State63> & Pick<State63, 'line' | 'sel' | 'lines' | 'done'>;
      this.s = {
        ...st,
        teats: st.teats ?? 0,
        stage: st.stage ?? 'LINES',
        sideBets: st.sideBets ?? false,
        budgets: st.budgets ?? {},
        betDrafts: st.betDrafts ?? {},
        betsValidated: st.betsValidated ?? [],
        pools: st.pools ?? [],
        sideResults: st.sideResults ?? [],
      };
    } else {
      const teats = ctx.teats ?? 0;
      if (!Number.isInteger(teats) || teats < 0 || teats > MAX_TEATS) {
        throw new RuleError('BAD_CONFIG', `Nombre de tétines invalide : ${String(ctx.teats)} (0 à ${MAX_TEATS})`);
      }
      const sideBets = ctx.sideBets === true;
      const budgets: Record<PlayerId, number> = {};
      const betDrafts: Record<PlayerId, SideBet[]> = {};
      for (const p of this.players) {
        budgets[p] = Math.max(0, Math.floor(ctx.budgets?.[p] ?? 0));
        betDrafts[p] = [];
      }
      this.s = {
        line: 1,
        sel: freshSel(this.players),
        lines: [],
        done: false,
        teats,
        stage: sideBets ? 'BETS' : 'LINES',
        sideBets,
        budgets,
        betDrafts,
        betsValidated: [],
        pools: [],
        sideResults: [],
      };
      if (!sideBets) this.dealAll();
    }
  }

  /** Distribution : 6 cartes privées, 3 plateaux de 5 cartes (rivers 2 et 3 cachées), puis les tétines (visibles). */
  private dealAll(): void {
    this.cards.dealRoundRobin(6);
    this.cards.dealBoard(5, true); // ligne 1 : flop + turn + river, tout visible d'emblée
    this.cards.dealBoard(4, true); // ligne 2 : flop + turn visibles
    this.cards.dealBoard(1, false); // ligne 2 : river cachée
    this.cards.dealBoard(4, true); // ligne 3 : flop + turn visibles
    this.cards.dealBoard(1, false); // ligne 3 : river cachée
    if (this.s.teats > 0) this.cards.dealBoard(this.s.teats, true); // tétines : cases 15 et 16
  }

  phase(): string {
    if (this.s.done) return 'DONE';
    return this.s.stage === 'BETS' ? 'BETS' : `LINE_${this.s.line}`;
  }

  awaiting(): PlayerId[] {
    if (this.s.done) return [];
    if (this.s.stage === 'BETS') return this.players.filter((p) => !this.s.betsValidated.includes(p));
    return this.players.filter((p) => !this.s.sel.validated.includes(p));
  }

  /** Avertissement neutre à 10 s pour qui n'a désigné qu'une seule carte. */
  warnings(): PlayerId[] {
    if (this.s.stage === 'BETS') return [];
    return this.awaiting().filter((p) => this.s.sel.drafts[p]!.length === 1);
  }

  protected handle(cmd: RoundCommand, events: RoundEvent[]): void {
    if (this.s.stage === 'BETS') return this.handleBets(cmd, events);
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
      case 'BET':
        throw new RuleError('WRONG_PHASE', 'Les paris extérieurs sont clos : les cartes sont distribuées');
      default:
        throw new RuleError('BAD_COMMAND', `Commande ${cmd.type} inconnue au 6-3`);
    }
  }

  // ---------- Paris extérieurs ----------

  private handleBets(cmd: RoundCommand, events: RoundEvent[]): void {
    switch (cmd.type) {
      case 'BET': {
        this.assertPlayer(cmd.player);
        if (this.s.betsValidated.includes(cmd.player)) throw new RuleError('ALREADY_VALIDATED', `${cmd.player} a déjà validé`);
        if (!Array.isArray(cmd.bets) || cmd.bets.length > 3) throw new RuleError('BAD_BET', 'Trois paris au plus, un par ligne');
        const lines = new Set<number>();
        let total = 0;
        for (const b of cmd.bets) {
          if (![1, 2, 3].includes(b.line)) throw new RuleError('BAD_BET', `Ligne invalide : ${String(b.line)}`);
          if (lines.has(b.line)) throw new RuleError('BAD_BET', `Un seul pari par ligne (ligne ${b.line})`);
          lines.add(b.line);
          if (!Number.isInteger(b.amount) || b.amount < 1) throw new RuleError('BAD_BET', 'Le montant doit être un nombre entier de jetons, au moins 1');
          total += b.amount;
        }
        if (total > this.s.budgets[cmd.player]!) {
          throw new RuleError('INSUFFICIENT_CHIPS', `Jetons insuffisants : ${total} demandés, ${this.s.budgets[cmd.player]} disponibles`);
        }
        this.s.betDrafts[cmd.player] = cmd.bets.map((b) => ({ line: b.line, amount: b.amount })).sort((a, b) => a.line - b.line);
        return;
      }
      case 'VALIDATE': {
        this.assertPlayer(cmd.player);
        if (this.s.betsValidated.includes(cmd.player)) throw new RuleError('ALREADY_VALIDATED', `${cmd.player} a déjà validé`);
        this.s.betsValidated.push(cmd.player);
        if (this.s.betsValidated.length === this.players.length) this.closeBets(events);
        return;
      }
      case 'TIMEOUT':
        this.closeBets(events);
        return;
      default:
        throw new RuleError('WRONG_PHASE', 'Les paris extérieurs sont en cours : placez vos paris ou validez');
    }
  }

  /** Fin des paris : les paris accordés (même ligne, même montant, au moins 2 joueurs) sont engagés, puis on distribue. */
  private closeBets(events: RoundEvent[]): void {
    const groups = new Map<string, SideBetPool>();
    for (const p of this.players) {
      for (const b of this.s.betDrafts[p]!) {
        const key = `${b.line}:${b.amount}`;
        const g = groups.get(key) ?? { line: b.line, amount: b.amount, members: [] };
        g.members.push(p);
        groups.set(key, g);
      }
    }
    this.s.pools = [...groups.values()].filter((g) => g.members.length >= 2).sort((a, b) => a.line - b.line || a.amount - b.amount);
    this.s.stage = 'LINES';
    this.s.sel = freshSel(this.players);
    this.dealAll();
    events.push(publicEvent('SIDE_BETS_LOCKED', { pools: structuredClone(this.s.pools) }));
  }

  /** Résout les paris accordés de la ligne qui vient de se clore ; chacun reçoit son gain tout de suite. */
  private resolvePools(line: 1 | 2 | 3, designations: Record<PlayerId, LineDesignation | null>, events: RoundEvent[]): void {
    for (const pool of this.s.pools.filter((p) => p.line === line)) {
      const contenders = pool.members.filter((m) => designations[m] !== null);
      const net: Record<PlayerId, number> = {};
      for (const m of pool.members) net[m] = 0;
      let winners: PlayerId[] = [];
      let refunded = false;
      if (contenders.length === 0) {
        refunded = true; // personne n'a désigné de combinaison : mises rendues
      } else {
        const best = contenders.reduce((m, p) => Math.max(m, designations[p]!.baseRank), -1);
        winners = contenders.filter((p) => designations[p]!.baseRank === best);
        const pot = pool.amount * pool.members.length;
        const share = Math.floor(pot / winners.length);
        const rest = pot - share * winners.length; // reliquat de l'arrondi : au premier gagnant dans l'ordre des positions
        for (const m of pool.members) net[m] = -pool.amount;
        winners.forEach((w, i) => {
          net[w] = net[w]! + share + (i === 0 ? rest : 0);
        });
      }
      const result: SideBetResult = { ...pool, winners, net, refunded };
      this.s.sideResults.push(result);
      events.push(publicEvent('SIDE_BET_RESOLVED', { ...result }));
    }
  }

  /** Variation de jetons de chaque joueur due aux paris extérieurs DÉJÀ résolus (les paris des lignes à venir sont
   * seulement engagés, ils ne comptent pas encore). */
  sideBetNet(): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {};
    for (const p of this.players) out[p] = this.s.sideResults.reduce((n, r) => n + (r.net[p] ?? 0), 0);
    return out;
  }

  /** Mises engagées dans des paris pas encore résolus (retirées des jetons disponibles en attendant). */
  sideBetLocked(): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {};
    for (const p of this.players) out[p] = 0;
    for (const pool of this.s.pools) {
      if (this.s.sideResults.some((r) => r.line === pool.line && r.amount === pool.amount)) continue;
      for (const m of pool.members) out[m] = out[m]! + pool.amount;
    }
    return out;
  }

  /** Résultats des paris extérieurs résolus (lecture seule, pour le résumé de la manche). */
  sideBetResults(): readonly SideBetResult[] {
    return this.s.sideResults;
  }

  teatCount(): number {
    return this.s.teats;
  }

  /** Tétines : cartes communes supplémentaires (cases 15 et suivantes du plateau), toutes visibles. */
  private teatCards(): Card[] {
    return this.cards
      .getBoard()
      .slice(BOARD_LINES_SIZE)
      .map((s) => s.card);
  }

  /** Combinaison d'une paire désignée sur une ligne : avec tétines, meilleure main de 5 parmi la paire, le plateau
   * de la ligne et les tétines ; sans tétine, règle classique du 6-3 (2 cartes de la main + 3 du plateau). */
  private evaluatePair(pair: [Card, Card], hand: Card[], board: Card[]): { rank: number; baseRank: number } {
    const { rank, baseRank } = this.evaluatePairCards(pair, hand, board);
    return { rank, baseRank };
  }

  /** Comme `evaluatePair`, avec en plus les 5 cartes qui forment la combinaison retenue (assistance). */
  private evaluatePairCards(pair: [Card, Card], hand: Card[], board: Card[]): { rank: number; baseRank: number; cards: readonly Card[] } {
    const base = evaluateOmahaWithPair(pair, hand, board);
    if (this.s.teats === 0) return { rank: base.rank, baseRank: base.rank, cards: base.cards };
    const withTeats = bestOf([...pair, ...board, ...this.teatCards()]);
    return withTeats.rank > base.rank ? { rank: withTeats.rank, baseRank: base.rank, cards: withTeats.cards } : { rank: base.rank, baseRank: base.rank, cards: base.cards };
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
      const res = this.evaluatePair(pair, this.handOf(p), board);
      designations[p] = { pair: [pair[0].code, pair[1].code], rank: res.rank, category: categoryOf(res.rank), baseRank: res.baseRank };
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
    this.resolvePools(line, designations, events);

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
      if (this.s.teats > 0) events.push(publicEvent('TEATS_MOVED', { line: this.s.line }));
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
    // Capot : gagner seul les 3 lignes vaut 2 points ; sinon 1 point, comme dans toutes les variantes.
    // Une ligne partagée (égalité) ne compte pas comme gagnée.
    const sweep = this.s.lines.length === 3 && this.s.lines.every((l) => l.winners.length === 1 && l.winners[0] === winner);
    this.finish({ kind: 'WINNER', winner, points: sweep ? 2 : 1, detail: { units, sweep } }, events);
  }

  protected stateForSnapshot(): unknown {
    return this.s;
  }

  protected infoFor(viewer: PlayerId | null): Record<string, unknown> {
    const draft = viewer ? (this.s.sel.drafts[viewer] ?? []) : [];
    const betting = this.s.stage === 'BETS';
    const locked = this.sideBetLocked();
    return {
      line: this.s.line,
      validated: betting ? [...this.s.betsValidated] : [...this.s.sel.validated],
      yourDraft: viewer && !this.s.done && !betting ? [...draft] : [],
      // Lignes closes : désignations révélées ensemble (publiques), jamais les brouillons en cours
      lines: this.s.lines,
      unitsScale: LINE_UNITS,
      // Tétines : nombre (0 à 2), cartes (publiques dès la distribution) ; elles reposent sur la ligne `line`.
      teats: this.s.teats,
      teatCards: betting ? [] : this.teatCards().map((c) => c.code),
      // Paris extérieurs : phase, vos paris en cours de saisie, vos jetons disponibles, paris engagés et résolus.
      sideBets: this.s.sideBets,
      stage: this.s.stage,
      yourBets: viewer && betting ? (this.s.betDrafts[viewer] ?? []).map((b) => ({ ...b })) : [],
      budget: viewer ? Math.max(0, (this.s.budgets[viewer] ?? 0) - (locked[viewer] ?? 0)) : 0,
      pools: this.s.pools.map((p) => ({ ...p, members: [...p.members] })),
      sideResults: structuredClone(this.s.sideResults),
      // Assistance : combinaison de la paire désignée + le plateau de la ligne en cours, avec le même
      // évaluateur que la résolution réelle de la ligne.
      assistCategory:
        this.assistance && viewer && !this.s.done && !betting && draft.length === 2
          ? categoryOf(this.evaluatePair([parseCard(draft[0]!), parseCard(draft[1]!)], this.handOf(viewer), this.lineBoard(this.s.line)).rank)
          : null,
      // Assistance : les cartes (paire désignée, plateau, tétines) qui forment cette combinaison.
      assistCards:
        this.assistance && viewer && !this.s.done && !betting && draft.length === 2
          ? combinationCodes(this.evaluatePairCards([parseCard(draft[0]!), parseCard(draft[1]!)], this.handOf(viewer), this.lineBoard(this.s.line)).cards)
          : [],
    };
  }
}
