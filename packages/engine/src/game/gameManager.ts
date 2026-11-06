import { parseCard } from '../core/card';
import type { PlayerId } from '../core/cardEngine';
import type { Rng } from '../core/rng';
import { categoryOf } from '../evaluation/handEvaluator';
import { evaluateHoldem } from '../evaluation/holdemEvaluator';
import { Round63, type LineResult } from '../variants/round63';
import {
  createRound,
  isVariantAvailable,
  resolveRoundResult,
  restoreRound,
  RuleError,
  VARIANT_IDS,
  type Round,
  type RoundAward,
  type RoundCommand,
  type RoundEvent,
  type RoundResult,
  type RoundSnapshot,
  type RoundView,
  type VariantId,
} from '../variants';
import {
  assertInsuranceAllowed,
  insuredPartner,
  playersOneFromEnd,
  settle,
  type Insurance,
  type InsuranceType,
  type Settlement,
} from './insurance';
import { POSITION_LABELS } from './positions';

/** Mise maximale par joueur : 10 000 € (en centimes). */
export const MAX_STAKE_CENTS = 1_000_000;
/** Objectif maximal : 5 points. */
export const MAX_TARGET_POINTS = 5;

export interface GameConfig {
  /** Joueurs dans l'ordre des positions : UTG en premier (voir `assignPositions`). */
  players: readonly PlayerId[];
  /** Points nécessaires pour gagner : de 1 à 5. */
  targetPoints: number;
  /** Mise par joueur, définie par le créateur : de 0 à 10 000 €, en centimes (cagnotte virtuelle). */
  stakeCents: number;
  /** Nombre maximal de joueurs fixé à la création (2 à 6, défaut 6) : limite les arrivées en cours de partie. */
  maxPlayers?: number;
  /** Partie « avec assistance » (fixé pour toute la partie, décidé en salle d'attente) : simple indicateur
   * du nom de la combinaison déjà formée, jamais de suggestion. Faux par défaut. */
  assistance?: boolean;
}

export type GamePhase = 'VARIANT_SELECTION' | 'ROUND' | 'GAME_OVER';
export type VictoryType = 'SCORE' | 'STRAIGHT_FLUSH_63';

export interface RoundRecord {
  roundNo: number;
  chooser: PlayerId;
  variant: VariantId;
  result: RoundResult;
  /** Attribution finale (après Hold'em de départage éventuel). */
  award: RoundAward;
  /** Points marqués à la partie pendant cette manche. */
  points: Record<PlayerId, number>;
  scoresAfter: Record<PlayerId, number>;
  /** Ce qui a décidé la manche, conservé pour l'historique (absent des parties enregistrées avant son ajout). */
  summary?: RoundSummary;
}

/**
 * Résumé d'une manche pour l'affichage et l'historique : uniquement des faits déjà publics à la fin de la
 * manche (mains abattues, lignes du 6-3, départage). Aucune incidence sur les règles ni sur le score.
 */
export interface RoundSummary {
  /** Mains montrées à l'abattage, avec leur catégorie (toutes les variantes sauf le 6-3). */
  hands?: Record<PlayerId, { cards: string[]; category: number }>;
  /** 6-3 : résultat de chaque ligne. */
  lines?: LineResult[];
  /** Hold'em de départage : meilleure combinaison du vainqueur (catégorie et 5 cartes). */
  tiebreak?: { category: number; cards: string[] };
  /** Gagnée sans abattage, tous les autres joueurs étant couchés (Aviation, Avia 6). */
  byFold?: boolean;
}

/**
 * Classement final : uniquement le vainqueur et, s'il est assuré, son partenaire assuré.
 * Les scores de tous les joueurs restent disponibles dans `GameView.players` et dans l'historique.
 */
export interface Standing {
  player: PlayerId;
  position: string;
  score: number;
  rank: number;
}

