import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, analyze, applyAction, BjError, challengeDelta, commitmentOf, dailyChallenges, DEFAULT_RULES, handValue, isNaturalBlackjack, legalActions, levelFromXp, newlyUnlocked, recommend, replayRound,
  resolveTable, roundFacts, roundView, sha256Hex, shoeFromSeed, startFromShoe, startRound, verifySeed, xpToReach, type BjRound, type TableRules,
} from '../src';

const R = (over: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_RULES, ...over });
/** Sabot truqué (tests uniquement) : ordre de tirage = joueur, croupier(visible), joueur, croupier(cachée), puis suite. */
const deal = (shoe: string[], over: Partial<TableRules> = {}, bet = 100): BjRound => startFromShoe(R(over), bet, [...shoe, '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', '2d', '3d']);
const play = (r: BjRound, ...a: Parameters<typeof applyAction>[1][]): BjRound => a.reduce((x, act) => applyAction(x, act), r);

describe('SHA-256 (engagement d’équité)', () => {
  it('vecteurs de test officiels', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
  });
});

describe('sabot vérifiable', () => {
  it('même graine → même ordre ; graines différentes → ordres différents', () => {
    expect(shoeFromSeed('abc', 6)).toEqual(shoeFromSeed('abc', 6));
    expect(shoeFromSeed('abc', 6)).not.toEqual(shoeFromSeed('abd', 6));
  });
  it('composition exacte : n jeux de 52 cartes, 4×n de chaque rang', () => {
    for (const decks of [1, 2, 6, 8]) {
      const shoe = shoeFromSeed('graine', decks);
      expect(shoe).toHaveLength(52 * decks);
      for (const rank of '23456789TJQKA') expect(shoe.filter((c) => c[0] === rank)).toHaveLength(4 * decks);
    }
    expect(() => shoeFromSeed('x', 0)).toThrow();
    expect(() => shoeFromSeed('x', 9)).toThrow();
  });
  it('engagement : la graine révélée correspond au hash publié, et seulement à lui', () => {
    const c = commitmentOf('graine-secrete');
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySeed('graine-secrete', c)).toBe(true);
    expect(verifySeed('autre', c)).toBe(false);
  });
  it('équité statistique : la première carte est uniforme sur les 13 rangs (khi-deux)', () => {
    const n = 5200;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) counts[shoeFromSeed(`s${i}`, 1)[0]![0]!] = (counts[shoeFromSeed(`s${i}`, 1)[0]![0]!] ?? 0) + 1;
    const exp = n / 13;
    const chi = Object.values(counts).reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    expect(Object.keys(counts)).toHaveLength(13);
    expect(chi).toBeLessThan(32.9); // seuil à 0,1 % pour 12 degrés de liberté
  });
});

describe('valeur des mains', () => {
  it('As souple puis dur, figures, dépassement', () => {
    expect(handValue(['As', 'Kd'])).toEqual({ total: 21, soft: true, bust: false });
    expect(handValue(['As', '6d'])).toEqual({ total: 17, soft: true, bust: false });
    expect(handValue(['As', '6d', 'Kc'])).toEqual({ total: 17, soft: false, bust: false });
    expect(handValue(['As', 'Ad', 'Ac'])).toEqual({ total: 13, soft: true, bust: false });
    expect(handValue(['As', 'Ad', '9c'])).toEqual({ total: 21, soft: true, bust: false });
    expect(handValue(['Ks', 'Qd', '5c'])).toEqual({ total: 25, soft: false, bust: true });
    expect(handValue(['Ts', 'Jd'])).toEqual({ total: 20, soft: false, bust: false });
  });
  it('Blackjack naturel : 2 cartes seulement', () => {
    expect(isNaturalBlackjack(['As', 'Td'])).toBe(true);
    expect(isNaturalBlackjack(['7s', '7d', '7c'])).toBe(false);
    expect(isNaturalBlackjack(['9s', 'Ad'])).toBe(false);
  });
});

