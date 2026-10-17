import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/core/card';
import { SeededRng } from '../src/core/rng';
import {
  createRound,
  isVariantAvailable,
  resolveRoundResult,
  restoreRound,
  RuleError,
  VARIANT_IDS,
  type Round,
  type VariantId,
} from '../src/variants';
import { codesIn, names, randomCommand } from './helpers';

/** Aucune carte cachée d'autrui, ni du paquet, ni de la défausse, ni des rivers cachées, dans la vue d'un joueur. */
function assertNoLeak(r: Round): void {
  const snap = r.snapshot();
  for (const viewer of r.players) {
    const view = r.view(viewer);
    const seen = codesIn(view);
    const publicPairs = new Set<string>();
    if (r.variant === 'V6_3') {
      for (const line of (view.info.lines as { designations: Record<string, { pair: string[] } | null> }[])) {
        for (const d of Object.values(line.designations)) d?.pair.forEach((c) => publicPairs.add(c));
      }
    }
    const forbidden: number[] = [...snap.cards.deck, ...snap.cards.discard];
    for (const s of snap.cards.board) if (!s.visible) forbidden.push(s.id);
    for (const q of r.players) {
      if (q === viewer) continue;
      for (const e of snap.cards.hands[q]!) if (!e.visible) forbidden.push(e.id);
    }
    for (const id of forbidden) {
      const code = ALL_CARDS[id]!.code;
      if (!publicPairs.has(code)) expect(seen.has(code), `${r.variant} : ${code} visible par ${viewer}`).toBe(false);
    }
  }
}

function play(variant: VariantId, n: number, seed: number): void {
  const rng = new SeededRng(seed);
  const round = createRound(variant, { players: names(n), rng: new SeededRng(seed + 1) });
  let steps = 0;
  let snapshotChecked = false;
  while (!round.result()) {
    if (++steps > 3000) throw new Error(`${variant}/${n}/${seed} : la manche ne se termine pas`);
    const cmd = randomCommand(round, rng);
    const before = JSON.stringify(round.snapshot());
    try {
      const events = round.apply(cmd);
      for (const e of events) {
        if (e.visibility === 'PLAYER') {
          expect(e.audience, 'un événement privé porte un destinataire').toBeDefined();
          expect(round.players).toContain(e.audience);
        }
      }
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      expect(JSON.stringify(round.snapshot()), `${variant} : une commande refusée a modifié l'état`).toBe(before);
    }
    round.checkInvariants();
    if (!round.result()) assertNoLeak(round);
    // Reprise après coupure : la vue de chaque joueur est identique après restauration
    if (!snapshotChecked && steps >= 3 && !round.result()) {
      const restored = restoreRound(JSON.parse(JSON.stringify(round.snapshot())), new SeededRng(0));
      for (const v of [...round.players, null]) expect(restored.view(v)).toEqual(round.view(v));
      expect(restored.awaiting()).toEqual(round.awaiting());
      snapshotChecked = true;
    }
  }
  const res = round.result()!;
  // Règles de sortie
  if (res.kind === 'INSTANT_VICTORY') expect(variant, 'la quinte flush ne s\'applique qu\'au 6-3').toBe('V6_3');
  if (res.kind === 'WINNER') {
    expect(round.players).toContain(res.winner);
    expect(res.points).toBeLessThanOrEqual(variant === 'V6_3' ? 2 : 1);
    expect(res.points).toBeGreaterThanOrEqual(1);
  }
  if (res.kind === 'TIE') {
    expect(res.tied.length).toBeGreaterThanOrEqual(2);
    for (const p of res.tied) expect(round.players).toContain(p);
    if (variant === 'V6_3') expect(n).toBeGreaterThanOrEqual(4); // à 2-3 joueurs : 0 point, pas de Hold'em
  }
  const award = resolveRoundResult(res, new SeededRng(seed));
  if (award.kind === 'POINTS') expect(round.players).toContain(award.winner);
  expect(round.awaiting()).toEqual([]);
  expect(() => round.apply({ type: 'TIMEOUT' })).toThrowError(/terminée/);
}

describe('simulation : parties aléatoires, 8 variantes × 2 à 6 joueurs', () => {
  for (const variant of VARIANT_IDS) {
    it(`${variant} : termine, conserve les 52 cartes, ne fuit jamais, refuse sans effet les coups illégaux`, () => {
      const runs = variant === 'V6_1' ? 25 : 60;
      let played = 0;
      for (let n = 2; n <= 6; n++) {
        if (!isVariantAvailable(variant, n)) {
          expect(() => createRound(variant, { players: names(n), rng: new SeededRng(1) })).toThrowError(RuleError);
          continue;
        }
        for (let seed = 1; seed <= runs; seed++) {
          play(variant, n, seed * 101 + n);
          played++;
        }
      }
      expect(played).toBe(runs * (variant === 'CLOSED_2' || variant === 'LE10' ? 4 : 5));
    });
  }

  it('la quinte flush n\'arrête jamais une manche hors 6-3 (1 000 manches aléatoires)', () => {
    // Hors 6-3, aucune manche ne doit produire INSTANT_VICTORY : vérifié sur 1 000 manches aléatoires
    const kinds = new Set<string>();
    for (const v of VARIANT_IDS.filter((x) => x !== 'V6_3')) {
      for (let seed = 1; seed <= 200; seed++) {
        const n = 2 + (seed % (v === 'CLOSED_2' || v === 'LE10' ? 4 : 5));
        const r = createRound(v, { players: names(n), rng: new SeededRng(seed) });
        const rng = new SeededRng(seed);
        let guard = 0;
        while (!r.result() && guard++ < 3000) {
          try {
            r.apply(randomCommand(r, rng));
          } catch (e) {
            if (!(e instanceof RuleError)) throw e;
          }
        }
        kinds.add(`${v}:${r.result()!.kind}`);
      }
    }
    expect([...kinds].some((k) => k.endsWith('INSTANT_VICTORY'))).toBe(false);
  });
});