export interface GameOutcome {
  winner: PlayerId;
  victoryType: VictoryType;
  standings: Standing[];
  /** Répartition de la cagnotte (virtuelle), en centimes. */
  settlement: Settlement;
  /** Assurance appliquée (celle qui contient le vainqueur), sinon null. */
  insurance: Insurance | null;
}

export interface PendingInsurance {
  proposer: PlayerId;
  partner: PlayerId;
  type: InsuranceType;
}

export type GameCommand =
  | { type: 'CHOOSE_VARIANT'; player: PlayerId; variant: VariantId }
  | { type: 'ROUND'; command: RoundCommand }
  /** Entre deux manches uniquement : proposer une assurance à un joueur, lui aussi à 1 point de la fin. */
  | { type: 'PROPOSE_INSURANCE'; player: PlayerId; partner: PlayerId; insuranceType: InsuranceType }
  /** Réponse du partenaire : accepter (l'assurance est verrouillée) ou refuser. */
  | { type: 'RESPOND_INSURANCE'; player: PlayerId; accept: boolean }
  /** Échéance de 60 s décidée par le serveur : la proposition en attente vaut refus. */
  | { type: 'INSURANCE_TIMEOUT' }
  /**
   * Échéance de 60 s décidée par le serveur, selon l'état : proposition d'assurance en attente → refus ;
   * choix de variante → variante disponible tirée au hasard ; manche → défauts de la phase (fold, ligne perdue…).
   */
  | { type: 'TIMEOUT' }
  /** Arrivée d'un joueur : uniquement entre deux manches, dernière position, 0 point, même mise. */
  | { type: 'ADD_PLAYER'; player: PlayerId }
  /** Exclusion par l'hôte : le joueur garde son siège en absent permanent (minuteurs résolus instantanément). */
  | { type: 'EXCLUDE_PLAYER'; player: PlayerId };

export interface GameView {
  phase: GamePhase;
  roundNo: number;
  chooser: PlayerId;
  awaiting: PlayerId[];
  targetPoints: number;
  stakeCents: number;
  potCents: number;
  /** Partie « avec assistance » (fixé pour toute la partie) : indicateur du nom de la combinaison affiché aux
   * joueurs, jamais de suggestion. */
  assistance: boolean;
  players: { player: PlayerId; position: string; score: number; excluded: boolean }[];
  maxPlayers: number;
  /** Minuteur de 60 s en cours (le serveur le relance quand `key` change), ou null. */
  timer: { kind: 'VARIANT' | 'INSURANCE' | 'ROUND'; key: string } | null;
  /** Joueurs à avertir à 10 s de l'échéance. */
  warnings: PlayerId[];
  /** evolution[p][i] = score de p après la manche i + 1. */
  evolution: Record<PlayerId, number[]>;
  variants: { variant: VariantId; available: boolean }[];
  insurance: {
    /** Joueurs à 1 point de la fin, non encore assurés (vide dès qu'une assurance existe, ou à moins de 4 joueurs). */
    eligible: PlayerId[];
    canPropose: boolean;
    /** Partenaires avec qui CE joueur a déjà essuyé un refus ou une expiration : à exclure de son choix. */
    blockedPartners: PlayerId[];
    pending: PendingInsurance | null;
    accepted: Insurance[];
  };
  round: RoundView | null;
  history: RoundRecord[];
  outcome: GameOutcome | null;
}

export interface GameSnapshot {
  config: GameConfig;
  phase: GamePhase;
  roundNo: number;
  scores: Record<PlayerId, number>;
  history: RoundRecord[];
  round: RoundSnapshot | null;
  insurances: Insurance[];
  pendingInsurance: PendingInsurance | null;
  /** Duos (proposeur, partenaire) ayant refusé ou laissé expirer une proposition : ils ne peuvent plus se
   * reproposer une assurance entre eux (mais chacun reste libre avec un autre joueur). Clé : identifiants triés. */
  declinedPairs: string[];
  lastChooser: PlayerId | null;
  excluded: PlayerId[];
  outcome: GameOutcome | null;
}