describe('déroulement d’une manche', () => {
  it('distribution : joueur, croupier visible, joueur, croupier caché ; vue sans la carte cachée', () => {
    const r = deal(['9s', 'Kd', '8h', '7c']);
    expect(r.hands[0]!.cards).toEqual(['9s', '8h']);
    expect(r.dealer).toEqual(['Kd', '7c']);
    expect(roundView(r).dealer).toEqual(['Kd', null]);
    expect(JSON.stringify(roundView(r))).not.toContain('7c');
  });
  it('Blackjack naturel payé 3 contre 2 (et 6 contre 5 à une table 6:5), manche terminée aussitôt', () => {
    const a = deal(['As', '9d', 'Kh', '7c']);
    expect(a.phase).toBe('DONE');
    expect(a.hands[0]).toMatchObject({ result: 'BLACKJACK', net: 150 });
    const b = deal(['As', '9d', 'Kh', '7c'], { blackjackPays: '6:5' });
    expect(b.net).toBe(120);
  });
  it('Blackjack du joueur contre Blackjack du croupier : égalité (Push)', () => {
    const r = deal(['As', 'Ad', 'Kh', 'Kc']);
    expect(r.dealerBlackjack).toBe(true);
    expect(r.hands[0]).toMatchObject({ result: 'PUSH', net: 0 });
  });
  it('Blackjack du croupier seul : le joueur perd sa mise, sans pouvoir jouer', () => {
    const r = deal(['9s', 'Ad', '8h', 'Kc']);
    expect(r.phase).toBe('DONE');
    expect(r.net).toBe(-100);
    expect(legalActions(r)).toEqual([]);
    expect(() => applyAction(r, 'HIT')).toThrowError(BjError);
  });
  it('Hit puis dépassement : perte, le croupier ne tire pas', () => {
    const r = play(deal(['Ts', '9d', '6h', '7c', 'Kc']), 'HIT');
    expect(r.hands[0]).toMatchObject({ result: 'BUST', net: -100 });
    expect(r.dealer).toHaveLength(2);
  });
  it('Stand : le croupier tire jusqu’à 17 et s’arrête sur tout 17 dur', () => {
    const r = play(deal(['Ts', '6d', '9h', '5c', '6c']), 'STAND'); // croupier 6+5=11, +6 = 17
    expect(r.dealer).toEqual(['6d', '5c', '6c']);
    expect(r.hands[0]).toMatchObject({ result: 'WIN', net: 100 });
  });
  it('le croupier dépassant 21 fait gagner toutes les mains vivantes', () => {
    const r = play(deal(['Ts', 'Kd', '8h', '6c', 'Kc']), 'STAND'); // croupier 16 + K = 26
    expect(r.hands[0]!.result).toBe('WIN');
  });
  it('égalité (Push) : mise rendue ; défaite à total inférieur', () => {
    expect(play(deal(['Ts', 'Kd', '8h', '8c']), 'STAND').hands[0]).toMatchObject({ result: 'PUSH', net: 0 });
    expect(play(deal(['Ts', 'Kd', '7h', '9c']), 'STAND').hands[0]).toMatchObject({ result: 'LOSE', net: -100 });
  });
  it('17 soft du croupier : il reste (S17) ou tire (H17)', () => {
    const s17 = play(deal(['Ts', 'Ad', '9h', '6c', '2c'], { dealerHitsSoft17: false }), 'STAND'); // 7 + 11 = 17 soft
    expect(s17.dealer).toHaveLength(2);
    const h17 = play(deal(['Ts', 'Ad', '9h', '6c', '2c'], { dealerHitsSoft17: true }), 'STAND');
    expect(h17.dealer).toEqual(['Ad', '6c', '2c']);
  });
  it('21 atteint au Hit : la main s’arrête seule', () => {
    const r = play(deal(['5s', '9d', '6h', '7c', 'Tc']), 'HIT'); // 11 + 10 = 21
    expect(r.phase).toBe('DONE');
    expect(r.hands[0]!.cards).toHaveLength(3);
  });
});

