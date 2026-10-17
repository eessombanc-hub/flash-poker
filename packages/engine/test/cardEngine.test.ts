import { describe, expect, it } from 'vitest';
import { CardEngine, CardEngineError } from '../src/core/cardEngine';
import { SeededRng } from '../src/core/rng';

const P = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
const CODE = /"([2-9TJQKA][cdhs])"/g;
const codesIn = (v: unknown) => new Set([...JSON.stringify(v).matchAll(CODE)].map((m) => m[1]!));

describe('CardEngine : distribution', () => {
  it('démarre avec 52 cartes conservées', () => {
    const e = new CardEngine(P(3), new SeededRng(1));
    expect(e.deckCount).toBe(52);
    e.checkInvariants();
  });

  it('6-1 : distribution une à une, 5 cachées + la 6e visible, pour 2 à 6 joueurs', () => {
    for (let n = 2; n <= 6; n++) {
      const e = new CardEngine(P(n), new SeededRng(n));
      e.dealRoundRobin(6, { visibleFrom: 5 });
      e.dealBoard(5, true);
      for (const p of P(n)) {
        const h = e.getHand(p);
        expect(h).toHaveLength(6);
        expect(h.slice(0, 5).every((x) => !x.visible)).toBe(true);
        expect(h[5]!.visible).toBe(true);
      }
      expect(e.deckCount).toBe(52 - 6 * n - 5);
      e.checkInvariants();
    }
  });

  it('6-3 : 6 cartes, 3 plateaux indépendants de 5 cartes (flop+turn+river), 2 rivers cachées révélées une à une', () => {
    const e = new CardEngine(P(6), new SeededRng(5));
    e.dealRoundRobin(6);
    e.dealBoard(5, true); // ligne 1 : tout visible
    e.dealBoard(4, true); // ligne 2 : flop+turn visibles
    e.dealBoard(1, false); // ligne 2 : river cachée
    e.dealBoard(4, true); // ligne 3 : flop+turn visibles
    e.dealBoard(1, false); // ligne 3 : river cachée
    expect(e.deckCount).toBe(52 - 36 - 15); // 1 : pas d'épuisement à 6 joueurs
    const board = e.projectForPlayer('P0').board;
    expect(board).toHaveLength(15);
    expect(board.slice(0, 5).every((c) => c !== null)).toBe(true); // ligne 1 entièrement visible
    expect(board.slice(5, 9).every((c) => c !== null)).toBe(true); // ligne 2 : flop+turn visibles
    expect(board[9]).toBeNull(); // ligne 2 : river cachée
    expect(board.slice(10, 14).every((c) => c !== null)).toBe(true); // ligne 3 : flop+turn visibles
    expect(board[14]).toBeNull(); // ligne 3 : river cachée
    e.revealBoardSlot(9);
    expect(e.projectForPlayer('P0').board[9]).not.toBeNull();
    expect(e.projectForPlayer('P0').board[14]).toBeNull();
    expect(() => e.revealBoardSlot(9)).toThrowError(CardEngineError);
    e.revealBoardSlot(14);
    expect(e.projectForPlayer('P0').board.every((c) => c !== null)).toBe(true);
    e.checkInvariants();
  });

  it('atomicité : un tirage impossible ne modifie rien', () => {
    const e = new CardEngine(P(2), new SeededRng(3));
    e.dealToPlayer('P0', 50);
    const before = JSON.stringify(e.snapshot());
    expect(() => e.dealToPlayer('P1', 3)).toThrowError(/DECK|demandées/);
    expect(() => e.dealRoundRobin(2)).toThrowError(CardEngineError);
    expect(JSON.stringify(e.snapshot())).toBe(before);
  });

  it('joueur inconnu / arguments invalides', () => {
    const e = new CardEngine(P(2), new SeededRng(3));
    expect(() => e.dealToPlayer('X', 1)).toThrowError(CardEngineError);
    expect(() => e.dealToPlayer('P0', -1)).toThrowError(CardEngineError);
    expect(() => new CardEngine(['A', 'A'], new SeededRng(1))).toThrowError(CardEngineError);
  });
});

