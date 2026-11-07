export type ServerErrorCode =
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NICKNAME_TAKEN'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'WRONG_STATE'
  | 'RATE_LIMITED'
  | 'RULE'
  | 'EMAIL_TAKEN'
  | 'NICKNAME_RESERVED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

const STATUS: Record<ServerErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  NICKNAME_TAKEN: 409,
  WRONG_STATE: 409,
  RULE: 422,
  RATE_LIMITED: 429,
  EMAIL_TAKEN: 409,
  NICKNAME_RESERVED: 409,
  NOT_FOUND: 404,
  UNAVAILABLE: 503,
};

export class ServerError extends Error {
  readonly status: number;
  constructor(
    readonly code: ServerErrorCode,
    message: string,
    /** Code de la règle du jeu refusée (`RuleError.code`), si `code === 'RULE'`. */
    readonly ruleCode?: string,
  ) {
    super(message);
    this.name = 'ServerError';
    this.status = STATUS[code];
  }
}
