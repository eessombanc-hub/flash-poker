import type { PlayerId } from '../core/cardEngine';
import { RuleError } from '../variants/types';

/**
 * ASSURANCE — règles pures (éligibilité et règlement). Le déroulé « proposition → acceptation → verrouillage »
 * sera branché sur le Game Manager avec le serveur : son moment et son expiration ne sont pas encore définis.
 *
 * Règles validées :
 * - une assurance lie exactement 2 joueurs, tous deux à 1 point de la fin de la partie ;
 * - un joueur déjà assuré ne peut pas entrer dans une autre assurance ;
 * - l'assurance ne change jamais le vainqueur sportif : elle ne modifie que la répartition de la cagnotte ;
 * - si le vainqueur n'est pas assuré, il récupère toute la cagnotte.
 */
export type InsuranceType =
  /** « Le perdant ne paye pas » : le vainqueur reçoit tout sauf la mise de son partenaire assuré, qui la récupère. */
  | 'LOSER_NOT_PAYING'
  /** « 50 / 50 » : les deux joueurs assurés se partagent la cagnotte à parts égales. */
  | 'SPLIT_50_50';

export interface Insurance {
  players: readonly [PlayerId, PlayerId];
  type: InsuranceType;
}

/** Joueurs à exactement 1 point de l'objectif, dans l'ordre des positions. */
export function playersOneFromEnd(order: readonly PlayerId[], scores: Record<PlayerId, number>, targetPoints: number): PlayerId[] {
  return order.filter((p) => scores[p] === targetPoints - 1);
}

export interface ProposalContext {
  order: readonly PlayerId[];
  scores: Record<PlayerId, number>;
  targetPoints: number;
  existing: readonly Insurance[];
}

/** Refuse (RuleError) toute proposition contraire aux règles ; ne modifie rien. */
export function assertInsuranceAllowed(proposer: PlayerId, partner: PlayerId, ctx: ProposalContext): void {
  for (const p of [proposer, partner]) {
    if (!ctx.order.includes(p)) throw new RuleError('UNKNOWN_PLAYER', `Joueur inconnu : ${p}`);
  }
  if (proposer === partner) throw new RuleError('BAD_INSURANCE', 'Une assurance concerne exactement 2 joueurs');
  const eligible = playersOneFromEnd(ctx.order, ctx.scores, ctx.targetPoints);
  for (const p of [proposer, partner]) {
    if (!eligible.includes(p)) {
      throw new RuleError('INSURANCE_NOT_ELIGIBLE', `${p} n'est pas à 1 point de la fin de la partie`);
    }
    if (ctx.existing.some((i) => i.players.includes(p))) {
      throw new RuleError('INSURANCE_ALREADY_INSURED', `${p} est déjà assuré`);
    }
  }
}

/** Partenaire assuré du vainqueur, ou null si le vainqueur n'est pas assuré. */
export function insuredPartner(winner: PlayerId, insurances: readonly Insurance[]): PlayerId | null {
  const ins = insurances.find((i) => i.players.includes(winner));
  return ins ? (ins.players[0] === winner ? ins.players[1] : ins.players[0]) : null;
}

export interface SettlementInput {
  /** Tous les joueurs ayant versé leur mise. */
  players: readonly PlayerId[];
  /** Mise de chaque joueur, en centimes. */
  stakeCents: number;
  winner: PlayerId;
  insurances: readonly Insurance[];
}

export interface Settlement {
  potCents: number;
  /** Somme exacte de la cagnotte (en centimes) ; jamais de montant négatif. */
  payouts: Record<PlayerId, number>;
  /** Assurance appliquée (celle qui contient le vainqueur), sinon null. */
  applied: Insurance | null;
}

/**
 * Répartition de la cagnotte (virtuelle en MVP), en centimes entiers.
 * Sans assurance du vainqueur : il reçoit tout. « Le perdant ne paye pas » : vainqueur = cagnotte − mise du
 * partenaire, partenaire = sa mise. « 50/50 » : moitié chacun ; HYPOTHÈSE (à confirmer) : le centime impair
 * éventuel revient au vainqueur.
 */
export function settle(input: SettlementInput): Settlement {
  const { players, stakeCents, winner, insurances } = input;
  if (!players.includes(winner)) throw new RuleError('UNKNOWN_PLAYER', `Vainqueur inconnu : ${winner}`);
  if (!Number.isInteger(stakeCents) || stakeCents < 0) throw new RuleError('BAD_CONFIG', 'Mise invalide');
  const seen = new Set<PlayerId>();
  for (const ins of insurances) {
    const [a, b] = ins.players;
    if (a === b) throw new RuleError('BAD_INSURANCE', 'Une assurance concerne exactement 2 joueurs');
    for (const p of [a, b]) {
      if (!players.includes(p)) throw new RuleError('UNKNOWN_PLAYER', `Joueur assuré inconnu : ${p}`);
      if (seen.has(p)) throw new RuleError('INSURANCE_ALREADY_INSURED', `${p} figure dans deux assurances`);
      seen.add(p);
    }
  }

  const potCents = stakeCents * players.length;
  const payouts: Record<PlayerId, number> = {};
  for (const p of players) payouts[p] = 0;

  const applied = insurances.find((i) => i.players.includes(winner)) ?? null;
  const partner = insuredPartner(winner, insurances);
  if (!applied || partner === null) {
    payouts[winner] = potCents;
    return { potCents, payouts, applied: null };
  }
  if (applied.type === 'LOSER_NOT_PAYING') {
    payouts[partner] = stakeCents;
    payouts[winner] = potCents - stakeCents;
  } else {
    payouts[partner] = Math.floor(potCents / 2);
    payouts[winner] = potCents - payouts[partner]!;
  }
  return { potCents, payouts, applied };
}
