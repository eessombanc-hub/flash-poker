/**
 * Fenêtre glissante : au plus `max` tentatives par clé (adresse IP, compte…) sur `windowMs`.
 * Les clés inactives sont purgées au fil de l'eau et le nombre de clés suivies est plafonné, de sorte que la
 * mémoire reste bornée même si un attaquant fait varier la clé (adresses multiples, pseudos inventés…).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number,
    private readonly maxKeys = 20_000,
  ) {}

  /** Enregistre une tentative ; false si la limite est dépassée. */
  hit(key: string): boolean {
    const t = this.now();
    this.sweep(t);
    const recent = this.recent(key, t);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    // Table saturée : on refuse plutôt que de grossir sans limite (cas d'un déluge de clés distinctes).
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) return false;
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Vrai si la clé a encore de la marge, sans rien enregistrer. */
  allows(key: string): boolean {
    return this.recent(key, this.now()).length < this.max;
  }

  /** Oublie une clé (ex. connexion réussie). */
  clear(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }

  private recent(key: string, t: number): number[] {
    return (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
  }

  /** Purge périodique des clés dont toutes les tentatives sont sorties de la fenêtre. */
  private sweep(t: number): void {
    if (t - this.lastSweep < Math.min(this.windowMs, 60_000) && this.hits.size < this.maxKeys) return;
    this.lastSweep = t;
    for (const [k, v] of this.hits) if (!v.some((x) => x > t - this.windowMs)) this.hits.delete(k);
  }
}
