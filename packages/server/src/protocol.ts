import { z } from 'zod';
import type { GameView, RoundEvent, VariantId } from '@poker/engine';

// ---------- Entrées client (validées côté serveur) ----------

const nickname = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(20).regex(/^[\p{L}\p{N} _.'-]+$/u, 'Pseudo : lettres, chiffres, espace, _ . \' -'));
/** Avatar facultatif : identifiant de préréglage (jamais une URL). */
const avatar = z.string().regex(/^[a-z0-9_-]{1,32}$/).optional();

/** Cave : chaque joueur reçoit 1 000 jetons au début de chaque partie ; la mise est prise dessus (jetons sans valeur monétaire). */
export const STARTING_CHIPS = 1_000;

export const createRoomSchema = z.object({
  name: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(40)),
  maxPlayers: z.number().int().min(2).max(6),
  targetPoints: z.number().int().min(1).max(5),
  stakeChips: z.number().int().min(0).max(STARTING_CHIPS), // jetons, pris sur la cave
  /** Partie « avec assistance », proposée par l'hôte : doit être approuvée par tous les joueurs de la salle
   * avant le départ, sinon la partie démarre sans assistance (voir `lobby:approveAssistance`). Faux par défaut. */
  assistance: z.boolean().optional(),
  /** Mode entraînement : nombre d'adversaires CPU (1 à 5). La table est alors privée (complète dès la création,
   * `maxPlayers` est ramené à CPU + 1) et la partie démarre aussitôt. Absent : partie entre humains. */
  cpu: z.number().int().min(1).max(5).optional(),
  /** Toutes les manches se jouent dans cette variante, en entraînement comme entre amis (absent : variante au choix à chaque manche). */
  variant: z.enum(['V6_3', 'V6_1', 'CLOSED_1', 'CLOSED_2', 'AVIATION', 'AVIA_6', 'MORPION', 'LE10']).optional(),
  /** 6-3 imposé : nombre de tétines (0 à 2) et paris extérieurs. */
  teats: z.number().int().min(0).max(2).optional(),
  sideBets: z.boolean().optional(),
  /** Salle privée : non listée dans « Parties ouvertes », on n'y entre qu'avec le code (ou le lien d'invitation). */
  private: z.boolean().optional(),
  nickname,
  avatar,
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({ nickname, avatar });
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

const cardCode = z.string().regex(/^[2-9TJQKA][cdhs]$/);
export const clientCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CHOOSE_VARIANT'),
    variant: z.enum(['V6_3', 'V6_1', 'CLOSED_1', 'CLOSED_2', 'AVIATION', 'AVIA_6', 'MORPION', 'LE10']),
    /** 6-3 uniquement : nombre de tétines (0 à 2) et ouverture des paris extérieurs. */
    teats: z.number().int().min(0).max(2).optional(),
    sideBets: z.boolean().optional(),
  }),
  /** 6-3, phase de paris extérieurs : remplace les paris du joueur (liste vide = aucun pari). */
  z.object({ type: z.literal('BET'), bets: z.array(z.object({ line: z.union([z.literal(1), z.literal(2), z.literal(3)]), amount: z.number().int().min(1).max(STARTING_CHIPS) })).max(3) }),
  z.object({ type: z.literal('SELECT'), cards: z.array(cardCode).max(3), line: z.number().int().min(0).max(7).nullable().optional() }),
  z.object({ type: z.literal('VALIDATE') }),
  z.object({ type: z.literal('REVEAL') }),
  z.object({ type: z.literal('PROPOSE_INSURANCE'), partner: z.string().min(1).max(64), insuranceType: z.enum(['LOSER_NOT_PAYING', 'SPLIT_50_50']) }),
  z.object({ type: z.literal('RESPOND_INSURANCE'), accept: z.boolean() }),
]);
/** Les commandes d'échéance (TIMEOUT…), d'arrivée et d'exclusion ne peuvent JAMAIS venir d'un client. */
export type ClientCommand = z.infer<typeof clientCommandSchema>;

export const excludeSchema = z.object({ playerId: z.string().min(1).max(64) });
export const approveAssistanceSchema = z.object({ approve: z.boolean() });

