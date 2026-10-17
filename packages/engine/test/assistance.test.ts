import { describe, expect, it } from 'vitest';
import { HandCategory } from '../src/evaluation/handEvaluator';
import { dealStack, mk, sel, TIMEOUT, val } from './helpers';

const info = (r: ReturnType<typeof mk>, p: string) => r.view(p).info as { assistCategory: number | null };

describe('assistance : réglage désactivé (défaut) — jamais aucun indicateur', () => {
  it('Poker fermé, Aviation, 6-3, Morpion : assistCategory toujours null sans le réglage', () => {
    for (const variant of ['CLOSED_1', 'AVIATION', 'V6_3', 'MORPION'] as const) {
      const r = mk(variant, 2, undefined, 1, false); // assistance explicitement désactivée
      expect(info(r, 'P0').assistCategory).toBeNull();
    }
  });
});

describe('assistance : Poker fermé — combinaison actuelle (avant changement)', () => {
  const HANDS = [
    ['As', 'Ad', '2c', '7d', '9h'], // P0 : paire d'As
    ['Kc', 'Qd', '5h', '3s', '8h'], // P1 : rien
  ];
  it('indique la catégorie de la main actuelle, avant tout changement', () => {
    const r = mk('CLOSED_1', 2, dealStack(HANDS), 1, true);
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.Pair);
    expect(info(r, 'P1').assistCategory).toBe(HandCategory.HighCard);
  });
  it('ne change pas quand on désigne des cartes à changer (le résultat après change est inconnu)', () => {
    const r = mk('CLOSED_1', 2, dealStack(HANDS), 1, true);
    r.apply(sel('P0', ['2c', '7d', '9h'])); // jette tout sauf la paire
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.Pair);
  });
  it('jamais exposée à un adversaire, ni après la fin de la manche', () => {
    const r = mk('CLOSED_1', 2, dealStack(HANDS), 1, true);
    expect(r.view('P1').info).not.toHaveProperty('assistCategory', HandCategory.Pair); // P1 ne voit pas la sienne via P0
    expect((r.view(null).info as { assistCategory: unknown }).assistCategory).toBeNull(); // vue publique
    r.apply(TIMEOUT);
    expect(info(r, 'P0').assistCategory).toBeNull(); // manche terminée : plus d'assistance à afficher
  });
});

describe('assistance : Aviation — combinaison des cartes gardées + plateau déjà révélé, jamais une carte cachée', () => {
  it("reflète les cartes qui seraient gardées, recalculée à chaque changement de brouillon", () => {
    const hands = [['As', 'Ad', '2c', '7d']]; // P0 : 4 cartes, jette 1
    const board = ['3h', '8h', 'Kh', '9s', '4d']; // flop 3h,8h,Kh (visible d'emblée) ; turn 9s ; river 4d (cachées)
    const r = mk('AVIATION', 2, dealStack([...hands, ['2d', '3d', '5s', '6s']], board), 1, true);
    // Brouillon vide : garderait As,Ad,2c,7d + flop (3h,8h,Kh) = simple paire d'As
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.Pair);
    r.apply(sel('P0', ['As'])); // jetterait l'As : garderait Ad,2c,7d + flop = carte haute
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.HighCard);
  });
  it("ne laisse jamais deviner le turn ou la river avant leur révélation", () => {
    // Board conçu pour former une COULEUR cœur si le turn (caché) était pris en compte, mais pas avec le flop seul.
    const hands = [['Ah', 'Kh', '2c', '7d']];
    const board = ['3h', '8h', '4c', 'Qh', '9d']; // flop 3h,8h,4c (visible) ; turn Qh (caché) ; river 9d (cachée)
    const r = mk('AVIATION', 2, dealStack([...hands, ['2d', '3d', '5s', '6s']], board), 1, true);
    const cat = info(r, 'P0').assistCategory;
    expect(cat).not.toBe(HandCategory.Flush); // la couleur n'existe qu'avec Qh (turn), encore caché
    expect(cat).toBe(HandCategory.HighCard); // Ah,Kh + flop 3h,8h,4c : aucune paire avec le flop seul
  });
  it('rien à afficher pour un joueur dont la main est couchée (fold)', () => {
    const r = mk('AVIATION', 2, dealStack([['As', 'Ad', '2c', '7d'], ['2d', '3d', '5s', '6s']]), 1, true);
    r.apply(TIMEOUT); // personne ne désigne : les deux mains sont couchées
    expect(info(r, 'P0').assistCategory).toBeNull();
  });
});

