import type { HandRank } from './handEvaluator';

/**
 * Regroupe des joueurs par rang identique, du meilleur au moins bon.
 * L'ordre d'entrée est conservé à l'intérieur d'un groupe (les couleurs ne départagent jamais).
 * groups[0] = gagnants (égalité si plusieurs) ; groups[groups.length - 1] = les plus faibles (6-1).
 */
export function rankGroups<P>(entries: readonly { player: P; rank: HandRank }[]): P[][] {
  const byRank = new Map<HandRank, P[]>();
  for (const { player, rank } of entries) {
    const group = byRank.get(rank);
    if (group) group.push(player);
    else byRank.set(rank, [player]);
  }
  return [...byRank.entries()].sort((a, b) => b[0] - a[0]).map(([, players]) => players);
}