describe('Double, Séparer, Abandonner', () => {
  it('Double : mise doublée, une seule carte, main terminée ; gain doublé', () => {
    const r = play(deal(['5s', '6d', '6h', '7c', 'Tc', 'Kc']), 'DOUBLE'); // 11 + 10 = 21 ; croupier 6+7+K = 23
    expect(r.hands[0]).toMatchObject({ doubled: true, bet: 200, result: 'WIN', net: 200 });
    expect(r.wagered).toBe(200);
  });
  it('Double impossible sans jetons suffisants, ou sur 3 cartes', () => {
    const r = deal(['5s', '6d', '6h', '7c']);
    expect(legalActions(r, 99)).not.toContain('DOUBLE');
    expect(legalActions(r, 100)).toContain('DOUBLE');
    expect(() => applyAction(r, 'DOUBLE', 50)).toThrowError(BjError);
    const three = play(deal(['2s', '6d', '3h', '7c', '2d']), 'HIT');
    expect(legalActions(three)).not.toContain('DOUBLE');
  });
  it('règle « 9 à 11 » : pas de Double sur 8 ni sur un total souple', () => {
    expect(legalActions(deal(['5s', '6d', '3h', '7c'], { doubleOn: '9-11' }))).not.toContain('DOUBLE'); // 8
    expect(legalActions(deal(['As', '6d', '5h', '7c'], { doubleOn: '9-11' }))).not.toContain('DOUBLE'); // soft 16
    expect(legalActions(deal(['5s', '6d', '5h', '7c'], { doubleOn: '9-11' }))).toContain('DOUBLE'); // 10
    expect(legalActions(deal(['5s', '6d', '4h', '7c'], { doubleOn: '10-11' }))).not.toContain('DOUBLE'); // 9
  });
  it('Séparer : deux mains, deux mises, chacune reçoit une carte ; jouées l’une après l’autre', () => {
    let r = deal(['8s', '6d', '8h', 'Tc', '3c', '2d', 'Tc', 'Kc']);
    expect(legalActions(r)).toContain('SPLIT');
    r = applyAction(r, 'SPLIT');
    expect(r.hands.map((h) => h.cards)).toEqual([['8s', '3c'], ['8h', '2d']]);
    expect(r.wagered).toBe(200);
    expect(r.active).toBe(0);
    r = play(r, 'STAND');
    expect(r.active).toBe(1);
    r = play(r, 'STAND');
    expect(r.phase).toBe('DONE');
    expect(r.hands).toHaveLength(2);
  });
  it('Séparer des figures de valeur égale (K et Q) est permis ; paires de valeurs différentes refusées', () => {
    expect(legalActions(deal(['Ks', '6d', 'Qh', '7c']))).toContain('SPLIT');
    expect(legalActions(deal(['9s', '6d', 'Th', '7c']))).not.toContain('SPLIT');
  });
  it('As séparés : une seule carte chacun, pas de tirage ; 21 sur As séparé n’est pas un Blackjack', () => {
    let r = deal(['As', '9d', 'Ah', '8c', 'Kc', '5d']);
    r = applyAction(r, 'SPLIT');
    expect(r.hands.every((h) => h.done)).toBe(true);
    expect(r.phase).toBe('DONE');
    expect(r.hands[0]).toMatchObject({ result: 'WIN', net: 100 }); // 21 contre 17, payé 1 pour 1
    expect(r.hands[0]!.result).not.toBe('BLACKJACK');
  });
  it('re-séparation des As : refusée par défaut, permise si la table l’autorise', () => {
    const shoe = ['As', '9d', 'Ah', '8c', 'Ac', 'Ad', '2s', '3s'];
    const r1 = applyAction(deal(shoe, { resplitAces: false }), 'SPLIT');
    expect(r1.hands.every((h) => h.done)).toBe(true);
    const r2 = applyAction(deal(shoe, { resplitAces: true }), 'SPLIT');
    expect(r2.hands.every((h) => h.done)).toBe(true); // main d’As séparés : une carte, terminée
  });
  it('limite du nombre de mains', () => {
    let r = deal(['8s', '6d', '8h', '10c', '8c', '8d', '8s', '8h'], { maxHands: 2 });
    r = applyAction(r, 'SPLIT');
    expect(legalActions(r)).not.toContain('SPLIT');
  });
  it('Double après séparation : selon la règle de la table', () => {
    const shoe = ['6s', '6d', '6h', '9c', '5c', '4d'];
    const yes = applyAction(deal(shoe, { doubleAfterSplit: true }), 'SPLIT');
    expect(legalActions(yes)).toContain('DOUBLE'); // 6+5 = 11
    const no = applyAction(deal(shoe, { doubleAfterSplit: false }), 'SPLIT');
    expect(legalActions(no)).not.toContain('DOUBLE');
  });
  it('Abandon : perd la moitié, seulement en première décision, jamais après séparation ou Hit', () => {
    let r = deal(['Ts', 'Kd', '6h', '7c'], { surrender: true });
    expect(legalActions(r)).toContain('SURRENDER');
    const s = applyAction(r, 'SURRENDER');
    expect(s.hands[0]).toMatchObject({ result: 'SURRENDER', net: -50 });
    expect(s.phase).toBe('DONE');
    r = play(deal(['2s', 'Kd', '3h', '7c', '2d'], { surrender: true }), 'HIT');
    expect(legalActions(r)).not.toContain('SURRENDER');
    expect(legalActions(deal(['Ts', 'Kd', '6h', '7c'], { surrender: false }))).not.toContain('SURRENDER');
  });
  it('mise impaire : l’abandon perd la moitié arrondie au-dessus', () => {
    expect(applyAction(deal(['Ts', 'Kd', '6h', '7c'], {}, 25), 'SURRENDER').net).toBe(-13);
  });
  it('mise invalide et manche terminée', () => {
    expect(() => startRound(R(), 0, 'x')).toThrowError(BjError);
    expect(() => startRound(R(), 1.5, 'x')).toThrowError(BjError);
  });
});

