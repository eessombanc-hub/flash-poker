import type { DatabaseSync } from 'node:sqlite';
import { ServerError } from '../errors';
import type { LedgerEntry, ShopOffer, WalletView } from './types';

/**
 * Portefeuille de jetons des joueurs inscrits.
 *
 * Les jetons n'ont aucune valeur monétaire : ils ne se retirent pas, ne se convertissent pas en argent et ne se
 * transfèrent pas d'un joueur à l'autre. Ils servent uniquement de mise dans les parties.
 *
 * - Chaque nouveau compte reçoit 100 jetons.
 * - Toutes les 3 heures au plus, un compte sous 100 jetons remonte à 100 ; à 100 ou plus, il ne reçoit rien.
 *   La remontée est appliquée à la prochaine consultation du solde (affichage, mise, etc.).
 * - Chaque mouvement est inscrit au journal (`chip_ledger`) avec le solde qui en résulte.
 */
export const WELCOME_CHIPS = 100;
export const REFILL_LEVEL = 100;
export const REFILL_EVERY_MS = 3 * 3_600_000;

/**
 * Offre commerciale. Base : 500 jetons pour 1,99 €, puis plus de jetons par euro dans les packs plus grands.
 * Garde-fous : achats réservés aux majeurs (attestation), au plus 50 € par période de 7 jours, offre de bienvenue
 * une seule fois par compte, pas de compte à rebours ni d'offre surprise.
 */
export const SHOP_OFFERS: readonly ShopOffer[] = [
  { id: 'bienvenue', name: 'Offre de bienvenue', chips: 1_000, priceCents: 99, oncePerAccount: true, tagline: 'Une seule fois par compte' },
  { id: 'pile', name: 'Pile', chips: 500, priceCents: 199, oncePerAccount: false, tagline: 'Pour quelques tables' },
  { id: 'rouleau', name: 'Rouleau', chips: 1_400, priceCents: 499, oncePerAccount: false, tagline: '+12 % de jetons' },
  { id: 'coffret', name: 'Coffret', chips: 3_000, priceCents: 999, oncePerAccount: false, tagline: '+20 % de jetons', highlight: true },
  { id: 'mallette', name: 'Mallette', chips: 6_500, priceCents: 1_999, oncePerAccount: false, tagline: '+30 % de jetons' },
  { id: 'reserve', name: 'Réserve du club', chips: 17_500, priceCents: 4_999, oncePerAccount: false, tagline: '+40 % de jetons' },
];
export const WEEKLY_SPEND_CAP_CENTS = 5_000;
const WEEK_MS = 7 * 24 * 3_600_000;

type Row = Record<string, unknown>;