export interface GameHooks {
  /** TESTS UNIQUEMENT : paquet truqué par manche. */
  stackedDeck?: (roundNo: number, variant: VariantId) => readonly string[] | undefined;
}

/** Configuration interne (les joueurs peuvent s'ajouter entre deux manches). */
interface LiveConfig {
  players: PlayerId[];
  targetPoints: number;
  stakeCents: number;
  maxPlayers: number;
  assistance: boolean;
}

/**
 * Orchestre une partie : rotation du choix de variante, manches, scores, objectif, victoire, historique,
 * assurance, règlement de la cagnotte, arrivées et exclusions. Le serveur est l'unique source de vérité ;
 * toute commande invalide lève `RuleError` sans rien modifier.
 */
export class GameManager {
  private readonly config: LiveConfig;
  private phase_: GamePhase = 'VARIANT_SELECTION';
  private roundNo_ = 1;
  private scores: Record<PlayerId, number> = {};
  private history_: RoundRecord[] = [];
  private round: Round | null = null;
  private insurances: Insurance[] = [];
  private pending: PendingInsurance | null = null;
  private declinedPairs: string[] = [];
  private lastChooser: PlayerId | null = null;
  private excluded: PlayerId[] = [];
  private outcome_: GameOutcome | null = null;

  constructor(
    config: GameConfig,
    private readonly rng: Rng,
    private readonly hooks: GameHooks = {},
    snapshot?: GameSnapshot,
  ) {
    const { players, targetPoints, stakeCents } = config;
    const maxPlayers = config.maxPlayers ?? 6;
    if (players.length < 2 || players.length > 6 || new Set(players).size !== players.length) {
      throw new RuleError('BAD_CONFIG', 'Une partie réunit de 2 à 6 joueurs distincts');
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < players.length || maxPlayers > 6) {
      throw new RuleError('BAD_CONFIG', 'Nombre maximal de joueurs : entier de 2 à 6, au moins égal au nombre de joueurs');
    }
    if (!Number.isInteger(targetPoints) || targetPoints < 1 || targetPoints > MAX_TARGET_POINTS) {
      throw new RuleError('BAD_CONFIG', `Objectif : entier de 1 à ${MAX_TARGET_POINTS} points`);
    }
    if (!Number.isInteger(stakeCents) || stakeCents < 0 || stakeCents > MAX_STAKE_CENTS) {
      throw new RuleError('BAD_CONFIG', 'Mise : de 0 à 10 000 € (centimes entiers)');
    }
    this.config = { players: [...players], targetPoints, stakeCents, maxPlayers, assistance: config.assistance ?? false };
    for (const p of players) this.scores[p] = 0;
    if (snapshot) {
      this.phase_ = snapshot.phase;
      this.roundNo_ = snapshot.roundNo;
      this.scores = { ...snapshot.scores };
      this.history_ = JSON.parse(JSON.stringify(snapshot.history));
      this.round = snapshot.round ? restoreRound(snapshot.round, rng, this.config.assistance) : null;
      this.insurances = JSON.parse(JSON.stringify(snapshot.insurances));
      this.pending = snapshot.pendingInsurance ? { ...snapshot.pendingInsurance } : null;
      this.declinedPairs = [...(snapshot.declinedPairs ?? [])];
      this.lastChooser = snapshot.lastChooser;
      this.excluded = [...snapshot.excluded];
      this.outcome_ = snapshot.outcome ? JSON.parse(JSON.stringify(snapshot.outcome)) : null;
    }
  }

  static restore(snapshot: GameSnapshot, rng: Rng, hooks: GameHooks = {}): GameManager {
    return new GameManager(snapshot.config, rng, hooks, snapshot);
  }

  // ---------- Lecture ----------