describe('CardEngine : révélation (6-1)', () => {
  it('révèle dans l\'ordre de distribution, jusqu\'à épuisement des cartes cachées', () => {
    const e = new CardEngine(P(2), new SeededRng(9));
    e.dealRoundRobin(6, { visibleFrom: 5 });
    const order = e.getHand('P0').map((x) => x.card.code);
    for (let i = 0; i < 5; i++) {
      expect(e.hiddenCount('P0')).toBe(5 - i);
      expect(e.revealNextHiddenCard('P0').code).toBe(order[i]);
    }
    expect(e.hiddenCount('P0')).toBe(0);
    expect(() => e.revealNextHiddenCard('P0')).toThrowError(/plus de carte cachée/);
    expect(e.hiddenCount('P1')).toBe(5);
  });
  it('revealHandCard : carte absente ou déjà visible = erreur', () => {
    const e = new CardEngine(P(2), new SeededRng(9));
    e.dealRoundRobin(2, { visibleFrom: 1 });
    const [h0, h1] = e.getHand('P0');
    expect(() => e.revealHandCard('P0', h1!.card)).toThrowError(/déjà visible/);
    expect(e.revealHandCard('P0', h0!.card)).toBe(h0!.card);
    expect(() => e.revealHandCard('P1', h0!.card)).toThrowError(/pas dans la main/);
  });
  it('revealAllHand (showdown)', () => {
    const e = new CardEngine(P(2), new SeededRng(9));
    e.dealToPlayer('P0', 5);
    e.revealAllHand('P0');
    expect(e.hiddenCount('P0')).toBe(0);
  });
});

describe('CardEngine : défausse', () => {
  it('retire de la main, va dans la défausse, validations atomiques', () => {
    const e = new CardEngine(P(2), new SeededRng(11));
    e.dealToPlayer('P0', 5);
    e.dealToPlayer('P1', 5);
    const [a, b] = e.getHand('P0').map((x) => x.card);
    const foreign = e.getHand('P1')[0]!.card;
    expect(() => e.discard('P0', [a!, foreign])).toThrowError(/pas dans la main/);
    expect(() => e.discard('P0', [a!, a!])).toThrowError(/deux fois/);
    expect(e.getHand('P0')).toHaveLength(5);
    e.discard('P0', [a!, b!]);
    expect(e.getHand('P0')).toHaveLength(3);
    expect(e.discardCount).toBe(2);
    e.checkInvariants();
  });
});

describe('CardEngine : vues par joueur (aucune fuite)', () => {
  it('un adversaire ne voit ni mains cachées, ni paquet, ni défausse, ni river cachée', () => {
    const e = new CardEngine(P(3), new SeededRng(21));
    e.dealRoundRobin(5);
    e.dealBoard(3, true);
    e.dealBoard(1, false);
    e.revealNextHiddenCard('P0'); // P0 montre une carte
    const d = e.getHand('P2').slice(0, 2).map((x) => x.card);
    e.discard('P2', d);

    const viewB = e.projectForPlayer('P1');
    const expected = new Set<string>();
    e.getHand('P1').forEach((x) => expected.add(x.card.code)); // sa propre main
    for (const p of ['P0', 'P2']) e.getHand(p).filter((x) => x.visible).forEach((x) => expected.add(x.card.code));
    e.getBoard().filter((s) => s.visible).forEach((s) => expected.add(s.card.code));
    expect(codesIn(viewB)).toEqual(expected);

    // Cartes cachées d'autrui, river cachée et défausse : absentes
    const forbidden = [
      ...e.getHand('P0').filter((x) => !x.visible).map((x) => x.card.code),
      ...e.getHand('P2').filter((x) => !x.visible).map((x) => x.card.code),
      ...d.map((c) => c.code),
      e.getBoard()[3]!.card.code,
    ];
    const seen = codesIn(viewB);
    for (const code of forbidden) expect(seen.has(code)).toBe(false);
    expect(viewB.hands.P0).toMatchObject({ kind: 'opponent', hiddenCount: 4 });
    expect(viewB.discardCount).toBe(2);
    expect(viewB.board[3]).toBeNull();
  });
  it('spectateur : aucune main privée', () => {
    const e = new CardEngine(P(2), new SeededRng(2));
    e.dealRoundRobin(3);
    const v = e.projectForPlayer(null);
    expect(codesIn(v).size).toBe(0);
  });
});

