import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { createRound, isVariantAvailable, RuleError } from '../src/variants';
import { codesIn, dealStack, mk, names, pick, sel, TIMEOUT, val } from './helpers';

const ownHand = (r: ReturnType<typeof mk>, p: string) => {
  const h = r.view(p).cards.hands[p]!;
  if (h.kind !== 'own') throw new Error('vue attendue : propre main');
  return h.cards.map((c) => c.code!); // jamais masqué au Poker fermé
};

describe('Poker fermé — 1 change', () => {
  const hands = [
    ['As', 'Ad', '2c', '7d', '9h'],
    ['Ks', 'Kd', 'Kc', '4h', '3s'],
    ['5c', '6d', '8h', 'Ts', 'Jc'],
  ];
  const rest = ['Ah', 'Ac', 'Qs', 'Qd', 'Qh', '3c'];

  it('0 à 3 cartes changées, remplacements tirés dans l\'ordre des places, meilleure main de 5 cartes gagne', () => {
    const r = mk('CLOSED_1', 3, dealStack(hands, rest));
    expect(r.phase()).toBe('CHANGE_1');
    r.apply(sel('P0', ['2c', '7d']));
    const ev0 = r.apply(val('P0'));
    expect(ev0).toHaveLength(0);
    r.apply(val('P1')); // 0 change : légal
    r.apply(sel('P2', ['5c', '6d', '8h']));
    const events = r.apply(val('P2')); // dernier à valider : le change se résout
    const applied = events.filter((e) => e.type === 'CHANGE_APPLIED');
    expect(applied.map((e) => [e.audience, e.visibility, e.data.received])).toEqual([
      ['P0', 'PLAYER', ['Ah', 'Ac']],
      ['P2', 'PLAYER', ['Qs', 'Qd', 'Qh']],
    ]);
    expect(events.some((e) => e.type === 'SHOWDOWN')).toBe(true);
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 }); // carré d'As
    expect(r.phase()).toBe('DONE');
  });

  it('les cartes jetées sont remplacées à nombre égal : main toujours de 5 cartes', () => {
    const r = mk('CLOSED_1', 3, dealStack(hands, rest));
    r.apply(sel('P0', ['2c', '7d', '9h']));
    expect(ownHand(r, 'P0')).toHaveLength(5);
    r.apply(TIMEOUT);
    expect(r.result()).not.toBeNull();
  });

  it('minuteur : un brouillon est appliqué tel quel ; sans action, 0 carte changée', () => {
    const r = mk('CLOSED_1', 3, dealStack(hands, rest));
    r.apply(sel('P0', ['2c'])); // brouillon non validé
    const events = r.apply(TIMEOUT);
    const recv = events.filter((e) => e.type === 'CHANGE_APPLIED');
    expect(recv).toHaveLength(1);
    expect(recv[0]!.audience).toBe('P0');
    expect(recv[0]!.data.received).toEqual(['Ah']);
    expect(r.result()!.kind).toBe('WINNER');

    const r2 = mk('CLOSED_1', 3, dealStack(hands, rest));
    const ev2 = r2.apply(TIMEOUT); // personne n'agit : 0 change pour tous
    expect(ev2.filter((e) => e.type === 'CHANGE_APPLIED')).toHaveLength(0);
    expect(r2.result()).toEqual({ kind: 'WINNER', winner: 'P1', points: 1 }); // brelan de rois
  });

  it('égalité parfaite : TIE entre les ex aequo (Hold\'em de départage ensuite)', () => {
    const tie = [
      ['As', 'Ad', 'Kc', 'Qd', '2h'],
      ['Ah', 'Ac', 'Ks', 'Qh', '2d'],
    ];
    const r = mk('CLOSED_1', 2, dealStack(tie));
    r.apply(val('P0'));
    r.apply(val('P1'));
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });

  it('sélections invalides refusées, état inchangé', () => {
    const r = mk('CLOSED_1', 3, dealStack(hands, rest));
    const before = JSON.stringify(r.snapshot());
    expect(() => r.apply(sel('P0', ['2c', '7d', '9h', 'As']))).toThrowError(/maximum/);
    expect(() => r.apply(sel('P0', ['Ks']))).toThrowError(RuleError); // pas dans sa main
    expect(() => r.apply(sel('P0', ['2c', '2c']))).toThrowError(/deux fois/);
    expect(() => r.apply(sel('P0', ['Zz']))).toThrowError(RuleError);
    expect(() => r.apply(sel('X', []))).toThrowError(RuleError);
    expect(JSON.stringify(r.snapshot())).toBe(before);
    r.apply(val('P0'));
    expect(() => r.apply(sel('P0', ['2c']))).toThrowError(/déjà validé/);
    expect(() => r.apply({ type: 'REVEAL', player: 'P0' })).toThrowError(RuleError);
  });

  it('aucune commande après la fin de manche', () => {
    const r = mk('CLOSED_1', 2, dealStack([hands[0]!, hands[1]!]));
    r.apply(TIMEOUT);
    expect(() => r.apply(TIMEOUT)).toThrowError(/terminée/);
  });

  it('secret : aucune carte adverse dans la vue tant que la manche est en cours ; pas d\'avertissement', () => {
    const r = mk('CLOSED_1', 3, dealStack(hands, rest));
    r.apply(sel('P0', ['2c', '7d']));
    const v = codesIn(r.view('P1'));
    expect(new Set(hands[1])).toEqual(v); // uniquement sa propre main
    expect(r.view('P1').info.yourDraft).toEqual([]);
    expect(r.view('P0').info.yourDraft).toEqual(['2c', '7d']);
    expect(r.warnings()).toEqual([]);
  });
});