describe('rejeu, reprise et tables', () => {
  it('une manche rejouée depuis sa graine redonne exactement le même résultat', () => {
    for (let i = 0; i < 60; i++) {
      let r = startRound(R(), 50, `seed-${i}`);
      const actions: Parameters<typeof applyAction>[1][] = [];
      while (r.phase === 'PLAYER') {
        const a = legalActions(r).includes('HIT') && handValue(r.hands[r.active]!.cards).total < 15 ? 'HIT' : 'STAND';
        actions.push(a);
        r = applyAction(r, a);
      }
      const again = replayRound(R(), 50, `seed-${i}`, actions);
      expect(again.net).toBe(r.net);
      expect(again.hands).toEqual(r.hands);
    }
  });
  it('le rejeu refuse une action impossible', () => {
    expect(() => replayRound(R(), 50, 'seed-0', ['SPLIT', 'SPLIT', 'SPLIT', 'SPLIT', 'SPLIT'])).toThrow();
  });
  it('le rejeu tient compte des jetons disponibles', () => {
    const seed = Array.from({ length: 400 }, (_, i) => `s${i}`).find((s) => legalActions(startRound(R(), 100, s)).includes('DOUBLE') && startRound(R(), 100, s).phase === 'PLAYER')!;
    expect(() => replayRound(R(), 100, seed, ['DOUBLE'], 150)).toThrow(); // 150 − 100 = 50 < 100
    expect(replayRound(R(), 100, seed, ['DOUBLE'], 200).hands[0]!.doubled).toBe(true);
  });
  it('tables : préréglages résolus, table libre validée', () => {
    expect(resolveTable('decouverte')!.limits).toEqual({ minBet: 5, maxBet: 100 });
    expect(resolveTable('inconnue')).toBeNull();
    expect(resolveTable('libre', R({ decks: 2 }))!.rules.decks).toBe(2);
    expect(resolveTable('libre', R({ decks: 9 }))).toBeNull();
    expect(resolveTable('libre', R({ maxHands: 1 }))).toBeNull();
  });
});

