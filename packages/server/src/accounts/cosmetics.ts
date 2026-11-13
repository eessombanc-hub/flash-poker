import type { DatabaseSync } from 'node:sqlite';

/** Récompenses portées par un joueur (une par emplacement), telles qu'elles s'affichent à la table. */
export interface Equipped {
  title: string | null;
  frame: string | null;
  emblem: string | null;
}

const cache = new WeakMap<DatabaseSync, Map<string, Equipped>>();

/**
 * Récompenses équipées d'un compte. Lues très souvent (chaque vue de table, pour chaque joueur) : on les garde en
 * mémoire jusqu'au prochain changement d'équipement, signalé par `forgetEquipped`.
 */
export function equippedOf(db: DatabaseSync, userId: string): Equipped {
  let m = cache.get(db);
  if (!m) cache.set(db, (m = new Map()));
  const hit = m.get(userId);
  if (hit) return hit;
  const r = db.prepare('SELECT title, frame, emblem FROM cosmetics WHERE user_id = ?').get(userId) as { title: string | null; frame: string | null; emblem: string | null } | undefined;
  const value: Equipped = { title: r?.title ?? null, frame: r?.frame ?? null, emblem: r?.emblem ?? null };
  m.set(userId, value);
  return value;
}

export function forgetEquipped(db: DatabaseSync, userId: string): void {
  cache.get(db)?.delete(userId);
}

/** Version pour l'affichage à la table : absente (null) quand le joueur ne porte rien, pour alléger les vues. */
export function tableCosmetics(db: DatabaseSync, userId: string | null | undefined): Equipped | null {
  if (!userId || userId.startsWith('guest:')) return null;
  const e = equippedOf(db, userId);
  return e.title || e.frame || e.emblem ? e : null;
}