describe('Poker fermé — 2 changes', () => {
  it('deux changes successifs, main définitive après le second', () => {
    const h = [
      ['As', 'Ad', '2c', '7d', '9h'],
      ['Ks', 'Kd', '4c', '4h', '3s'],
    ];
    // change 1 : P0 jette 2c 7d 9h -> Ac Ah 5c ; P1 ne change pas ; change 2 : P0 ne change pas ; P1 jette 4c 4h 3s -> Kc Kh 8s
    const r = mk('CLOSED_2', 2, dealStack(h, ['Ac', 'Ah', '5c', 'Kc', 'Kh', '8s']));
    expect(r.phase()).toBe('CHANGE_1');
    r.apply(sel('P0', ['2c', '7d', '9h']));
    r.apply(TIMEOUT);
    expect(r.phase()).toBe('CHANGE_2');
    expect(r.result()).toBeNull();
    expect(ownHand(r, 'P0').sort()).toEqual(['5c', 'Ac', 'Ad', 'Ah', 'As'].sort());
    r.apply(sel('P1', ['4c', '4h', '3s']));
    r.apply(TIMEOUT);
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 }); // carré d'As (P1 : full/carré K ? Ks Kd Kc Kh 8s = carré K)
  });

  it('indisponible à 6 joueurs ; disponible de 2 à 5 (et Fermé 1 de 2 à 6)', () => {
    expect(isVariantAvailable('CLOSED_2', 6)).toBe(false);
    expect(isVariantAvailable('CLOSED_2', 5)).toBe(true);
    expect(isVariantAvailable('CLOSED_1', 6)).toBe(true);
    expect(isVariantAvailable('V6_3', 1)).toBe(false);
    expect(() => createRound('CLOSED_2', { players: names(6), rng: new SeededRng(1) })).toThrowError(/pas jouable/);
    expect(() => createRound('CLOSED_1', { players: names(6), rng: new SeededRng(1) })).not.toThrow();
    expect(() => createRound('CLOSED_1', { players: names(7), rng: new SeededRng(1) })).toThrowError(RuleError);
  });

  it('décision (a) : au pire cas, personne ne reçoit une carte jetée dans CE MÊME change (seules les défausses précédentes sont remélangées)', () => {
    let reshuffles = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const r = mk('CLOSED_2', 5, undefined, seed);
      for (const p of names(5)) pick(r, p, ownHand(r, p).slice(0, 3)); // change 1 : 15 cartes jetées, paquet à 12
      const discardedNow: string[] = [];
      const receivedNow: string[] = [];
      for (const p of names(5)) {
        const chosen = ownHand(r, p).slice(0, 3);
        discardedNow.push(...chosen);
        r.apply(sel(p, chosen));
        const ev = r.apply(val(p));
        for (const e of ev) if (e.type === 'CHANGE_APPLIED') receivedNow.push(...(e.data.received as string[]));
      }
      // 15 cartes reçues au change 2 alors que le paquet n'en contenait que 12 : un remélange a eu lieu
      expect(receivedNow).toHaveLength(15);
      reshuffles++;
      for (const c of receivedNow) expect(discardedNow, `seed ${seed}`).not.toContain(c);
    }
    expect(reshuffles).toBe(80);
  });

  it('pire cas à 5 joueurs (chacun change 3 cartes deux fois) : la partie va au bout, 52 cartes conservées', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = mk('CLOSED_2', 5, undefined, seed);
      for (let change = 0; change < 2; change++) {
        for (const p of names(5)) pick(r, p, ownHand(r, p).slice(0, 3));
        r.checkInvariants();
      }
      expect(r.result()).not.toBeNull();
      expect(r.result()!.kind === 'WINNER' || r.result()!.kind === 'TIE').toBe(true);
      r.checkInvariants();
    }
  });
});