  phase(): GamePhase {
    return this.phase_;
  }
  get roundNo(): number {
    return this.roundNo_;
  }
  /**
   * Rotation dans l'ordre des positions : manche 1 → UTG, puis le joueur qui suit le précédent chooser, en cycle.
   * Une manche sans gagnant compte aussi ; un joueur arrivé en cours de partie (dernière position) choisit
   * quand son tour arrive.
   */
  chooser(): PlayerId {
    const p = this.config.players;
    if (this.phase_ === 'ROUND' || this.phase_ === 'GAME_OVER') return this.lastChooser ?? p[0]!;
    if (this.lastChooser === null) return p[0]!;
    return p[(p.indexOf(this.lastChooser) + 1) % p.length]!;
  }
  /**
   * Joueurs dont une action est attendue. Les joueurs exclus n'en font jamais partie : leur défaut est appliqué
   * automatiquement dès que plus personne de présent n'est attendu.
   */
  awaiting(): PlayerId[] {
    if (this.phase_ === 'GAME_OVER') return [];
    if (this.phase_ === 'ROUND') return this.round!.awaiting().filter((p) => !this.isExcluded(p));
    return this.pending ? [this.pending.partner] : [this.chooser()];
  }
  players(): PlayerId[] {
    return [...this.config.players];
  }
  excludedPlayers(): PlayerId[] {
    return [...this.excluded];
  }
  scoreOf(player: PlayerId): number {
    return this.scores[player]!;
  }
  history(): RoundRecord[] {
    return this.history_;
  }
  outcome(): GameOutcome | null {
    return this.outcome_;
  }
  insurancesAccepted(): Insurance[] {
    return this.insurances;
  }
  pendingInsurance(): PendingInsurance | null {
    return this.pending;
  }
  availableVariants(): VariantId[] {
    return VARIANT_IDS.filter((v) => isVariantAvailable(v, this.config.players.length));
  }
  /** Manche en cours — SERVEUR UNIQUEMENT (expose les cartes cachées). */
  get currentRound(): Round | null {
    return this.round;
  }

  /**
   * Minuteur de 60 s en cours. `key` change à chaque nouvelle phase à minuteur : le serveur relance alors 60 s.
   * Hypothèse : le minuteur du chooser repart à 60 s dès qu'il redevient attendu (après une proposition d'assurance).
   */
  timer(): { kind: 'VARIANT' | 'INSURANCE' | 'ROUND'; key: string } | null {
    if (this.phase_ === 'GAME_OVER') return null;
    if (this.phase_ === 'VARIANT_SELECTION') {
      return this.pending
        ? { kind: 'INSURANCE', key: `INS:${this.roundNo_}:${this.pending.proposer}>${this.pending.partner}` }
        : { kind: 'VARIANT', key: `SEL:${this.roundNo_}:${this.chooser()}` };
    }
    if (this.round!.awaiting().length === 0) return null;
    return { kind: 'ROUND', key: `RND:${this.roundNo_}:${this.round!.phaseKey()}` };
  }
  /** Joueurs à avertir à 10 s de l'échéance (message neutre). */
  warnings(): PlayerId[] {
    return this.phase_ === 'ROUND' ? this.round!.warnings() : [];
  }

  private isExcluded(player: PlayerId): boolean {
    return this.excluded.includes(player);
  }

  /** Clé stable d'un duo, indépendante de l'ordre des deux joueurs. */
  private pairKey(a: PlayerId, b: PlayerId): string {
    return [a, b].sort().join('|');
  }

  /** Joueurs à exactement 1 point de l'objectif, tant qu'aucune assurance n'existe (une seule par partie).
   * L'assurance n'est proposable qu'à partir de 4 joueurs à table. */
  private eligibleForInsurance(): PlayerId[] {
    if (this.insurances.length > 0) return [];
    if (this.config.players.length < 4) return [];
    return playersOneFromEnd(this.config.players, this.scores, this.config.targetPoints).filter((p) => !this.isExcluded(p));
  }

  // ---------- Commandes ----------

  apply(cmd: GameCommand): RoundEvent[] {
    if (this.phase_ === 'GAME_OVER') throw new RuleError('GAME_OVER', 'La partie est terminée');
    const events = this.applyCommand(cmd);
    this.autoResolveAbsent(events);
    return events;
  }

