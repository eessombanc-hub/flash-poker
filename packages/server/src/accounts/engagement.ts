/**
 * Défis du jour, série de jours, trophées : tout est calculé à la lecture à partir de l'historique des parties
 * (table user_games). Aucun état supplémentaire à stocker, donc rien à resynchroniser ni à corrompre.
 */
export interface GameFact {
  endedAt: number;
  won: boolean;
}

export interface DailyChallenge {
  id: 'play1' | 'play3' | 'win1';
  target: number;
  progress: number;
  done: boolean;
}

export interface Trophy {
  id: string;
  value: number;
  target: number;
  unlocked: boolean;
}

export interface Engagement {
  day: string;
  streak: number;
  bestStreak: number;
  playedToday: number;
  wonToday: number;
  challenges: DailyChallenge[];
  trophies: Trophy[];
}

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Jour calendaire à Paris, au format AAAA-MM-JJ. */
export function parisDay(ms: number): string {
  return DAY_FMT.format(new Date(ms));
}

/** Numéro de jour (entier) d'une date AAAA-MM-JJ : permet de comparer des jours consécutifs sans fuseau. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const TROPHIES: readonly { id: string; target: number; of: 'games' | 'wins' | 'streak' | 'winRow' }[] = [
  { id: 'first_game', target: 1, of: 'games' },
  { id: 'games_10', target: 10, of: 'games' },
  { id: 'games_50', target: 50, of: 'games' },
  { id: 'first_win', target: 1, of: 'wins' },
  { id: 'wins_10', target: 10, of: 'wins' },
  { id: 'wins_25', target: 25, of: 'wins' },
  { id: 'win_row_3', target: 3, of: 'winRow' },
  { id: 'streak_3', target: 3, of: 'streak' },
  { id: 'streak_7', target: 7, of: 'streak' },
];

/** `games` : parties du joueur, dans n'importe quel ordre. */
export function computeEngagement(games: readonly GameFact[], now: number): Engagement {
  const sorted = [...games].sort((a, b) => a.endedAt - b.endedAt);
  const today = parisDay(now);
  const days = [...new Set(sorted.map((g) => parisDay(g.endedAt)))].map(dayNumber).sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  // La série en cours reste vivante tant qu'on a joué aujourd'hui ou hier.
  const last = days[days.length - 1];
  const t = dayNumber(today);
  const streak = last !== undefined && last >= t - 1 ? run : 0;

  let winRow = 0;
  let bestWinRow = 0;
  for (const g of sorted) {
    winRow = g.won ? winRow + 1 : 0;
    if (winRow > bestWinRow) bestWinRow = winRow;
  }

  const todays = sorted.filter((g) => parisDay(g.endedAt) === today);
  const playedToday = todays.length;
  const wonToday = todays.filter((g) => g.won).length;
  const wins = sorted.filter((g) => g.won).length;

  const challenge = (id: DailyChallenge['id'], target: number, progress: number): DailyChallenge => ({ id, target, progress: Math.min(progress, target), done: progress >= target });
  const values = { games: sorted.length, wins, streak: best, winRow: bestWinRow };

  return {
    day: today,
    streak,
    bestStreak: best,
    playedToday,
    wonToday,
    challenges: [challenge('play1', 1, playedToday), challenge('play3', 3, playedToday), challenge('win1', 1, wonToday)],
    trophies: TROPHIES.map((x) => ({ id: x.id, target: x.target, value: Math.min(values[x.of], x.target), unlocked: values[x.of] >= x.target })),
  };
}
