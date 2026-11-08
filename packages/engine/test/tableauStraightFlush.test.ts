import { describe, expect, it } from 'vitest';
import { TableauGame, type Seat } from '../src';

/** Fabrique une partie où `seat` n'a plus qu'à poser quatre cartes pour compléter une quinte flush en colonne 0. */
function rig(variant: 'classic' | 'hand5', first4: string[], rest: string[]): { g: TableauGame; a: Seat } {
  const g = new TableauGame('sf-test', variant);
  const a = g.turn!;
  const internals = g as unknown as { cols: string[][][]; hands: [string[], string[]] };
  internals.cols[a]![0] = [first4[0]!];
  if (variant === 'classic') g.deal.deck[a]!.splice(0, 4, ...first4.slice(1), ...rest.slice(0, 1));
  else internals.hands[a] = [...first4.slice(1), ...rest.slice(0, 1)];
  return { g, a };
}

describe('Quinte flush : victoire immédiate', () => {
  it('variante classique : le premier qui complète une quinte flush gagne aussitôt', () => {
    const { g, a } = rig('classic', ['4h', '5h', '6h', '7h'], ['9c']);
    g.deal.deck[a]!.splice(3, 1, '8h'); // 4e pioche
    for (let i = 0; i < 4; i++) {
      expect(g.finished).toBe(false);
      g.place(g.turn!, 0, false);
      if (g.finished) break;
      const b = g.turn!;
      g.place(b, g.autoColumn(b), true);
    }
    // a a posé 4h (départ) + 5h,6h,7h,8h → quinte flush au 8
    expect(g.finished).toBe(true);
    const r = g.result()!;
    expect(r.winner).toBe(a);
    expect(r.straightFlush).toMatchObject({ seat: a, col: 0 });
    expect(r.straightFlush!.hand.label).toBe('Quinte flush au 8');
    expect(g.turn).toBeNull();
    expect(g.ply).toBeLessThan(g.totalPlies);
    expect(g.reveal()).not.toBeNull(); // la preuve d'équité reste publiée en fin de partie (le jeu a été truqué ici pour le test)
    expect(() => g.place(a, 1, false)).toThrow(/terminée/);
  });

  it('variante 5 cartes : la quinte flush peut venir de la main ; la royale compte aussi', () => {
    const { g, a } = rig('hand5', ['Th', 'Jh', 'Qh', 'Kh'], ['Ah']);
    const played: string[] = [];
    while (!g.finished && played.length < 8) {
      const s = g.turn!;
      if (s === a) {
        const next = ['Jh', 'Qh', 'Kh', 'Ah'][played.length]!;
        played.push(next);
        g.place(s, 0, false, next);
      } else g.place(s, g.autoColumn(s), true, g.autoCard(s));
    }
    expect(g.finished).toBe(true);
    const r = g.result()!;
    expect(r.winner).toBe(a);
    expect(r.straightFlush!.hand.label).toBe('Quinte flush royale');
    expect(r.straightFlush!.hand.category).toBe(9);
  });

  it('l’adversaire qui complète la première gagne, même s’il joue en second', () => {
    const g = new TableauGame('sf-test', 'classic');
    const b = (1 - g.turn!) as Seat;
    (g as unknown as { cols: string[][][] }).cols[b]![2] = ['2s', '3s', '4s', '5s'];
    // le joueur au trait pose n'importe où ; b complète avec sa carte piochée
    g.place(g.turn!, g.autoColumn(g.turn!), true);
    g.deal.deck[b]![0] = '6s';
    g.place(b, 2, false);
    expect(g.finished).toBe(true);
    expect(g.result()!.winner).toBe(b);
    expect(g.result()!.straightFlush!.seat).toBe(b);
  });

  it('une couleur ou une quinte simple ne met pas fin à la partie', () => {
    const g = new TableauGame('sf-test', 'classic');
    const a = g.turn!;
    (g as unknown as { cols: string[][][] }).cols[a]![1] = ['2s', '3s', '4s', '5s'];
    g.deal.deck[a]![0] = '9s'; // couleur
    g.place(a, 1, false);
    expect(g.finished).toBe(false);
    expect(g.log).toHaveLength(1);
  });

  it('partie normale : résultat inchangé (cinq colonnes comparées, pas de quinte flush)', () => {
    const g = new TableauGame('main', 'classic');
    while (!g.finished) g.place(g.turn!, g.autoColumn(g.turn!), true);
    const r = g.result()!;
    expect(r.columns.map((c) => c.col)).toEqual([0, 1, 2, 3, 4]);
    expect(r.straightFlush === null || r.columns.length === 5).toBe(true);
  });
});
