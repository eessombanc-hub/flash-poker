import type { VariantId } from './types';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly ruleCode?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CreateRoomInput {
  name: string;
  maxPlayers: number;
  targetPoints: number;
  stakeChips: number;
  /** Partie « avec assistance », proposée aux joueurs (ils doivent tous l'approuver en salle d'attente). */
  assistance?: boolean;
  /** Mode entraînement : nombre d'adversaires CPU (1 à 5). La table est privée et la partie démarre aussitôt. */
  cpu?: number;
  /** Salle privée : absente de la liste publique, entrée par code ou lien d'invitation uniquement. */
  private?: boolean;
  /** Variante imposée pour toutes les manches (absent : au choix à chaque manche). */
  variant?: VariantId;
  teats?: number;
  sideBets?: boolean;
  nickname: string;
  avatar?: string;
}
export interface JoinRoomInput {
  nickname: string;
  avatar?: string;
}
export interface RoomAccess {
  code: string;
  playerId: string;
  token: string;
}
export interface RoomSummary {
  code: string;
  name: string;
  status: 'WAITING' | 'RUNNING';
  maxPlayers: number;
  seatsLeft: number;
  targetPoints: number;
  stakeChips: number;
  assistance: boolean;
  variant?: VariantId;
}

async function post<T>(baseUrl: string, path: string, body: unknown, fetchFn: typeof fetch, accountToken?: string | null): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (accountToken) headers.authorization = `Bearer ${accountToken}`; // joueur inscrit : pseudo et avatar du compte
    res = await fetchFn(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('NETWORK', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide ou invalide */
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; ruleCode?: string } } | null)?.error;
    throw new ApiError(e?.code ?? 'HTTP', e?.message ?? `Erreur serveur (${res.status})`, e?.ruleCode);
  }
  return data as T;
}

export const createRoom = (baseUrl: string, input: CreateRoomInput, fetchFn: typeof fetch = fetch, accountToken?: string | null): Promise<RoomAccess> =>
  post<RoomAccess>(baseUrl, '/rooms', input, fetchFn, accountToken);

export const joinRoom = (baseUrl: string, code: string, input: JoinRoomInput, fetchFn: typeof fetch = fetch, accountToken?: string | null): Promise<Omit<RoomAccess, 'code'>> =>
  post(baseUrl, `/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, input, fetchFn, accountToken);

export async function listRooms(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<RoomSummary[]> {
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/rooms`);
  } catch {
    throw new ApiError('NETWORK', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  if (!res.ok) throw new ApiError('HTTP', `Erreur serveur (${res.status})`);
  const data = (await res.json()) as { rooms: RoomSummary[] };
  return data.rooms;
}

/** Partie ouverte d'un autre jeu que le poker (Blackjack à plusieurs, duel amical du Tableau). */
export interface OpenTable {
  game: 'blackjack' | 'tableau';
  code: string;
  /** Nom de la table (Blackjack) ou variante (Tableau). */
  title: string;
  host: string;
  /** Places humaines encore libres. */
  seatsLeft: number;
  /** Places humaines au total. */
  seats: number;
  variant?: 'classic' | 'hand5';
}

/** Parties ouvertes du Blackjack et du Tableau ; une liste indisponible est simplement vide (le poker reste affiché). */
export async function listOpenTables(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<OpenTable[]> {
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetchFn(`${baseUrl}${path}`);
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [bj, tb] = await Promise.all([
    get<{ tables: { code: string; tableName: string; host: string; seatsLeft: number; humanSeats: number }[] }>('/blackjack/tables'),
    get<{ games: { code: string; variant: 'classic' | 'hand5'; nickname: string }[] }>('/tableau/games'),
  ]);
  return [
    ...(bj?.tables ?? []).map((t): OpenTable => ({ game: 'blackjack', code: t.code, title: t.tableName, host: t.host, seatsLeft: t.seatsLeft, seats: t.humanSeats })),
    ...(tb?.games ?? []).map((g): OpenTable => ({ game: 'tableau', code: g.code, title: g.variant, host: g.nickname, seatsLeft: 1, seats: 2, variant: g.variant })),
  ];
}

export interface LiveStats {
  online: number;
  rooms: number;
}
/** Signale cet onglet (identifiant aléatoire) et renvoie le nombre de joueurs en ligne et de parties ouvertes. */
export async function fetchStats(baseUrl: string, visitor: string, fetchFn: typeof fetch = fetch): Promise<LiveStats> {
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/stats?v=${encodeURIComponent(visitor)}`);
  } catch {
    throw new ApiError('NETWORK', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  if (!res.ok) throw new ApiError('HTTP', `Erreur serveur (${res.status})`);
  return (await res.json()) as LiveStats;
}
