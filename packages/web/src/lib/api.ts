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
  stakeCents: number;
  /** Partie « avec assistance », proposée aux joueurs (ils doivent tous l'approuver en salle d'attente). */
  assistance?: boolean;
  /** Salle privée : absente de la liste publique, entrée par code ou lien d'invitation uniquement. */
  private?: boolean;
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
  stakeCents: number;
  assistance: boolean;
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