describe('Fermé : à la fin des changes, tous montrent leurs cartes ; meilleure main gagne ; égalité → Hold\'em', () => {
  const FLUSH = ['Ah', 'Kh', '9h', '5h', '2h'];
  const STRAIGHT = ['5c', '6d', '7s', '8h', '9c'];
  const TRIPS = ['Qs', 'Qd', 'Qc', '4d', '3s'];

  it('Fermé 2 : rien n\'est montré après le change 1 ; au terme du change 2, toutes les mains sont visibles de tous', () => {
    const r = mk('CLOSED_2', 3, dealStack([FLUSH, STRAIGHT, TRIPS]));
    const ev1 = r.apply(TIMEOUT); // fin du change 1 : 0 change pour tous
    expect(r.result()).toBeNull();
    expect(ev1.some((e) => e.type === 'SHOWDOWN')).toBe(false);
    expect(r.view('P2').cards.hands.P0).toMatchObject({ kind: 'opponent', shown: [], hiddenCount: 5 });

    const ev2 = r.apply(TIMEOUT); // fin du change 2 : showdown
    const showdown = ev2.find((e) => e.type === 'SHOWDOWN')!;
    expect(showdown.visibility).toBe('PUBLIC');
    expect(showdown.data.hands).toEqual({
      P0: { cards: FLUSH, category: 5 }, // couleur
      P1: { cards: STRAIGHT, category: 4 }, // quinte
      P2: { cards: TRIPS, category: 3 }, // brelan
    });
    for (const viewer of ['P0', 'P1', 'P2']) {
      for (const p of ['P0', 'P1', 'P2']) {
        if (p !== viewer) expect(r.view(viewer).cards.hands[p]).toMatchObject({ kind: 'opponent', hiddenCount: 0 });
      }
    }
    expect([...codesIn(r.view('P2'))].sort()).toEqual([...FLUSH, ...STRAIGHT, ...TRIPS].sort());
    expect(r.result()).toEqual({ kind: 'WINNER', winner: 'P0', points: 1 }); // couleur > quinte > brelan
  });

  it('Fermé 1 : les mains sont montrées dès la fin de l\'unique change', () => {
    const r = mk('CLOSED_1', 3, dealStack([FLUSH, STRAIGHT, TRIPS]));
    const ev = r.apply(TIMEOUT);
    expect(ev.some((e) => e.type === 'SHOWDOWN')).toBe(true);
    expect(r.view('P1').cards.hands.P0).toMatchObject({ hiddenCount: 0 });
  });

  it('égalité entre plusieurs joueurs en tête : TIE limité aux ex aequo (le joueur plus faible n\'en est pas)', () => {
    const r = mk('CLOSED_1', 3, dealStack([
      ['As', 'Kd', 'Qh', 'Jc', '9s'],
      ['Ac', 'Kh', 'Qd', 'Js', '9c'], // mêmes rangs, autres couleurs : égalité stricte
      ['Kc', 'Qs', '8d', '6h', '3c'],
    ]));
    r.apply(TIMEOUT);
    expect(r.result()).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
  });
});
