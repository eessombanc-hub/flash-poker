/** Horloge et minuteurs injectés : réels en production, simulés en test. */
export interface Timer {
  cancel(): void;
}
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): Timer;
}

export class RealScheduler implements Scheduler {
  now(): number {
    return Date.now();
  }
  setTimeout(fn: () => void, ms: number): Timer {
    const handle = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(handle) };
  }
}

/** Horloge manuelle pour les tests : `advance(ms)` déclenche les minuteurs échus, dans l'ordre. */
export class ManualScheduler implements Scheduler {
  private t: number;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  constructor(start = 1_700_000_000_000) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): Timer {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return { cancel: () => void this.timers.delete(id) };
  }
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      let next: { id: number; at: number } | null = null;
      for (const [id, tm] of this.timers) {
        if (tm.at <= target && (next === null || tm.at < next.at || (tm.at === next.at && id < next.id))) next = { id, at: tm.at };
      }
      if (next === null) break;
      const tm = this.timers.get(next.id)!;
      this.timers.delete(next.id);
      this.t = tm.at;
      tm.fn();
    }
    this.t = target;
  }
  pending(): number {
    return this.timers.size;
  }
}