export class Wallet {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => number,
  ) {}

  /** Crédite les 100 jetons de bienvenue d'un nouveau compte. */
  open(userId: string): void {
    this.db.prepare('UPDATE users SET chips = ?, refill_at = ? WHERE id = ?').run(WELCOME_CHIPS, this.now(), userId);
    this.log(userId, WELCOME_CHIPS, WELCOME_CHIPS, 'Jetons de bienvenue');
  }

  /** Solde après application de la remontée à 100 jetons si elle est due. */
  view(userId: string): WalletView {
    const { chips, refillAt } = this.refill(userId);
    return {
      chips,
      refillLevel: REFILL_LEVEL,
      refillEveryMs: REFILL_EVERY_MS,
      nextRefillAt: chips < REFILL_LEVEL ? refillAt + REFILL_EVERY_MS : null,
    };
  }

  private refill(userId: string): { chips: number; refillAt: number } {
    const r = this.db.prepare('SELECT chips, refill_at FROM users WHERE id = ?').get(userId) as Row | undefined;
    if (!r) throw new ServerError('NOT_FOUND', 'Compte introuvable');
    const chips = r.chips as number;
    const refillAt = r.refill_at as number;
    const now = this.now();
    if (chips < REFILL_LEVEL && now - refillAt >= REFILL_EVERY_MS) {
      this.db.prepare('UPDATE users SET chips = ?, refill_at = ? WHERE id = ?').run(REFILL_LEVEL, now, userId);
      this.log(userId, REFILL_LEVEL - chips, REFILL_LEVEL, 'Remontée à 100 jetons');
      return { chips: REFILL_LEVEL, refillAt: now };
    }
    return { chips, refillAt };
  }

  /** Retire une mise ; refuse si le solde ne suffit pas (rien n'est retiré). */
  debit(userId: string, amount: number, reason: string): void {
    if (amount <= 0) return;
    const { chips, refillAt } = this.refill(userId);
    const changed = this.db.prepare('UPDATE users SET chips = chips - ? WHERE id = ? AND chips >= ?').run(amount, userId, amount);
    if (Number(changed.changes) === 0) {
      const wait = chips < REFILL_LEVEL ? ` Votre solde remontera à ${REFILL_LEVEL} jetons ${untilText(refillAt + REFILL_EVERY_MS - this.now())}.` : '';
      throw new ServerError('INSUFFICIENT_CHIPS', `Mise de ${amount} jetons : vous en avez ${chips}.${wait}`);
    }
    // Premier passage sous 100 jetons depuis la dernière remontée : le délai de 3 heures part de maintenant.
    if (chips >= REFILL_LEVEL && chips - amount < REFILL_LEVEL) this.db.prepare('UPDATE users SET refill_at = ? WHERE id = ?').run(this.now(), userId);
    this.log(userId, -amount, chips - amount, reason);
  }

  credit(userId: string, amount: number, reason: string): void {
    if (amount <= 0) return;
    const exists = this.db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?').run(amount, userId);
    if (Number(exists.changes) === 0) return; // compte supprimé entre-temps
    const r = this.db.prepare('SELECT chips FROM users WHERE id = ?').get(userId) as Row;
    this.log(userId, amount, r.chips as number, reason);
  }

  ledger(userId: string, limit = 50): LedgerEntry[] {
    return (this.db.prepare('SELECT at, delta, balance, reason FROM chip_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as Row[]).map((r) => ({
      at: r.at as number,
      delta: r.delta as number,
      balance: r.balance as number,
      reason: r.reason as string,
    }));
  }

  // ---------- Boutique ----------

  /** Offres proposées à ce joueur (l'offre de bienvenue disparaît une fois achetée) et dépense possible sur 7 jours. */
  shop(userId: string): { offers: ShopOffer[]; spentThisWeekCents: number; weeklyCapCents: number } {
    const spent = this.spentThisWeek(userId);
    const bought = new Set((this.db.prepare('SELECT DISTINCT offer_id FROM purchases WHERE user_id = ?').all(userId) as Row[]).map((r) => r.offer_id as string));
    return { offers: SHOP_OFFERS.filter((o) => !(o.oncePerAccount && bought.has(o.id))), spentThisWeekCents: spent, weeklyCapCents: WEEKLY_SPEND_CAP_CENTS };
  }

  private spentThisWeek(userId: string): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(price_cents), 0) AS s FROM purchases WHERE user_id = ? AND at > ?').get(userId, this.now() - WEEK_MS) as Row;
    return Number(r.s);
  }

  /** Vérifie qu'un achat est permis, avant de lancer le paiement. */
  checkPurchase(userId: string, offerId: string, adult: boolean): ShopOffer {
    const offer = SHOP_OFFERS.find((o) => o.id === offerId);
    if (!offer) throw new ServerError('NOT_FOUND', 'Offre introuvable');
    if (!adult) throw new ServerError('FORBIDDEN', 'L’achat de jetons est réservé aux personnes majeures');
    if (offer.oncePerAccount && this.db.prepare('SELECT 1 FROM purchases WHERE user_id = ? AND offer_id = ?').get(userId, offerId)) {
      throw new ServerError('BAD_REQUEST', 'Offre déjà utilisée sur ce compte');
    }
    if (this.spentThisWeek(userId) + offer.priceCents > WEEKLY_SPEND_CAP_CENTS) {
      throw new ServerError('RATE_LIMITED', 'Plafond de 50 € d’achats sur 7 jours atteint : réessayez plus tard');
    }
    return offer;
  }

  /**
   * Crédite un achat confirmé par le prestataire de paiement. Idempotent : la même référence de paiement
   * ne crédite qu'une fois, même si la confirmation arrive plusieurs fois.
   */
  grantPurchase(userId: string, offerId: string, paymentRef: string): boolean {
    const offer = SHOP_OFFERS.find((o) => o.id === offerId);
    if (!offer) throw new ServerError('NOT_FOUND', 'Offre introuvable');
    const ins = this.db
      .prepare('INSERT OR IGNORE INTO purchases (payment_ref, user_id, offer_id, chips, price_cents, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(paymentRef, userId, offer.id, offer.chips, offer.priceCents, this.now());
    if (Number(ins.changes) === 0) return false;
    this.credit(userId, offer.chips, `Achat : ${offer.name}`);
    return true;
  }

  private log(userId: string, delta: number, balance: number, reason: string): void {
    this.db.prepare('INSERT INTO chip_ledger (user_id, at, delta, balance, reason) VALUES (?, ?, ?, ?, ?)').run(userId, this.now(), delta, balance, reason.slice(0, 120));
  }
}

function untilText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `dans ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}
