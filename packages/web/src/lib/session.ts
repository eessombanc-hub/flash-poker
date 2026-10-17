export interface Session {
  code: string;
  token: string;
  playerId: string;
  nickname: string;
}

/** Conservation du jeton de session dans le navigateur : la reconnexion retrouve siège, cartes et score. */
export interface SessionStore {
  load(): Session | null;
  save(session: Session): void;
  clear(): void;
}

export class LocalSessionStore implements SessionStore {
  constructor(
    private readonly key = 'poker.session.v1',
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
  ) {}

  load(): Session | null {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const s = JSON.parse(raw) as Partial<Session>;
      return s && typeof s.code === 'string' && typeof s.token === 'string' && typeof s.playerId === 'string' && typeof s.nickname === 'string'
        ? (s as Session)
        : null;
    } catch {
      return null;
    }
  }
  save(session: Session): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(session));
    } catch {
      /* stockage indisponible (navigation privée…) : la session reste en mémoire */
    }
  }
  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignoré */
    }
  }
}

export class MemorySessionStore implements SessionStore {
  private value: Session | null = null;
  load(): Session | null {
    return this.value;
  }
  save(session: Session): void {
    this.value = session;
  }
  clear(): void {
    this.value = null;
  }
}