describe('CardEngine : Fermé 2, pire cas à 5 joueurs (55 cartes pour 52)', () => {
  const setup = () => {
    const e = new CardEngine(P(5), new SeededRng(99));
    e.dealRoundRobin(5);
    return e;
  };
  const change = (e: CardEngine, allowReshuffle: boolean) => {
    // remplacements tirés AVANT de défausser (cartes jetées encore en main) : seules les
    // défausses d'un tour précédent sont remélangeables
    for (const p of P(5)) {
      const chosen = e.getHand(p).slice(0, 3).map((x) => x.card);
      e.dealToPlayer(p, 3, { allowReshuffle });
      e.discard(p, chosen);
    }
  };
  it('change 1 sans remélange ; change 2 remélange exactement une fois, paquet épuisé', () => {
    const e = setup();
    change(e, false);
    expect(e.deckCount).toBe(52 - 25 - 15);
    expect(e.discardCount).toBe(15);
    expect(e.reshuffleCount).toBe(0);
    change(e, true);
    expect(e.reshuffleCount).toBe(1);
    e.checkInvariants();
    for (const p of P(5)) expect(e.getHand(p)).toHaveLength(5);
  });
  it('sans remélange autorisé : échec propre, état intact', () => {
    const e = setup();
    change(e, false);
    const p0 = 'P0';
    e.dealToPlayer('P0', 3);
    e.dealToPlayer('P1', 3);
    e.dealToPlayer('P2', 3);
    e.dealToPlayer('P3', 3);
    expect(e.deckCount).toBe(0);
    const before = JSON.stringify(e.snapshot());
    expect(() => e.dealToPlayer('P4', 1)).toThrowError(/DECK|demandées/);
    expect(JSON.stringify(e.snapshot())).toBe(before);
    void p0;
  });
  it('le remélange ne se déclenche que si le paquet est vide', () => {
    const e = setup();
    change(e, false);
    e.dealToPlayer('P0', 12, { allowReshuffle: true });
    expect(e.reshuffleCount).toBe(0);
    expect(e.deckCount).toBe(0);
    e.dealToPlayer('P0', 1, { allowReshuffle: true });
    expect(e.reshuffleCount).toBe(1);
    e.checkInvariants();
  });
});

describe('CardEngine : persistance et invariants', () => {
  it('snapshot / restore : vues identiques pour chaque joueur', () => {
    const e = new CardEngine(P(4), new SeededRng(31));
    e.dealRoundRobin(6, { visibleFrom: 5 });
    e.dealBoard(5, true);
    e.revealNextHiddenCard('P2');
    e.discard('P1', [e.getHand('P1')[0]!.card]);
    const snap = JSON.parse(JSON.stringify(e.snapshot()));
    const r = CardEngine.restore(snap, new SeededRng(0));
    for (const p of [...P(4), null]) expect(r.projectForPlayer(p)).toEqual(e.projectForPlayer(p));
    expect(r.snapshot()).toEqual(e.snapshot());
  });
  it('un snapshot corrompu est rejeté', () => {
    const e = new CardEngine(P(2), new SeededRng(1));
    const snap = e.snapshot();
    snap.deck[0] = snap.deck[1]!;
    expect(() => CardEngine.restore(snap, new SeededRng(0))).toThrowError(/double|52/);
  });
  it('200 séquences aléatoires : l\'invariant des 52 cartes tient toujours', () => {
    for (let run = 0; run < 200; run++) {
      const rng = new SeededRng(run);
      const n = 2 + (run % 5);
      const players = P(n);
      const e = new CardEngine(players, rng);
      for (let step = 0; step < 60; step++) {
        const p = players[rng.int(n)]!;
        try {
          switch (rng.int(5)) {
            case 0:
              e.dealToPlayer(p, rng.int(4), { visible: rng.int(2) === 0, allowReshuffle: true });
              break;
            case 1: {
              const h = e.getHand(p);
              e.discard(p, h.slice(0, Math.min(h.length, rng.int(4))).map((x) => x.card));
              break;
            }
            case 2:
              e.revealNextHiddenCard(p);
              break;
            case 3:
              e.dealBoard(rng.int(3), rng.int(2) === 0, true);
              break;
            default:
              e.revealBoardSlot(rng.int(8));
          }
        } catch (err) {
          if (!(err instanceof CardEngineError)) throw err;
        }
        e.checkInvariants();
      }
    }
  });
});