describe('assistance : 6-3 — combinaison de la paire désignée + le plateau de la ligne en cours', () => {
  const HANDS = [
    ['9h', 'Th', 'As', 'Ad', '3c', '4d'],
    ['Ah', 'Ac', '5s', '6d', '8c', '3h'],
  ];
  const BOARD15 = ['Jh', 'Qh', '2d', '4c', '7c', '9d', 'Tc', '3d', '5h', '2s', '9c', 'Jc', '6h', '5c', '4s'];
  it('rien tant que les 2 cartes ne sont pas désignées ; le même résultat que la résolution réelle une fois désignées', () => {
    const r = mk('V6_3', 2, dealStack(HANDS, BOARD15), 1, true);
    r.apply(sel('P0', ['As']));
    expect(info(r, 'P0').assistCategory).toBeNull(); // une seule carte : rien à afficher
    r.apply(sel('P0', ['As', 'Ad'])); // As,Ad + Jh,Qh,2d (ligne 1) = simple paire d'As
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.Pair);
    r.apply(val('P0'));
    r.apply(sel('P1', ['Ah', 'Ac']));
    r.apply(val('P1'));
    const l1 = (r.view('P0').info as { lines: { designations: Record<string, { category: number }> }[] }).lines[0]!;
    expect(l1.designations.P0!.category).toBe(HandCategory.Pair); // cohérent avec l'assistance affichée avant validation
  });
  it("porte sur le plateau de la ligne EN COURS, pas systématiquement la ligne 1", () => {
    const r = mk('V6_3', 2, dealStack(HANDS, BOARD15), 1, true);
    // 9h,Th + ligne 1 (Jh,Qh,2d) : suite de hauteurs, carte haute (aucune paire, aucune couleur : 4 cœurs seulement)
    r.apply(sel('P0', ['9h', 'Th']));
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.HighCard);
    r.apply(val('P0'));
    r.apply(sel('P1', ['Ah', 'Ac']));
    r.apply(val('P1')); // ligne 1 close : on entre en ligne 2, plateau 9d,Tc,3d
    // 9h,Th + ligne 2 (9d,Tc,3d) : 9h-9d et Th-Tc → double paire, sur un plateau DIFFÉRENT de la ligne 1
    r.apply(sel('P0', ['9h', 'Th']));
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.TwoPair);
    expect(r.view('P0').info).toMatchObject({ line: 2 });
  });
});

describe('assistance : Morpion — combinaison des 2 cartes désignées + l’alignement choisi', () => {
  const HANDS = [
    ['As', 'Ad', '2c', '3d'],
    ['Kc', 'Kd', '2d', '3c'],
  ];
  const BOARD9 = ['Ah', '5c', '6d', '9c', 'Tc', 'Jc', '2s', '3s', '4s'];
  it('rien tant que les 2 cartes ET un alignement ne sont pas désignés ; brelan une fois complet', () => {
    const r = mk('MORPION', 2, dealStack(HANDS, BOARD9), 1, true);
    r.apply({ type: 'SELECT', player: 'P0', cards: ['As', 'Ad'] });
    expect(info(r, 'P0').assistCategory).toBeNull(); // pas encore d'alignement
    r.apply({ type: 'SELECT', player: 'P0', cards: ['As'], line: 0 });
    expect(info(r, 'P0').assistCategory).toBeNull(); // alignement choisi mais une seule carte : toujours rien
    r.apply({ type: 'SELECT', player: 'P0', cards: ['As', 'Ad'], line: 0 }); // ligne 0 = Ah,5c,6d → brelan d'As
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.ThreeOfAKind);
    r.apply({ type: 'SELECT', player: 'P0', cards: ['As', 'Ad'], line: 4 }); // colonne 1 = 5c,Tc,3s → paire d'As
    expect(info(r, 'P0').assistCategory).toBe(HandCategory.Pair);
  });
});
