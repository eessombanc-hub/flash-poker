import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { GameClient } from './client';
import { ClientProvider } from './context';

/** Nombre maximal de tables tenues en même temps (poker, Blackjack et Tableau confondus). */
export const MAX_TABLES = 4;

interface SlotsState {
  /** Emplacement de poker actuellement affiché. */
  active: number;
  /** Tables hors poker (Blackjack, Tableau) comptées dans le plafond. */
  external: number;
  /** Tables hors poker tenues par le joueur (pour la vue mosaïque). */
  externalTables: ExternalTable[];
}

export interface ExternalTable {
  game: 'blackjack' | 'tableau';
  code: string;
}

/**
 * Emplacements de tables de poker : chaque emplacement est un client indépendant (sa propre connexion et sa propre
 * session conservée), ce qui permet de tenir plusieurs tables à la fois et de passer de l'une à l'autre.
 */
export class TableSlots {
  readonly store: StoreApi<SlotsState> = createStore<SlotsState>(() => ({ active: 0, external: 0, externalTables: [] }));

  /**
   * `only` : cadre intégré de la vue mosaïque. Il ne tient que cet emplacement (les autres sont gérés par les autres
   * cadres ou par la page principale), pour ne pas multiplier les connexions.
   */
  constructor(readonly clients: GameClient[], private readonly only: number | null = null) {
    // Au rechargement, l'affichage reprend sur la première table encore ouverte.
    const first = only ?? clients.findIndex((c) => c.state.session);
    if (first > 0) this.store.setState({ active: first });
  }

  get active(): number {
    return this.store.getState().active;
  }
  get client(): GameClient {
    return this.clients[this.active]!;
  }
  setActive(i: number): void {
    if (i >= 0 && i < this.clients.length) this.store.setState({ active: i });
  }
  /** Emplacements portant une session de poker. */
  occupied(): number[] {
    return this.clients.flatMap((c, i) => (c.state.session ? [i] : []));
  }
  total(): number {
    return this.occupied().length + this.store.getState().external;
  }
  setExternal(n: number): void {
    if (n !== this.store.getState().external) this.store.setState({ external: n });
  }
  /** Peut-on ouvrir une table de plus ? */
  canOpen(): boolean {
    return this.total() < MAX_TABLES && this.clients.some((c) => !c.state.session);
  }
  /** Affiche un emplacement libre (celui qui l'est déjà, sinon le premier) ; faux si le plafond est atteint. */
  focusFree(): boolean {
    if (!this.client.state.session) return this.total() < MAX_TABLES;
    if (!this.canOpen()) return false;
    this.setActive(this.clients.findIndex((c) => !c.state.session));
    return true;
  }
  private held(): GameClient[] {
    return this.only === null ? this.clients : [this.clients[this.only]!];
  }
  resumeAll(): void {
    for (const c of this.held()) c.resume();
  }
  disposeAll(): void {
    for (const c of this.held()) c.dispose();
  }
  /** Tables hors poker connues (Blackjack, Tableau), mises à jour par le bandeau « Mes tables ». */
  setExternalTables(list: ExternalTable[]): void {
    const cur = this.store.getState().externalTables;
    if (JSON.stringify(cur) !== JSON.stringify(list)) this.store.setState({ externalTables: list });
  }
  /** La vue mosaïque garde les connexions : la page principale les coupe, puis les reprend à la fermeture. */
  suspendForMosaic(): void {
    for (const c of this.clients) c.dispose();
  }
  resumeFromMosaic(): void {
    for (const c of this.clients) {
      c.syncFromStorage();
      c.resume();
    }
  }
}

const SlotsContext = createContext<TableSlots | null>(null);

/** Fournit le client de l'emplacement affiché ; les autres restent connectés en arrière-plan. */
export function SlotsProvider({ slots, children }: { slots: TableSlots; children: ReactNode }) {
  const active = useStore(slots.store, (s) => s.active);
  useEffect(() => {
    slots.resumeAll();
    return () => slots.disposeAll();
  }, [slots]);
  return (
    <SlotsContext.Provider value={slots}>
      <ClientProvider client={slots.clients[active]!}>{children}</ClientProvider>
    </SlotsContext.Provider>
  );
}

/** Emplacements de tables, ou null si l'application tourne avec un seul client (tests, intégrations). */
export function useSlots(): TableSlots | null {
  return useContext(SlotsContext);
}