  private applyCommand(cmd: GameCommand): RoundEvent[] {
    const events: RoundEvent[] = [];
    switch (cmd.type) {
      case 'CHOOSE_VARIANT': {
        if (this.phase_ !== 'VARIANT_SELECTION') throw new RuleError('WRONG_PHASE', 'Une manche est en cours');
        if (this.pending) throw new RuleError('INSURANCE_PENDING', 'Une proposition d\'assurance est en attente de réponse');
        this.assertKnownActive(cmd.player);
        if (cmd.player !== this.chooser()) throw new RuleError('NOT_YOUR_TURN', `${cmd.player} ne choisit pas la variante`);
        if (!VARIANT_IDS.includes(cmd.variant)) throw new RuleError('BAD_COMMAND', `Variante inconnue : ${String(cmd.variant)}`);
        if (!isVariantAvailable(cmd.variant, this.config.players.length)) {
          throw new RuleError('VARIANT_UNAVAILABLE', `${cmd.variant} n'est pas jouable à ${this.config.players.length} joueurs`);
        }
        this.startRound(cmd.variant, cmd.player, events, false);
        return events;
      }
      case 'ROUND': {
        if (this.phase_ !== 'ROUND') throw new RuleError('WRONG_PHASE', 'Aucune manche en cours');
        const sender = (cmd.command as { player?: PlayerId }).player;
        if (sender !== undefined) this.assertKnownActive(sender);
        events.push(...this.round!.apply(cmd.command));
        if (this.round!.result()) this.finishRound(events);
        return events;
      }
      case 'PROPOSE_INSURANCE': {
        if (this.phase_ !== 'VARIANT_SELECTION') {
          throw new RuleError('WRONG_PHASE', 'L\'assurance ne se propose qu\'entre deux manches');
        }
        if (this.pending) throw new RuleError('INSURANCE_PENDING', 'Une seule proposition à la fois');
        if (this.insurances.length > 0) throw new RuleError('INSURANCE_LIMIT', 'Une seule assurance par partie');
        if (this.config.players.length < 4) {
          throw new RuleError('INSURANCE_NOT_ELIGIBLE', 'L\'assurance n\'est proposable qu\'à partir de 4 joueurs');
        }
        if (cmd.insuranceType !== 'LOSER_NOT_PAYING' && cmd.insuranceType !== 'SPLIT_50_50') {
          throw new RuleError('BAD_INSURANCE', `Type d'assurance inconnu : ${String(cmd.insuranceType)}`);
        }
        for (const p of [cmd.player, cmd.partner]) if (this.isExcluded(p)) throw new RuleError('EXCLUDED', `${p} est exclu`);
        if (this.declinedPairs.includes(this.pairKey(cmd.player, cmd.partner))) {
          throw new RuleError('INSURANCE_PAIR_DECLINED', `${cmd.player} et ${cmd.partner} ont déjà refusé une assurance entre eux`);
        }
        assertInsuranceAllowed(cmd.player, cmd.partner, {
          order: this.config.players,
          scores: this.scores,
          targetPoints: this.config.targetPoints,
          existing: this.insurances,
        });
        this.pending = { proposer: cmd.player, partner: cmd.partner, type: cmd.insuranceType };
        events.push(this.publicEvent('INSURANCE_PROPOSED', { ...this.pending }));
        return events;
      }
      case 'RESPOND_INSURANCE': {
        if (!this.pending) throw new RuleError('NO_PENDING_INSURANCE', 'Aucune proposition d\'assurance en attente');
        if (cmd.player !== this.pending.partner) {
          throw new RuleError('NOT_YOUR_TURN', `Seul ${this.pending.partner} peut répondre à cette proposition`);
        }
        this.resolvePending(cmd.accept, events);
        return events;
      }
      case 'INSURANCE_TIMEOUT': {
        if (!this.pending) throw new RuleError('NO_PENDING_INSURANCE', 'Aucune proposition d\'assurance en attente');
        this.resolvePending(false, events, true);
        return events;
      }
      case 'TIMEOUT': {
        if (this.phase_ === 'ROUND') {
          events.push(...this.round!.apply({ type: 'TIMEOUT' }));
          if (this.round!.result()) this.finishRound(events);
        } else if (this.pending) {
          this.resolvePending(false, events, true); // silence = refus
        } else {
          this.autoChooseVariant(events); // le chooser n'a pas choisi en 60 s : variante tirée au hasard
        }
        return events;
      }
      case 'ADD_PLAYER': {
        if (this.phase_ !== 'VARIANT_SELECTION') throw new RuleError('WRONG_PHASE', 'Un joueur ne rejoint qu\'entre deux manches');
        if (this.config.players.includes(cmd.player)) throw new RuleError('PLAYER_EXISTS', `${cmd.player} est déjà à la table`);
        if (this.config.players.length >= this.config.maxPlayers) {
          throw new RuleError('TABLE_FULL', `La table est complète (${this.config.maxPlayers} joueurs)`);
        }
        // dernière position libre, 0 point, même mise ajoutée à la cagnotte
        this.config.players.push(cmd.player);
        this.scores[cmd.player] = 0;
        events.push(
          this.publicEvent('PLAYER_ADDED', {
            player: cmd.player,
            position: POSITION_LABELS[this.config.players.length - 1],
            potCents: this.config.stakeCents * this.config.players.length,
          }),
        );
        return events;
      }
      case 'EXCLUDE_PLAYER': {
        if (!this.config.players.includes(cmd.player)) throw new RuleError('UNKNOWN_PLAYER', `Joueur inconnu : ${cmd.player}`);
        if (this.isExcluded(cmd.player)) throw new RuleError('EXCLUDED', `${cmd.player} est déjà exclu`);
        if (this.config.players.filter((p) => !this.isExcluded(p)).length <= 1) {
          throw new RuleError('BAD_COMMAND', 'Au moins un joueur doit rester en jeu');
        }
        this.excluded.push(cmd.player); // le siège, la mise et les points sont conservés
        events.push(this.publicEvent('PLAYER_EXCLUDED', { player: cmd.player }));
        return events;
      }
      default:
        throw new RuleError('BAD_COMMAND', 'Commande inconnue');
    }
  }