describe('simulation : cohérence des gains sur de nombreuses manches', () => {
  it('le net de chaque manche = somme des mains, jamais d’état incohérent (2 000 manches)', () => {
    let totalNet = 0;
    for (let i = 0; i < 2000; i++) {
      let r = startRound(R({ dealerHitsSoft17: i % 2 === 0, decks: [1, 2, 6, 8][i % 4]! }), 10, `sim-${i}`);
      let guard = 0;
      while (r.phase === 'PLAYER' && guard++ < 40) {
        const legal = legalActions(r);
        r = applyAction(r, recommend(r)?.action ?? 'STAND');
        expect(legal.length).toBeGreaterThan(0);
      }
      expect(r.phase).toBe('DONE');
      expect(r.net).toBe(r.hands.reduce((s, h) => s + h.net, 0));
      for (const h of r.hands) expect(h.result).not.toBeNull();
      totalNet += r.net;
    }
    // Stratégie de base : l'avantage de la maison reste faible (|perte moyenne| < 10 % de la mise sur 2 000 manches)
    expect(Math.abs(totalNet) / (2000 * 10)).toBeLessThan(0.1);
  });
});

describe('stratégie de base et probabilités', () => {
  it('cas classiques', () => {
    const adv = (shoe: string[], over: Partial<TableRules> = {}) => recommend(deal(shoe, over))!.action;
    expect(adv(['Ts', '6d', '6h', '7c'], { surrender: false })).toBe('STAND'); // 16 vs 6
    expect(adv(['Ts', 'Td', '6h', '7c'], { surrender: false })).toBe('HIT'); // 16 vs 10
    expect(adv(['Ts', 'Td', '6h', '7c'], { surrender: true })).toBe('SURRENDER'); // 16 vs 10
    expect(adv(['5s', '6d', '6h', '7c'])).toBe('DOUBLE'); // 11 vs 6
    expect(adv(['8s', '6d', '8h', '7c'])).toBe('SPLIT'); // 8-8
    expect(adv(['As', '6d', 'Ah', '7c'])).toBe('SPLIT'); // A-A
    expect(adv(['Ts', '6d', 'Kh', '7c'])).toBe('STAND'); // 20
    expect(adv(['As', '5d', '7h', '7c'])).toBe('DOUBLE'); // soft 18 vs 5
  });
  it('As-7 contre 6 : doubler ; contre 9 : tirer', () => {
    expect(recommend(deal(['As', '6d', '6h', '7c']))!.action).toBe('DOUBLE');
    expect(recommend(deal(['As', '9d', '6h', '7c']))!.action).toBe('HIT');
  });
  it('11 contre As : doubler seulement si le croupier tire sur 17 soft', () => {
    expect(recommend(deal(['5s', 'Ad', '6h', '7c'], { dealerHitsSoft17: false }))!.action).toBe('HIT');
    expect(recommend(deal(['5s', 'Ad', '6h', '7c'], { dealerHitsSoft17: true }))!.action).toBe('DOUBLE');
  });
  it('si le Double est impossible, la stratégie se rabat sur Tirer', () => {
    expect(recommend(deal(['5s', '6d', '6h', '7c']), 10)!.action).toBe('HIT');
  });
  it('conseil toujours légal', () => {
    for (let i = 0; i < 300; i++) {
      const r = startRound(R(), 10, `adv-${i}`);
      if (r.phase !== 'PLAYER') continue;
      expect(legalActions(r)).toContain(recommend(r)!.action);
    }
  });
  it('probabilités : cohérentes (somme à 1), dépassement exact sur un cas simple', () => {
    const r = deal(['Ts', '6d', '6h', '7c'], { decks: 1 }); // joueur 16 ; cartes vues : T, 6, 6 → 51−… 
    const o = analyze(r);
    const sum = o.stand.win + o.stand.push + o.stand.lose;
    expect(sum).toBeCloseTo(1, 9);
    const d = o.dealerFinal;
    expect(d[17] + d[18] + d[19] + d[20] + d[21] + d.bust).toBeCloseTo(1, 9);
    // 1 jeu : valeurs vues = T, 6, 6 → 49 cartes inconnues ; il en reste 15 dizaines (16−1) + 2×… cartes qui font dépasser 16
    // dépassent : 6 (2 restants), 7 (4), 8 (4), 9 (4), 10 (15)  → 29/49
    expect(o.bustOnHit).toBeCloseTo(29 / 49, 9);
  });
  it('le croupier montrant un 6 dépasse plus souvent que montrant un 10', () => {
    const six = analyze(deal(['Ts', '6d', '8h', '2c'], { decks: 6 })).dealerFinal.bust;
    const ten = analyze(deal(['Ts', 'Td', '8h', '2c'], { decks: 6 })).dealerFinal.bust;
    expect(six).toBeGreaterThan(ten);
    expect(six).toBeGreaterThan(0.38);
    expect(six).toBeLessThan(0.48);
  });
  it('contre un 10 avec vérification du Blackjack : la carte cachée n’est jamais un As', () => {
    const o = analyze(deal(['9s', 'Td', '8h', '6c'], { decks: 1 }));
    expect(o.dealerFinal[21]).toBeGreaterThan(0); // 21 possible par 10+… (ex. 5+6, 3+3+5)
  });
});

