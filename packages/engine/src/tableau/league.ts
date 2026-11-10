import type { AiLevel } from './ai';

/**
 * LE TABLEAU, ÉTAPE 2 : ligues, classement et défis. Fonctions pures, sans état : le serveur les applique.
 * Aucun avantage de jeu : le classement ne mesure que les résultats, les défis ne donnent qu'un peu d'expérience.
 */

export type TbRankedVariant = 'classic' | 'hand5';
export type TbOutcome = 'win' | 'loss' | 'draw';
/** `ranked` : classé contre l'ordinateur. `duel` : classé contre un autre joueur (même classement). */
export type TbMode = 'training' | 'friendly' | 'ranked' | 'duel';

/** Modes qui font évoluer le classement. */
export const tbIsRated = (m: TbMode): boolean => m === 'ranked' || m === 'duel';

// ---------- Ligues ----------

export interface TbLeague {
  /** De 1 (la plus basse) à 10 (la plus haute). */
  id: number;
  name: string;
  /** Classement minimal pour y figurer. */
  min: number;
}

export const TB_START_RATING = 800;

export const TB_LEAGUES: readonly TbLeague[] = [
  { id: 1, name: 'Débutant', min: 0 },
  { id: 2, name: 'Apprenti', min: 900 },
  { id: 3, name: 'Amateur', min: 1000 },
  { id: 4, name: 'Régulier', min: 1100 },
  { id: 5, name: 'Confirmé', min: 1200 },
  { id: 6, name: 'Expert', min: 1300 },
  { id: 7, name: 'Maître', min: 1400 },
  { id: 8, name: 'Grand maître', min: 1500 },
  { id: 9, name: 'Champion', min: 1650 },
  { id: 10, name: 'Légende', min: 1800 },
];

export interface TbLeagueStanding {
  league: TbLeague;
  next: TbLeague | null;
  /** Avancement dans la ligue, de 0 à 1 (1 = dernière ligue). */
  progress: number;
  /** Points restants avant la ligue suivante (0 en ligue 10). */
  toNext: number;
}

export function tbLeagueOf(rating: number): TbLeagueStanding {
  let i = 0;
  for (let k = 0; k < TB_LEAGUES.length; k++) if (rating >= TB_LEAGUES[k]!.min) i = k;
  const league = TB_LEAGUES[i]!;
  const next = TB_LEAGUES[i + 1] ?? null;
  if (!next) return { league, next: null, progress: 1, toNext: 0 };
  return { league, next, progress: Math.min(1, Math.max(0, (rating - league.min) / (next.min - league.min))), toNext: Math.max(0, Math.ceil(next.min - rating)) };
}

// ---------- Classement (Elo) ----------

/** Force de jeu attribuée à chaque niveau du CPU : un adversaire fixe, donc des gains prévisibles. */
export const TB_CPU_RATING: Record<AiLevel, number> = { beginner: 850, intermediate: 1150, expert: 1450 };

/** Les premières parties classées bougent plus vite (classement provisoire), pour trouver sa place sans longue attente. */
export const TB_PLACEMENT_GAMES = 10;

export function tbEloDelta(rating: number, opponent: number, outcome: TbOutcome, rankedGames: number): number {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  const k = rankedGames < TB_PLACEMENT_GAMES ? 32 : 24;
  return Math.round(k * (score - expected));
}

export const tbClampRating = (r: number): number => Math.max(0, Math.round(r));

// ---------- Défis du jour ----------

/** Faits d'une partie terminée, du point de vue d'un joueur : tout ce dont les défis ont besoin. */
export interface TbGameFacts {
  mode: TbMode;
  variant: TbRankedVariant;
  outcome: TbOutcome;
  columnsWon: number;
  columnsPlayed: number;
  /** Partie gagnée sur une quinte flush (victoire immédiate). */
  straightFlushWin: boolean;
  /** Le joueur a complété au moins une quinte flush. */
  straightFlushMade: boolean;
  opponentLevel: AiLevel | null;
  /** Classement de l'adversaire avant la partie (duel contre un humain) ; absent contre l'ordinateur. */
  opponentRating?: number | null;
  forfeit: boolean;
}

export interface TbChallengeDef {
  id: string;
  label: string;
  goal: number;
  /** Progression apportée par une partie (s'ajoute, plafonnée à l'objectif). */
  gain: (f: TbGameFacts) => number;
}

const win = (f: TbGameFacts): boolean => f.outcome === 'win' && !f.forfeit;

export const TB_CHALLENGES: readonly TbChallengeDef[] = [
  { id: 'play2', label: 'Jouer 2 parties', goal: 2, gain: () => 1 },
  { id: 'win1', label: 'Gagner une partie', goal: 1, gain: (f) => (win(f) ? 1 : 0) },
  { id: 'win2', label: 'Gagner 2 parties', goal: 2, gain: (f) => (win(f) ? 1 : 0) },
  { id: 'cols8', label: 'Gagner 8 colonnes', goal: 8, gain: (f) => f.columnsWon },
  { id: 'cols4', label: 'Gagner une partie avec au moins 4 colonnes', goal: 1, gain: (f) => (win(f) && f.columnsWon >= 4 ? 1 : 0) },
  { id: 'sf', label: 'Réussir une quinte flush', goal: 1, gain: (f) => (f.straightFlushMade ? 1 : 0) },
  { id: 'ranked', label: 'Jouer une partie classée', goal: 1, gain: (f) => (tbIsRated(f.mode) ? 1 : 0) },
  { id: 'rankedWin', label: 'Gagner une partie classée', goal: 1, gain: (f) => (tbIsRated(f.mode) && win(f) ? 1 : 0) },
  { id: 'beatExpert', label: 'Battre le CPU expert', goal: 1, gain: (f) => (win(f) && f.opponentLevel === 'expert' ? 1 : 0) },
  { id: 'friend', label: 'Jouer une partie amicale', goal: 1, gain: (f) => (f.mode === 'friendly' ? 1 : 0) },
];

/** Expérience offerte par défi accompli (profil commun). */
export const TB_CHALLENGE_XP = 40;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Trois défis différents, identiques pour tous les joueurs un même jour (`day` = « AAAA-MM-JJ »). */
export function tbDailyChallenges(day: string): TbChallengeDef[] {
  const pool = [...TB_CHALLENGES];
  const out: TbChallengeDef[] = [];
  let h = hash(day);
  while (out.length < 3 && pool.length > 0) {
    out.push(pool.splice(h % pool.length, 1)[0]!);
    h = hash(`${day}:${out.length}:${h}`);
  }
  return out;
}

/** Jour civil à Paris (le défi change à minuit, heure de France). */
export function tbDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Écart de classement toléré pour apparier deux joueurs : 100 points, +50 toutes les 10 s d'attente, sans limite après 60 s. */
export function tbMatchWindow(waitedMs: number): number {
  if (waitedMs >= 60_000) return Infinity;
  return 100 + 50 * Math.floor(Math.max(0, waitedMs) / 10_000);
}

/** Deux joueurs en attente (le plus patient fixe la fenêtre) peuvent-ils jouer ensemble ? */
export function tbCanPair(a: { rating: number; waitedMs: number }, b: { rating: number; waitedMs: number }): boolean {
  return Math.abs(a.rating - b.rating) <= tbMatchWindow(Math.max(a.waitedMs, b.waitedMs));
}
