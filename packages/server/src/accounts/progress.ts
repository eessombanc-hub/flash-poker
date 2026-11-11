import type { MasteryLevel, MasteryStep, VariantProgress } from './types';

/**
 * Progression par variante, calculée uniquement à partir des manches réellement jouées.
 *
 * Le volume de jeu ne suffit pas à faire un niveau : au-delà des premières manches, il faut aussi gagner plus souvent
 * que le hasard ne le ferait. À une table de n joueurs, une manche rapporte 1/n de victoire « attendue » ; le
 * rendement est le rapport entre les victoires obtenues et la somme de ces attentes (1,00 = au niveau du hasard).
 */
export const MASTERY_STEPS: readonly MasteryStep[] = [
  { level: 'beginner', rounds: 0, skill: 0 },
  { level: 'initiate', rounds: 5, skill: 0 },
  { level: 'confirmed', rounds: 15, skill: 1.0 },
  { level: 'expert', rounds: 40, skill: 1.2 },
  { level: 'master', rounds: 100, skill: 1.35 },
];

export const RECENT_ROUNDS = 10;

export interface RoundFact {
  /** La manche a été gagnée par le joueur. */
  won: boolean;
  /** Nombre de joueurs ayant disputé la manche. */
  players: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** `rounds` doit être en ordre chronologique (la plus ancienne d'abord). */
export function variantProgress(rounds: readonly RoundFact[]): VariantProgress {
  const played = rounds.length;
  const won = rounds.filter((r) => r.won).length;
  const expectedWins = rounds.reduce((n, r) => n + 1 / Math.max(2, r.players), 0);
  const skill = played > 0 && expectedWins > 0 ? won / expectedWins : null;

  let best = 0;
  let run = 0;
  for (const r of rounds) {
    run = r.won ? run + 1 : 0;
    if (run > best) best = run;
  }

  let idx = 0;
  for (let i = 1; i < MASTERY_STEPS.length; i++) {
    const s = MASTERY_STEPS[i]!;
    if (played >= s.rounds && (skill ?? 0) >= s.skill) idx = i;
    else break;
  }
  const nextStep = MASTERY_STEPS[idx + 1] ?? null;
  const progress = nextStep
    ? clamp01(Math.min(played / nextStep.rounds, nextStep.skill > 0 ? (skill ?? 0) / nextStep.skill : 1))
    : 1;

  return {
    level: MASTERY_STEPS[idx]!.level as MasteryLevel,
    expectedWins: Math.round(expectedWins * 100) / 100,
    skill: skill === null ? null : Math.round(skill * 100) / 100,
    streak: run,
    bestStreak: best,
    recent: rounds.slice(-RECENT_ROUNDS).map((r) => (r.won ? 'W' : 'N')),
    next: nextStep,
    progress: Math.round(progress * 100) / 100,
  };
}
