import { cardValue, handValue } from './hand';
import { legalActions, type BjAction, type BjRound } from './round';
import type { TableRules } from './rules';

export interface Advice {
  action: BjAction;
  /** Explication courte, en français, pour le niveau pédagogique « conseils ». */
  reason: string;
}

const between = (n: number, a: number, b: number): boolean => n >= a && n <= b;

function shouldSplit(pair: number, up: number, rules: TableRules): boolean {
  switch (pair) {
    case 11:
    case 8:
      return true;
    case 9:
      return between(up, 2, 6) || up === 8 || up === 9;
    case 7:
      return between(up, 2, 7);
    case 6:
      return rules.doubleAfterSplit ? between(up, 2, 6) : between(up, 3, 6);
    case 4:
      return rules.doubleAfterSplit && between(up, 5, 6);
    case 3:
    case 2:
      return rules.doubleAfterSplit ? between(up, 2, 7) : between(up, 4, 7);
    default:
      return false; // 10 et 5 ne se séparent jamais
  }
}

function shouldSurrender(total: number, soft: boolean, up: number, rules: TableRules): boolean {
  if (soft) return false;
  if (total === 16) return up === 9 || up === 10 || up === 11;
  if (total === 15) return up === 10 || (rules.dealerHitsSoft17 && up === 11);
  if (total === 17) return rules.dealerHitsSoft17 && up === 11;
  return false;
}

/** « D » = doubler si possible, sinon `fallback`. */
type Plan = { want: 'H' | 'S' | 'D'; fallback: 'H' | 'S' };

function softPlan(total: number, up: number, rules: TableRules): Plan {
  if (total <= 14) return between(up, 5, 6) ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total <= 16) return between(up, 4, 6) ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total === 17) return between(up, 3, 6) ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total === 18) {
    if (between(up, rules.dealerHitsSoft17 ? 2 : 3, 6)) return { want: 'D', fallback: 'S' };
    return up === 2 || up === 7 || up === 8 ? { want: 'S', fallback: 'S' } : { want: 'H', fallback: 'H' };
  }
  if (total === 19 && rules.dealerHitsSoft17 && up === 6) return { want: 'D', fallback: 'S' };
  return { want: 'S', fallback: 'S' };
}

function hardPlan(total: number, up: number, rules: TableRules): Plan {
  if (total <= 8) return { want: 'H', fallback: 'H' };
  if (total === 9) return between(up, 3, 6) ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total === 10) return between(up, 2, 9) ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total === 11) return up <= 10 || rules.dealerHitsSoft17 ? { want: 'D', fallback: 'H' } : { want: 'H', fallback: 'H' };
  if (total === 12) return between(up, 4, 6) ? { want: 'S', fallback: 'S' } : { want: 'H', fallback: 'H' };
  if (total <= 16) return between(up, 2, 6) ? { want: 'S', fallback: 'S' } : { want: 'H', fallback: 'H' };
  return { want: 'S', fallback: 'S' };
}

const UPCARD = (up: number): string => (up === 11 ? 'un As' : `un ${up}`);

/** Stratégie de base du Blackjack, adaptée aux règles de la table (jeux, 17 soft, doublement après séparation, abandon). */
export function recommend(r: BjRound, chips = Number.POSITIVE_INFINITY): Advice | null {
  const legal = legalActions(r, chips);
  if (legal.length === 0) return null;
  const h = r.hands[r.active]!;
  const up = cardValue(r.dealer[0]!);
  const v = handValue(h.cards);
  const upText = UPCARD(up);
  const pair = h.cards.length === 2 && cardValue(h.cards[0]!) === cardValue(h.cards[1]!) ? cardValue(h.cards[0]!) : null;

  if (pair !== null && legal.includes('SPLIT') && shouldSplit(pair, up, r.rules)) {
    return { action: 'SPLIT', reason: pair === 11 || pair === 8 ? 'Cette paire se sépare toujours. As et 8 valent mieux en deux mains.' : `Le croupier montre ${upText}. Séparer la paire est plus rentable que de la jouer ensemble.` };
  }
  if (legal.includes('SURRENDER') && shouldSurrender(v.total, v.soft, up, r.rules)) {
    return { action: 'SURRENDER', reason: `${v.total} contre ${upText} perd le plus souvent. Abandonner récupère la moitié de la mise.` };
  }
  const plan = v.soft ? softPlan(v.total, up, r.rules) : hardPlan(v.total, up, r.rules);
  let action: BjAction;
  let reason: string;
  if (plan.want === 'D' && legal.includes('DOUBLE')) {
    action = 'DOUBLE';
    reason = `Le croupier montre ${upText}. Votre ${v.soft ? 'main souple' : 'total'} de ${v.total} est bien placé pour doubler.`;
  } else {
    const key = plan.want === 'D' ? plan.fallback : plan.want;
    action = key === 'S' ? 'STAND' : 'HIT';
    reason =
      action === 'STAND'
        ? up >= 7 && v.total >= 17
          ? `${v.total} est assez fort : tirer risquerait de dépasser 21 pour un gain minime.`
          : `Le croupier montre ${upText}, une carte faible : il dépasse 21 souvent, laissez-le tirer.`
        : v.soft
          ? 'Main souple : une carte de plus ne peut pas vous faire dépasser 21.'
          : `${v.total} ne suffit pas contre ${upText} : il faut tirer.`;
  }
  if (!legal.includes(action)) action = legal.includes('STAND') ? 'STAND' : legal[0]!;
  return { action, reason };
}