  private assertKnownActive(player: PlayerId): void {
    if (!this.config.players.includes(player)) throw new RuleError('UNKNOWN_PLAYER', `Joueur inconnu : ${player}`);
    if (this.isExcluded(player)) throw new RuleError('EXCLUDED', `${player} a été exclu de la partie`);
  }

  private startRound(variant: VariantId, chooser: PlayerId, events: RoundEvent[], auto: boolean): void {
    this.round = createRound(variant, {
      players: this.config.players,
      rng: this.rng,
      stackedDeck: this.hooks.stackedDeck?.(this.roundNo_, variant),
      assistance: this.config.assistance,
    });
    this.lastChooser = chooser;
    this.phase_ = 'ROUND';
    events.push(this.publicEvent('VARIANT_CHOSEN', { roundNo: this.roundNo_, variant, chooser, auto }));
  }

  private autoChooseVariant(events: RoundEvent[]): void {
    const variants = this.availableVariants();
    const variant = variants[this.rng.int(variants.length)]!;
    this.startRound(variant, this.chooser(), events, true);
  }

  /**
   * Joueurs exclus = absents permanents : tout ce qui n'attend plus qu'eux est résolu immédiatement, comme si
   * les 60 s s'étaient écoulées (fold, ligne perdue, 0 change, retournement automatique, variante au hasard,
   * proposition d'assurance refusée).
   */
  private autoResolveAbsent(events: RoundEvent[]): void {
    for (let i = 0; i < 1000; i++) {
      if (this.phase_ === 'GAME_OVER' || this.excluded.length === 0) return;
      if (this.phase_ === 'VARIANT_SELECTION') {
        if (this.pending) {
          if (this.isExcluded(this.pending.partner) || this.isExcluded(this.pending.proposer)) {
            this.resolvePending(false, events, true);
            continue;
          }
          return;
        }
        if (this.isExcluded(this.chooser())) {
          this.autoChooseVariant(events);
          continue;
        }
        return;
      }
      const awaiting = this.round!.awaiting();
      if (awaiting.length > 0 && awaiting.every((p) => this.isExcluded(p))) {
        events.push(...this.round!.apply({ type: 'TIMEOUT' }));
        if (this.round!.result()) this.finishRound(events);
        continue;
      }
      return;
    }
    throw new Error('autoResolveAbsent : trop d\'itérations');
  }

