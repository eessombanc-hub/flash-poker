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

async function post<T>(baseUrl: string, path: string, body: unknown, fetchFn: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

export const createRoom = (baseUrl: string, input: CreateRoomInput, fetchFn: typeof fetch = fetch): Promise<RoomAccess> =>
  post<RoomAccess>(baseUrl, '/rooms', input, fetchFn);

export const joinRoom = (baseUrl: string, code: string, input: JoinRoomInput, fetchFn: typeof fetch = fetch): Promise<Omit<RoomAccess, 'code'>> =>
  post(baseUrl, `/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, input, fetchFn);