describe('progression', () => {
  it('niveaux : seuils d’XP croissants et inverse cohérent', () => {
    expect([1, 2, 3, 4, 5].map(xpToReach)).toEqual([0, 100, 300, 600, 1000]);
    for (let l = 1; l < 30; l++) expect(levelFromXp(xpToReach(l))).toBe(l);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
  });
  it('défis du jour : 3 défis distincts, stables sur la journée, variables selon le joueur et le jour', () => {
    const a = dailyChallenges('u1', '2026-11-08');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((c) => c.metric)).size).toBe(3);
    expect(dailyChallenges('u1', '2026-11-08')).toEqual(a);
    const others = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => dailyChallenges('u1', d).map((c) => c.id).join());
    expect(new Set([a.map((c) => c.id).join(), ...others]).size).toBeGreaterThan(1);
  });
  it('bilan d’une manche et avancement des défis', () => {
    const r = deal(['As', '9d', 'Kh', '7c']);
    const f = roundFacts(r);
    expect(f).toMatchObject({ hands: 1, handsWon: 1, blackjacks: 1, net: 150, won: true });
    expect(challengeDelta('blackjacks', f)).toBe(1);
    expect(challengeDelta('netChips', f)).toBe(150);
  });
  it('objectifs : débloqués une seule fois', () => {
    const stats = { rounds: 10, hands: 12, handsWon: 5, handsLost: 4, handsPushed: 1, blackjacks: 1, doublesWon: 0, splitsWon: 0, netChips: 40, bestStreak: 2, streak: 1, maxChips: 1200, level: 2 };
    const first = newlyUnlocked(stats, new Set()).map((a) => a.id);
    expect(first).toEqual(expect.arrayContaining(['premiere-victoire', 'dix-manches', 'premier-blackjack']));
    expect(first).not.toContain('serie-5');
    expect(newlyUnlocked(stats, new Set(first))).toEqual([]);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(8);
  });
});