  private resolvePending(accept: boolean, events: RoundEvent[], expired = false): void {
    const pending = this.pending!;
    this.pending = null;
    if (accept) {
      // Une fois acceptée, l'assurance est verrouillée pour toute la partie
      const insurance: Insurance = { players: [pending.proposer, pending.partner], type: pending.type };
      this.insurances.push(insurance);
      events.push(this.publicEvent('INSURANCE_ACCEPTED', { insurance }));
    } else {
      const key = this.pairKey(pending.proposer, pending.partner);
      if (!this.declinedPairs.includes(key)) this.declinedPairs.push(key);
      events.push(this.publicEvent(expired ? 'INSURANCE_EXPIRED' : 'INSURANCE_DECLINED', { ...pending }));
    }
  }

  // ---------- Fin de manche, score, victoire ----------

  private finishRound(events: RoundEvent[]): void {
    const round = this.round!;
    const result = round.result()!;
    const award = resolveRoundResult(result, this.rng); // Hold'em de départage si TIE
    const points: Record<PlayerId, number> = {};
    for (const p of this.config.players) points[p] = 0;
    if (award.kind === 'POINTS') {
      this.scores[award.winner]! += award.points;
      points[award.winner] = award.points;
    }
    const record: RoundRecord = {
      roundNo: this.roundNo_,
      chooser: this.chooser(),
      variant: round.variant,
      result,
      award,
      points,
      scoresAfter: { ...this.scores },
      summary: summarizeRound(round, result, award, events),
    };
    this.history_.push(record);
    this.round = null;
    if (award.kind === 'POINTS' && award.tiebreak) events.push(this.publicEvent('TIEBREAK_PLAYED', { tiebreak: award.tiebreak }));
    events.push(this.publicEvent('ROUND_SCORED', { record }));

    if (award.kind === 'INSTANT_VICTORY') return this.endGame(award.winner, 'STRAIGHT_FLUSH_63', events);
    if (award.kind === 'POINTS' && this.scores[award.winner]! >= this.config.targetPoints) {
      return this.endGame(award.winner, 'SCORE', events);
    }
    this.roundNo_++;
    this.phase_ = 'VARIANT_SELECTION';
    events.push(this.publicEvent('VARIANT_SELECTION_STARTED', { roundNo: this.roundNo_, chooser: this.chooser() }));
    // Notification « assurance disponible » : au moins 2 joueurs à 1 point de la fin, aucune assurance encore
    const eligible = this.eligibleForInsurance();
    if (eligible.length >= 2) {
      for (const player of eligible) {
        events.push({
          type: 'INSURANCE_AVAILABLE',
          visibility: 'PLAYER',
          audience: player,
          data: { partners: eligible.filter((p) => p !== player) },
        });
      }
    }
  }