/** Objets amusants que l'on peut envoyer à un autre joueur (liste fermée : jamais de texte libre ni d'URL). */
export const THROW_ITEMS = ['tomato', 'bouquet', 'pie', 'kiss', 'ice', 'beer', 'banana', 'popcorn', 'trophy', 'heart'] as const;
export type ThrowItem = (typeof THROW_ITEMS)[number];
export const CHAT_MAX_CHARS = 140;

/** Caractères de contrôle et de mise en forme invisibles retirés, espaces réduits : ce qui reste est du texte brut. */
const chatText = z
  .string()
  .max(CHAT_MAX_CHARS * 4)
  .transform((s) => s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(CHAT_MAX_CHARS));
export const socialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chat'), text: chatText }),
  z.object({ kind: z.literal('throw'), item: z.enum(THROW_ITEMS), to: z.string().min(1).max(64) }),
]);
export type SocialInput = z.infer<typeof socialSchema>;

export const authSchema = z.object({ code: z.string().min(1).max(16), token: z.string().min(16).max(128) });

// ---------- Sorties serveur ----------

export type RoomStatus = 'WAITING' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
export type PlayerState = 'LOBBY' | 'SEATED' | 'QUEUED';

export interface PlayerPublic {
  id: string;
  nickname: string;
  avatar: string | null;
  /** Joueur inscrit (compte) : peut être ajouté en favori. */
  registered: boolean;
  connected: boolean;
  state: PlayerState;
  isHost: boolean;
  /** Position à la table (UTG…) une fois assis. */
  position: string | null;
  score: number | null;
  excluded: boolean;
  /** Joueur piloté par le serveur (mode entraînement) : l'interface le signale par une pastille « CPU ». */
  bot: boolean;
  /** Vote sur l'assistance proposée : true = approuve, false = refuse, null = pas encore répondu (compte comme
   * un refus au départ) ; toujours true si `config.assistance` est faux. */
  assistanceApproved: boolean | null;
}

/**
 * Une entrée de la liste publique des parties ouvertes (`GET /rooms`) : aucune information privée (pas de
 * pseudo, pas de jeton) — juste de quoi choisir une table à rejoindre. N'inclut que les parties encore
 * accessibles (ni terminées, ni annulées, ni complètes).
 */
export interface RoomSummary {
  code: string;
  name: string;
  status: 'WAITING' | 'RUNNING';
  maxPlayers: number;
  seatsLeft: number;
  targetPoints: number;
  stakeChips: number;
  assistance: boolean;
  /** Variante imposée, absente si elle est choisie à chaque manche. */
  variant?: VariantId;
}

/** Vue d'une room pour UN joueur : jamais de jeton, jamais de carte cachée d'autrui. */
export interface RoomView {
  code: string;
  name: string;
  status: RoomStatus;
  config: { maxPlayers: number; targetPoints: number; stakeChips: number; potChips: number; assistance: boolean; private: boolean; variant?: VariantId; teats?: number; sideBets?: boolean };
  seatsLeft: number;
  hostId: string;
  you: { playerId: string; role: 'HOST' | 'PLAYER' | 'QUEUED' };
  players: PlayerPublic[];
  version: number;
  serverTime: number;
  /** Échéance du minuteur en cours (horloge serveur, ms) : `at` reste exact après une reconnexion. */
  deadline: { at: number; kind: 'VARIANT' | 'INSURANCE' | 'ROUND'; key: string } | null;
  game: GameView | null;
}

export interface UpdateMessage {
  type: 'update';
  roomCode: string;
  version: number;
  view: RoomView;
  /** Événements de cette transition destinés à ce joueur (publics + privés qui le concernent). */
  events: RoundEvent[];
}
export interface KickedMessage {
  type: 'kicked';
  roomCode: string;
}
/** Message éphémère de la table (chat, objet lancé) : jamais archivé, ni rejoué à la reconnexion, hors numéro de version. */
export interface SocialMessage {
  type: 'social';
  roomCode: string;
  id: string;
  at: number;
  from: string;
  kind: 'chat' | 'throw';
  text?: string;
  item?: ThrowItem;
  to?: string;
}
export interface Outgoing {
  playerId: string;
  message: UpdateMessage | KickedMessage | SocialMessage;
}