  private endGame(winner: PlayerId, victoryType: VictoryType, events: RoundEvent[]): void {
    const order = this.config.players;
    // Une proposition encore en attente est caduque : la partie est finie
    this.pending = null;
    // Tous les joueurs assis ont versé leur mise (y compris les exclus et les arrivés en cours de partie)
    const settlement = settle({
      players: order,
      stakeCents: this.config.stakeCents,
      winner,
      insurances: this.insurances,
    });
    const partner = insuredPartner(winner, this.insurances);
    const entry = (player: PlayerId, rank: number): Standing => ({
      player,
      position: POSITION_LABELS[order.indexOf(player)]!,
      score: this.scores[player]!,
      rank,
    });
    // Classement final : uniquement le vainqueur et, s'il est assuré, son partenaire
    const standings = [entry(winner, 1), ...(partner ? [entry(partner, 2)] : [])];
    this.outcome_ = { winner, victoryType, standings, settlement, insurance: settlement.applied };
    this.phase_ = 'GAME_OVER';
    events.push(this.publicEvent('GAME_OVER', { outcome: this.outcome_ }));
  }

  private publicEvent(type: string, data: Record<string, unknown>): RoundEvent {
    return { type, visibility: 'PUBLIC', data };
  }

  // ---------- Vue et persistance ----------

  view(viewer: PlayerId | null): GameView {
    const order = this.config.players;
    const evolution: Record<PlayerId, number[]> = {};
    for (const p of order) evolution[p] = this.history_.map((h) => h.scoresAfter[p] ?? 0);
    const eligible = this.phase_ === 'GAME_OVER' ? [] : this.eligibleForInsurance();
    return {
      phase: this.phase_,
      roundNo: this.roundNo_,
      chooser: this.chooser(),
      awaiting: this.awaiting(),
      targetPoints: this.config.targetPoints,
      stakeCents: this.config.stakeCents,
      potCents: this.config.stakeCents * order.length,
      assistance: this.config.assistance ?? false,
      players: order.map((player, i) => ({
        player,
        position: POSITION_LABELS[i]!,
        score: this.scores[player]!,
        excluded: this.isExcluded(player),
      })),
      maxPlayers: this.config.maxPlayers,
      timer: this.timer(),
      warnings: this.warnings(),
      evolution,
      variants: VARIANT_IDS.map((variant) => ({ variant, available: isVariantAvailable(variant, order.length) })),
      insurance: {
        eligible,
        canPropose: this.phase_ === 'VARIANT_SELECTION' && !this.pending && eligible.length >= 2,
        blockedPartners: viewer
          ? eligible.filter((p) => p !== viewer && this.declinedPairs.includes(this.pairKey(viewer, p)))
          : [],
        pending: this.pending ? { ...this.pending } : null,
        accepted: this.insurances,
      },
      round: this.round ? this.round.view(viewer) : null,
      history: this.history_,
      outcome: this.outcome_,
    };
  }

  snapshot(): GameSnapshot {
    return JSON.parse(
      JSON.stringify({
        config: this.config,
        phase: this.phase_,
        roundNo: this.roundNo_,
        scores: this.scores,
        history: this.history_,
        round: this.round ? this.round.snapshot() : null,
        insurances: this.insurances,
        pendingInsurance: this.pending,
        declinedPairs: this.declinedPairs,
        lastChooser: this.lastChooser,
        excluded: this.excluded,
        outcome: this.outcome_,
      }),
    );
  }
}

/** Résumé public d'une manche terminée (voir `RoundSummary`). */
function summarizeRound(round: Round, result: RoundResult, award: RoundAward, events: readonly RoundEvent[]): RoundSummary {
  const summary: RoundSummary = {};
  const showdown = [...events].reverse().find((e) => e.type === 'SHOWDOWN');
  if (showdown) summary.hands = structuredClone(showdown.data.hands as RoundSummary['hands']);
  if (round instanceof Round63) summary.lines = structuredClone([...round.lineResults()]);
  if (result.kind === 'WINNER' && result.detail?.byFold) summary.byFold = true;
  if (award.kind === 'POINTS' && award.tiebreak) {
    const last = award.tiebreak.rounds.at(-1);
    const hand = last?.hands[award.winner];
    if (last && hand) {
      const best = evaluateHoldem(hand.map(parseCard), last.board.map(parseCard));
      summary.tiebreak = { category: categoryOf(best.rank), cards: best.cards.map((c) => c.code) };
    }
  }
  return summary;
}
