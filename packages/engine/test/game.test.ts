import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { GameManager, MAX_STAKE_CHIPS, type GameConfig } from '../src/game/gameManager';
import { assignPositions } from '../src/game/positions';
import { RuleError, VARIANT_IDS, type RoundCommand, type VariantId } from '../src/variants';
import { dealStack, names, randomCommand } from './helpers';

// ---------- Paquets truqués ----------
const WIN = ['As', 'Ad', '2c', '7d', '9h']; // paire d'As
const LOSERS = [
  ['Ks', 'Qd', '8c', '5h', '3s'],
  ['Kd', 'Jc', '9d', '6h', '4s'],
  ['Kh', 'Tc', '7s', '5c', '2s'],
];
/** Fermé 1 : le joueur `w` gagne au showdown sans rien changer (TIMEOUT = 0 change pour tous). */
function closedWin(n: number, w: number): string[] {
  let li = 0;
  return dealStack(Array.from({ length: n }, (_, i) => (i === w ? WIN : LOSERS[li++]!)));
}
const TIE_HANDS = [
  ['As', 'Ad', 'Kc', 'Qd', '2h'],
  ['Ah', 'Ac', 'Ks', 'Qh', '2d'],
];
const H63 = [
  ['9h', 'Th', 'As', 'Ad', '3c', '4d'],
  ['Ah', 'Ac', '5s', '6d', '8c', '3h'],
  ['Kd', 'Ks', '7s', '8d', '9s', '2h'],
];
const BASE63 = ['Jh', 'Qh', '2d', '4c']; // ligne 1 : flop + turn (sa river vient de rivers[0])
// Lignes 2 et 3 : flop + turn de remplissage (neutres, sans As ni Roi, disjoints de tout le reste) ;
// leur river vient de rivers[1] et rivers[2] respectivement.
const L2_FILLER = ['4s', '5c', '6c', '8s'];
const L3_FILLER = ['3d', '4h', '6s', '9c'];
const stack63 = (rivers: [string, string, string]) =>
  dealStack(H63, [...BASE63, rivers[0]!, ...L2_FILLER, rivers[1]!, ...L3_FILLER, rivers[2]!]);

const cfg = (n: number, target = 3): GameConfig => ({ players: names(n), targetPoints: target, stakeChips: 2000 });
const choose = (g: GameManager, v: VariantId) => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: v });
const round = (g: GameManager, command: RoundCommand) => g.apply({ type: 'ROUND', command });
const TIMEOUT: RoundCommand = { type: 'TIMEOUT' };

/** Partie où la manche r (1-based) est dictée par `stacks[r]`. */
function stackedGame(config: GameConfig, stacks: Record<number, string[]>, seed = 1) {
  return new GameManager(config, new SeededRng(seed), { stackedDeck: (r) => stacks[r] });
}
const lines63 = (g: GameManager, picks: Record<string, [string, string]>[]) => {
  for (const pk of picks) {
    for (const [p, cards] of Object.entries(pk)) {
      round(g, { type: 'SELECT', player: p, cards });
      round(g, { type: 'VALIDATE', player: p });
    }
    if (Object.keys(pk).length < H63.length) round(g, TIMEOUT); // 3 joueurs : les absents laissent le minuteur expirer
  }
};

describe('configuration', () => {
  it('2 à 6 joueurs distincts, objectif entier ≥ 1, mise entière ≥ 0', () => {
    expect(() => new GameManager(cfg(1), new SeededRng(1))).toThrowError(RuleError);
    expect(() => new GameManager(cfg(7), new SeededRng(1))).toThrowError(RuleError);
    expect(() => new GameManager({ ...cfg(2), players: ['A', 'A'] }, new SeededRng(1))).toThrowError(RuleError);
    expect(() => new GameManager(cfg(3, 0), new SeededRng(1))).toThrowError(/Objectif/);
    expect(() => new GameManager(cfg(3, 2.5), new SeededRng(1))).toThrowError(/Objectif/);
    expect(() => new GameManager(cfg(3, 6), new SeededRng(1))).toThrowError(/de 1 à 5 points/); // 5 = maximum
    expect(() => new GameManager(cfg(3, 5), new SeededRng(1))).not.toThrow();
    expect(() => new GameManager(cfg(3, 1), new SeededRng(1))).not.toThrow();
    expect(() => new GameManager({ ...cfg(3), maxPlayers: 2 }, new SeededRng(1))).toThrowError(/maximal de joueurs/); // < joueurs présents
    expect(() => new GameManager({ ...cfg(3), maxPlayers: 7 }, new SeededRng(1))).toThrowError(/maximal de joueurs/);
    expect(() => new GameManager({ ...cfg(3), stakeChips: -1 }, new SeededRng(1))).toThrowError(/Mise/);
    expect(() => new GameManager({ ...cfg(3), stakeChips: 10_001 }, new SeededRng(1))).toThrowError(/10 000 jetons/);
    expect(() => new GameManager({ ...cfg(3), stakeChips: MAX_STAKE_CHIPS }, new SeededRng(1))).not.toThrow(); // 10 000 jetons : accepté
    expect(() => new GameManager({ ...cfg(3), stakeChips: 0 }, new SeededRng(1))).not.toThrow();
    expect(new GameManager({ ...cfg(6), stakeChips: MAX_STAKE_CHIPS }, new SeededRng(1)).view(null).potChips).toBe(60_000);
    const g = new GameManager(cfg(6, 5), new SeededRng(1));
    expect(g.view('P0')).toMatchObject({ phase: 'VARIANT_SELECTION', roundNo: 1, targetPoints: 5, potChips: 12000, maxPlayers: 6 });
  });
});

describe('rotation du choix de variante', () => {
  it('manche 1 → UTG, 2 → UTG+1… puis retour à UTG', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0), 2: closedWin(3, 0), 3: closedWin(3, 0), 4: closedWin(3, 0) });
    const seen: string[] = [];
    for (let r = 1; r <= 4; r++) {
      seen.push(g.chooser());
      expect(g.awaiting()).toEqual([g.chooser()]);
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    expect(seen).toEqual(['P0', 'P1', 'P2', 'P0']);
    expect(g.history().map((h) => h.chooser)).toEqual(seen);
  });

  it('seul le joueur désigné choisit ; variante inconnue ou indisponible refusée sans effet', () => {
    const g = new GameManager(cfg(6), new SeededRng(1));
    const before = JSON.stringify(g.snapshot());
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: 'P3', variant: 'V6_3' })).toThrowError(/ne choisit pas/);
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: 'X', variant: 'V6_3' })).toThrowError(RuleError);
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: 'P0', variant: 'CLOSED_2' })).toThrowError(/pas jouable/);
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: 'P0', variant: 'POKER' as VariantId })).toThrowError(RuleError);
    expect(() => g.apply({ type: 'ROUND', command: TIMEOUT })).toThrowError(/Aucune manche/);
    expect(JSON.stringify(g.snapshot())).toBe(before);
    expect(g.availableVariants()).toEqual(VARIANT_IDS.filter((v) => v !== 'CLOSED_2' && v !== 'LE10'));
    expect(g.view('P0').variants.find((v) => v.variant === 'CLOSED_2')!.available).toBe(false);
    const ev = choose(g, 'CLOSED_1');
    expect(ev[0]).toMatchObject({ type: 'VARIANT_CHOSEN', visibility: 'PUBLIC', data: { variant: 'CLOSED_1', chooser: 'P0' } });
    expect(() => choose(g, 'V6_3')).toThrowError(/manche est en cours/);
  });
});

describe('score, objectif, victoire', () => {
  it('la partie s\'arrête dès qu\'un joueur atteint l\'objectif ; classement final et historique', () => {
    // vainqueurs des manches : P1, P1, P2, P1 → P1 atteint 3 à la manche 4
    const g = stackedGame(cfg(3, 3), { 1: closedWin(3, 1), 2: closedWin(3, 1), 3: closedWin(3, 2), 4: closedWin(3, 1) });
    for (let r = 1; r <= 3; r++) {
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
      expect(g.phase()).toBe('VARIANT_SELECTION');
    }
    expect(g.roundNo).toBe(4);
    expect(g.view(null).players.map((p) => p.score)).toEqual([0, 2, 1]);
    choose(g, 'CLOSED_1');
    const events = round(g, TIMEOUT);
    expect(g.phase()).toBe('GAME_OVER');
    expect(events.map((e) => e.type).slice(-2)).toEqual(['ROUND_SCORED', 'GAME_OVER']);
    expect(g.outcome()).toEqual({
      winner: 'P1',
      victoryType: 'SCORE',
      standings: [{ player: 'P1', position: 'UTG+1', score: 3, rank: 1 }], // vainqueur seul (pas d'assurance)
      settlement: { potChips: 6000, payouts: { P0: 0, P1: 6000, P2: 0 }, applied: null }, // il récupère tout
      insurance: null,
    });
    expect(g.view(null).players.map((p) => p.score)).toEqual([0, 3, 1]); // les scores de tous restent consultables
    expect(g.history()).toHaveLength(4);
    expect(g.view('P0').evolution).toEqual({ P0: [0, 0, 0, 0], P1: [1, 2, 2, 3], P2: [0, 0, 1, 1] });
    expect(g.awaiting()).toEqual([]);
    expect(() => choose(g, 'CLOSED_1')).toThrowError(/terminée/);
    expect(() => round(g, TIMEOUT)).toThrowError(/terminée/);
  });

  it('un 6-3 gagné seul sur les 3 lignes (capot) rapporte 2 points : victoire dès l\'objectif atteint', () => {
    const g = stackedGame(cfg(3, 2), { 1: closedWin(3, 0), 2: stack63(['7c', '2s', 'Kh']) });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    expect(g.scoreOf('P0')).toBe(1);
    expect(g.chooser()).toBe('P1');
    choose(g, 'V6_3');
    lines63(g, [{ P0: ['As', 'Ad'] }, { P0: ['As', 'Ad'] }, { P0: ['As', 'Ad'] }]); // P0 gagne seul les 3 lignes
    expect(g.scoreOf('P0')).toBe(3); // 1 point de la première manche + 2 du capot
    expect(g.outcome()).toMatchObject({ winner: 'P0', victoryType: 'SCORE' });
    expect(g.history()[1]!.points).toEqual({ P0: 2, P1: 0, P2: 0 });
  });

  it('manche sans gagnant (6-3 sans aucune désignation) : aucun point, on passe au chooser suivant', () => {
    const g = stackedGame(cfg(3, 3), { 1: stack63(['7c', '2s', 'Kh']) });
    choose(g, 'V6_3');
    round(g, TIMEOUT);
    round(g, TIMEOUT);
    const ev = round(g, TIMEOUT);
    expect(g.phase()).toBe('VARIANT_SELECTION');
    expect(g.roundNo).toBe(2);
    expect(g.chooser()).toBe('P1');
    expect(g.view(null).players.map((p) => p.score)).toEqual([0, 0, 0]);
    expect(g.history()[0]!.award).toEqual({ kind: 'NONE', reason: 'NO_DESIGNATION' });
    expect(ev.at(-1)).toMatchObject({ type: 'VARIANT_SELECTION_STARTED', data: { roundNo: 2, chooser: 'P1' } });
  });

  it('6-3 à 3 joueurs, égalité en tête : 0 point pour tous et rotation (règle de table)', () => {
    const g = stackedGame(cfg(3, 3), { 1: stack63(['7c', '2s', 'Kh']) });
    choose(g, 'V6_3');
    lines63(g, [{ P0: ['As', 'Ad'] }, { P1: ['Ah', 'Ac'] }, { P2: ['Kd', 'Ks'] }]);
    expect(g.history()[0]!.award).toEqual({ kind: 'NONE', reason: 'TIE_SMALL_TABLE' });
    expect(g.roundNo).toBe(2);
  });
});

describe('quinte flush 6-3 : victoire immédiate, indépendante du score et de l\'objectif', () => {
  it('même si un autre joueur mène et que l\'objectif est loin', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 1), 2: stack63(['Kh', '7c', '2s']) });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    expect(g.scoreOf('P1')).toBe(1);
    choose(g, 'V6_3'); // choisi par P1
    lines63(g, [{ P0: ['9h', 'Th'], P1: ['Ah', 'Ac'] }]);
    expect(g.phase()).toBe('GAME_OVER');
    expect(g.outcome()).toEqual({
      winner: 'P0',
      victoryType: 'STRAIGHT_FLUSH_63',
      standings: [{ player: 'P0', position: 'UTG', score: 0, rank: 1 }], // le vainqueur, même avec 0 point
      settlement: { potChips: 6000, payouts: { P0: 6000, P1: 0, P2: 0 }, applied: null },
      insurance: null,
    });
    expect(g.history()[1]!.award).toEqual({ kind: 'INSTANT_VICTORY', winner: 'P0', line: 1 });
    expect(g.scoreOf('P0')).toBe(0); // aucun point de score n'est ajouté
  });
});

describe('égalité : Hold\'em de départage', () => {
  it('égalité au showdown : le Hold\'em désigne le gagnant, qui marque 1 point', () => {
    const g = stackedGame(cfg(2, 5), { 1: dealStack(TIE_HANDS) }, 42);
    choose(g, 'CLOSED_1');
    round(g, { type: 'VALIDATE', player: 'P0' });
    const ev = round(g, { type: 'VALIDATE', player: 'P1' });
    const rec = g.history()[0]!;
    expect(rec.result).toEqual({ kind: 'TIE', tied: ['P0', 'P1'] });
    expect(rec.award.kind).toBe('POINTS');
    if (rec.award.kind !== 'POINTS') throw new Error();
    expect(rec.award.points).toBe(1);
    expect(rec.award.tiebreak!.rounds[0]!.players).toEqual(['P0', 'P1']);
    expect(g.scoreOf(rec.award.winner)).toBe(1);
    expect(g.scoreOf(rec.award.winner === 'P0' ? 'P1' : 'P0')).toBe(0);
    expect(ev.map((e) => e.type)).toContain('TIEBREAK_PLAYED');
    expect(ev.map((e) => e.type).indexOf('TIEBREAK_PLAYED')).toBeLessThan(ev.map((e) => e.type).indexOf('ROUND_SCORED'));
  });
});

describe('Fermé : égalité à plusieurs → Hold\'em entre les seuls ex aequo', () => {
  it('égalité à 3 sur 4 joueurs : le Hold\'em oppose ces 3 joueurs ; le 4e (main plus faible) n\'y prend pas part', () => {
    const hands = [
      ['As', 'Kd', 'Qh', 'Jc', '9s'],
      ['Ac', 'Kh', 'Qd', 'Js', '9c'],
      ['Ah', 'Ks', 'Qc', 'Jd', '9h'],
      ['Kc', 'Qs', '8d', '6h', '3c'],
    ];
    const g = stackedGame(cfg(4, 5), { 1: dealStack(hands) }, 7);
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    const rec = g.history()[0]!;
    expect(rec.result).toEqual({ kind: 'TIE', tied: ['P0', 'P1', 'P2'] });
    if (rec.award.kind !== 'POINTS') throw new Error('un vainqueur est attendu');
    expect(rec.award.tiebreak!.rounds[0]!.players).toEqual(['P0', 'P1', 'P2']);
    expect(['P0', 'P1', 'P2']).toContain(rec.award.winner);
    expect(rec.award.points).toBe(1);
    expect(g.scoreOf('P3')).toBe(0);
  });
});

describe('assurance : proposition unique entre deux manches, règlement à la fin de la partie', () => {
  /** Objectif 2, 4 joueurs (mise 20 €). Manche 1 : P0 gagne ; manche 2 : P1 gagne → P0 et P1 à 1 point de la fin (P2, P3 spectateurs à 0). */
  const setup = (extra: Record<number, string[]> = {}) => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1), 3: closedWin(4, 0), 4: closedWin(4, 2), ...extra });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    choose(g, 'CLOSED_1');
    const events = round(g, TIMEOUT);
    return { g, events };
  };
  const propose = (g: GameManager, player: string, partner: string, insuranceType: 'LOSER_NOT_PAYING' | 'SPLIT_50_50' = 'SPLIT_50_50') =>
    g.apply({ type: 'PROPOSE_INSURANCE', player, partner, insuranceType });
  const respond = (g: GameManager, player: string, accept: boolean) => g.apply({ type: 'RESPOND_INSURANCE', player, accept });

  it('notification « assurance disponible » aux seuls joueurs à 1 point, quand au moins deux le sont', () => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1) });
    choose(g, 'CLOSED_1');
    const after1 = round(g, TIMEOUT); // seul P0 est à 1 point : pas de partenaire possible
    expect(after1.filter((e) => e.type === 'INSURANCE_AVAILABLE')).toHaveLength(0);
    expect(g.view('P0').insurance).toMatchObject({ eligible: ['P0'], canPropose: false });
    choose(g, 'CLOSED_1');
    const after2 = round(g, TIMEOUT); // P0 et P1 à 1 point
    const notes = after2.filter((e) => e.type === 'INSURANCE_AVAILABLE');
    expect(notes.map((e) => [e.audience, e.visibility, e.data.partners])).toEqual([
      ['P0', 'PLAYER', ['P1']],
      ['P1', 'PLAYER', ['P0']],
    ]);
    expect(g.view('P2').insurance).toMatchObject({ eligible: ['P0', 'P1'], canPropose: true, pending: null, accepted: [] });
  });

  it('proposition → réponse du partenaire seul ; tant qu\'elle est en attente, aucune variante ne peut être choisie', () => {
    const { g } = setup();
    const ev = propose(g, 'P0', 'P1', 'LOSER_NOT_PAYING');
    expect(ev[0]).toMatchObject({ type: 'INSURANCE_PROPOSED', visibility: 'PUBLIC', data: { proposer: 'P0', partner: 'P1', type: 'LOSER_NOT_PAYING' } });
    expect(g.awaiting()).toEqual(['P1']);
    expect(g.view('P2').insurance).toMatchObject({ pending: { proposer: 'P0', partner: 'P1' }, canPropose: false });
    expect(() => choose(g, 'CLOSED_1')).toThrowError(/en attente/); // le chooser est bloqué
    expect(() => propose(g, 'P1', 'P0')).toThrowError(/Une seule proposition/);
    expect(() => respond(g, 'P0', true)).toThrowError(/Seul P1/); // le proposant ne répond pas à sa place
    expect(() => respond(g, 'P2', true)).toThrowError(RuleError);
    const acc = respond(g, 'P1', true);
    expect(acc[0]).toMatchObject({ type: 'INSURANCE_ACCEPTED', data: { insurance: { players: ['P0', 'P1'], type: 'LOSER_NOT_PAYING' } } });
    expect(g.awaiting()).toEqual(['P2']); // le chooser reprend la main
    expect(g.insurancesAccepted()).toHaveLength(1);
  });

  it('refus explicite : la proposition tombe ; ce duo ne peut plus se reproposer une assurance, dans aucun sens', () => {
    const { g } = setup();
    propose(g, 'P0', 'P1');
    expect(respond(g, 'P1', false)[0]).toMatchObject({ type: 'INSURANCE_DECLINED' });
    expect(g.pendingInsurance()).toBeNull();
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/déjà refusé une assurance entre eux/);
    expect(() => propose(g, 'P1', 'P0')).toThrowError(/déjà refusé une assurance entre eux/); // même duo, sens inverse
    expect(g.insurancesAccepted()).toHaveLength(0);
    expect(g.awaiting()).toEqual(['P2']); // le chooser suivant reprend la main normalement
  });

  it('échéance (silence = refus) : même blocage du duo ; sans proposition en attente, TIMEOUT et réponse échouent', () => {
    const { g } = setup();
    propose(g, 'P0', 'P1');
    expect(g.apply({ type: 'INSURANCE_TIMEOUT' })[0]).toMatchObject({ type: 'INSURANCE_EXPIRED' }); // silence = refus
    expect(g.insurancesAccepted()).toHaveLength(0);
    expect(g.awaiting()).toEqual(['P2']);
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/déjà refusé une assurance entre eux/);
    expect(() => propose(g, 'P1', 'P0')).toThrowError(/déjà refusé une assurance entre eux/);
    expect(() => g.apply({ type: 'INSURANCE_TIMEOUT' })).toThrowError(/Aucune proposition/);
    expect(() => respond(g, 'P1', true)).toThrowError(/Aucune proposition/);
  });

  it('refusée : uniquement entre deux manches, uniquement pour des joueurs à 1 point, une seule assurance par partie', () => {
    const early = new GameManager(cfg(4, 2), new SeededRng(1));
    expect(() => propose(early, 'P0', 'P1')).toThrowError(/1 point de la fin/); // personne n'est éligible au départ

    const { g } = setup();
    expect(() => propose(g, 'P0', 'P2')).toThrowError(/P2 n'est pas à 1 point/); // partenaire à 0 point
    expect(() => propose(g, 'P2', 'P0')).toThrowError(/P2 n'est pas à 1 point/); // proposant à 0 point
    expect(() => propose(g, 'P0', 'P0')).toThrowError(/exactement 2/);
    expect(() => propose(g, 'P0', 'P1', 'TROIS' as 'SPLIT_50_50')).toThrowError(/Type d'assurance/);
    propose(g, 'P0', 'P1');
    respond(g, 'P1', true);
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/Une seule assurance/); // verrouillée

    choose(g, 'CLOSED_1'); // P2 choisit : la manche commence
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/qu'entre deux manches/);
    expect(() => respond(g, 'P1', true)).toThrowError(/Aucune proposition/);
  });

  it("l'assurance n'est proposable qu'à partir de 4 joueurs, même avec des joueurs à 1 point de la fin", () => {
    const g = stackedGame(cfg(3, 2), { 1: closedWin(3, 0), 2: closedWin(3, 1) }); // P0 et P1 à 1 point, à 3 joueurs
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    expect(g.view('P2').insurance).toMatchObject({ eligible: [], canPropose: false }); // masquée : table < 4
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/à partir de 4 joueurs/);
  });

  it("le blocage ne concerne QUE le duo refusé : un autre partenaire reste proposable", () => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1), 3: closedWin(4, 2) });
    for (let r = 0; r < 3; r++) {
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    expect(g.view('P0').insurance.eligible.sort()).toEqual(['P0', 'P1', 'P2']); // les 3 premiers gagnants, à 1 point
    propose(g, 'P0', 'P1');
    respond(g, 'P1', false); // P0-P1 refusé : ce duo est bloqué
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/déjà refusé/);
    const acc = propose(g, 'P0', 'P2'); // P0 reste libre avec un autre partenaire éligible
    expect(acc[0]).toMatchObject({ type: 'INSURANCE_PROPOSED', data: { proposer: 'P0', partner: 'P2' } });
    expect(g.view('P1').insurance.blockedPartners).toEqual(['P0']); // P1 est bloqué avec P0, mais pas avec P2
    respond(g, 'P2', true);
    expect(g.insurancesAccepted()).toEqual([{ players: ['P0', 'P2'], type: 'SPLIT_50_50' }]);
  });

  it('blockedPartners : exposé au joueur concerné, propre à lui, conservé après snapshot/restore', () => {
    const { g } = setup();
    propose(g, 'P0', 'P1');
    respond(g, 'P1', false);
    expect(g.view('P0').insurance.blockedPartners).toEqual(['P1']);
    expect(g.view('P1').insurance.blockedPartners).toEqual(['P0']);
    expect(g.view('P2').insurance.blockedPartners).toEqual([]); // non concerné
    const restored = GameManager.restore(g.snapshot(), new SeededRng(9));
    expect(restored.view('P0').insurance.blockedPartners).toEqual(['P1']);
  });

  it('« 50/50 » : le vainqueur assuré partage la cagnotte ; classement = vainqueur + son partenaire', () => {
    const { g } = setup();
    propose(g, 'P0', 'P1', 'SPLIT_50_50');
    respond(g, 'P1', true);
    choose(g, 'CLOSED_1'); // manche 3 (chooser P2) : P0 gagne → 2 points
    round(g, TIMEOUT);
    const out = g.outcome()!;
    expect(out.winner).toBe('P0');
    expect(out.settlement.payouts).toEqual({ P0: 4000, P1: 4000, P2: 0, P3: 0 }); // cagnotte 80 € : 40 € / 40 €
    expect(out.insurance).toEqual({ players: ['P0', 'P1'], type: 'SPLIT_50_50' });
    expect(out.standings.map((s) => [s.player, s.rank])).toEqual([['P0', 1], ['P1', 2]]);
    expect(g.awaiting()).toEqual([]);
    expect(() => propose(g, 'P0', 'P1')).toThrowError(/terminée/);
  });

  it('« Le perdant ne paye pas » : le vainqueur reçoit la cagnotte moins la mise du partenaire, qui la récupère', () => {
    const { g } = setup();
    propose(g, 'P1', 'P0', 'LOSER_NOT_PAYING');
    respond(g, 'P0', true);
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT); // P0 gagne
    expect(g.outcome()!.settlement.payouts).toEqual({ P0: 6000, P1: 2000, P2: 0, P3: 0 }); // 80 € − 20 € ; 20 € rendus
  });

  it('un vainqueur hors de la paire assurée : tout pour lui', () => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1), 3: closedWin(4, 2), 4: closedWin(4, 2) });
    for (let r = 1; r <= 2; r++) {
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    propose(g, 'P0', 'P1', 'LOSER_NOT_PAYING');
    respond(g, 'P1', true);
    choose(g, 'CLOSED_1'); // manche 3 : P2 gagne (1 point)
    round(g, TIMEOUT);
    expect(g.scoreOf('P2')).toBe(1);
    choose(g, 'CLOSED_1'); // manche 4 : P2 gagne (2 points)
    round(g, TIMEOUT);
    const out = g.outcome()!;
    expect(out.winner).toBe('P2');
    expect(out.settlement.payouts).toEqual({ P0: 0, P1: 0, P2: 8000, P3: 0 });
    expect(out.insurance).toBeNull();
    expect(out.standings.map((s) => s.player)).toEqual(['P2']);
  });

  it('une proposition encore en attente à la fin de partie devient caduque ; snapshot/restore conserve proposition et assurance', () => {
    const { g } = setup();
    propose(g, 'P0', 'P1');
    const mid = GameManager.restore(g.snapshot(), new SeededRng(3), { stackedDeck: (r) => ({ 3: closedWin(4, 0) } as Record<number, string[]>)[r] });
    expect(mid.pendingInsurance()).toEqual(g.pendingInsurance());
    expect(mid.view('P2').insurance).toEqual(g.view('P2').insurance);
    respond(mid, 'P1', true);
    const locked = GameManager.restore(mid.snapshot(), new SeededRng(4), { stackedDeck: (r) => ({ 3: closedWin(4, 0) } as Record<number, string[]>)[r] });
    expect(locked.insurancesAccepted()).toEqual([{ players: ['P0', 'P1'], type: 'SPLIT_50_50' }]);
    choose(locked, 'CLOSED_1');
    round(locked, TIMEOUT);
    expect(locked.outcome()!.settlement.payouts).toEqual({ P0: 4000, P1: 4000, P2: 0, P3: 0 });
  });
});

describe('expiration du choix de variante (30 s) et clés de minuteur', () => {
  it('TIMEOUT au choix de variante : une variante disponible est tirée au hasard, au nom du chooser', () => {
    const g = new GameManager(cfg(3, 5), new SeededRng(11));
    const ev = g.apply({ type: 'TIMEOUT' });
    expect(ev[0]).toMatchObject({ type: 'VARIANT_CHOSEN', visibility: 'PUBLIC', data: { roundNo: 1, chooser: 'P0', auto: true } });
    expect(g.phase()).toBe('ROUND');
    expect(VARIANT_IDS).toContain(g.currentRound!.variant);
  });

  it('jamais une variante indisponible (Fermé 2 à 6 joueurs) ; toutes les variantes disponibles peuvent sortir', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const g = new GameManager(cfg(6, 5), new SeededRng(seed));
      g.apply({ type: 'TIMEOUT' });
      seen.add(g.currentRound!.variant);
    }
    expect(seen.has('CLOSED_2')).toBe(false);
    expect([...seen].sort()).toEqual(VARIANT_IDS.filter((v) => v !== 'CLOSED_2' && v !== 'LE10').sort());
  });

  it('TIMEOUT en manche : les défauts de la phase s\'appliquent ; avec une proposition en attente : elle expire d\'abord', () => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1), 3: closedWin(4, 0) });
    choose(g, 'CLOSED_1');
    g.apply({ type: 'TIMEOUT' }); // manche : 0 change pour tous → P0 gagne
    expect(g.scoreOf('P0')).toBe(1);
    choose(g, 'CLOSED_1');
    g.apply({ type: 'TIMEOUT' }); // P1 gagne
    g.apply({ type: 'PROPOSE_INSURANCE', player: 'P0', partner: 'P1', insuranceType: 'SPLIT_50_50' });
    expect(g.apply({ type: 'TIMEOUT' })[0]).toMatchObject({ type: 'INSURANCE_EXPIRED' }); // silence = refus, pas de variante
    expect(g.phase()).toBe('VARIANT_SELECTION');
    expect(g.apply({ type: 'TIMEOUT' })[0]).toMatchObject({ type: 'VARIANT_CHOSEN', data: { auto: true, chooser: 'P2' } });
  });

  it('la clé de minuteur change à chaque nouvelle phase, y compris quand le même joueur revient (6-1)', () => {
    const g = new GameManager(cfg(3, 5), new SeededRng(5));
    expect(g.timer()).toEqual({ kind: 'VARIANT', key: 'SEL:1:P0' });
    choose(g, 'V6_1');
    const keys = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const t = g.timer()!;
      expect(t.kind).toBe('ROUND');
      keys.add(t.key);
      round(g, { type: 'REVEAL', player: g.awaiting()[0]! });
    }
    expect(keys.size).toBe(15); // 15 retournements = 15 phases de 30 s distinctes
    expect(g.timer()).toEqual({ kind: 'VARIANT', key: 'SEL:2:P1' });
  });

  it('la clé d\'une proposition d\'assurance en attente, et les avertissements à 10 s', () => {
    const { g } = (() => {
      const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1) });
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
      return { g };
    })();
    g.apply({ type: 'PROPOSE_INSURANCE', player: 'P0', partner: 'P1', insuranceType: 'SPLIT_50_50' });
    expect(g.timer()).toEqual({ kind: 'INSURANCE', key: 'INS:3:P0>P1' });
    g.apply({ type: 'INSURANCE_TIMEOUT' });
    expect(g.timer()).toEqual({ kind: 'VARIANT', key: 'SEL:3:P2' }); // le minuteur du chooser repart
    const w = stackedGame(cfg(3, 5), { 1: stack63(['7c', '2s', 'Kh']) });
    choose(w, 'V6_3');
    round(w, { type: 'SELECT', player: 'P0', cards: ['As'] });
    expect(w.warnings()).toEqual(['P0']);
    expect(w.view('P0').warnings).toEqual(['P0']);
  });
});

describe('arrivée d\'un joueur en cours de partie', () => {
  it('uniquement entre deux manches : dernière position, 0 point, même mise ajoutée à la cagnotte', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0) });
    const ev = g.apply({ type: 'ADD_PLAYER', player: 'J1' });
    expect(ev[0]).toMatchObject({ type: 'PLAYER_ADDED', visibility: 'PUBLIC', data: { player: 'J1', position: 'UTG+3', potChips: 8000 } });
    expect(g.players()).toEqual(['P0', 'P1', 'P2', 'J1']);
    expect(g.view(null).players.at(-1)).toEqual({ player: 'J1', position: 'UTG+3', score: 0, excluded: false });
    expect(g.view(null).potChips).toBe(8000);
    choose(g, 'CLOSED_1');
    expect(() => g.apply({ type: 'ADD_PLAYER', player: 'J2' })).toThrowError(/qu'entre deux manches/);
  });

  it('refusé : doublon, table complète (maximum fixé à la création), partie terminée', () => {
    const g = new GameManager({ ...cfg(3, 1), maxPlayers: 4 }, new SeededRng(1), { stackedDeck: () => closedWin(4, 0) });
    expect(() => g.apply({ type: 'ADD_PLAYER', player: 'P1' })).toThrowError(/déjà à la table/);
    g.apply({ type: 'ADD_PLAYER', player: 'J1' });
    const before = JSON.stringify(g.snapshot());
    expect(() => g.apply({ type: 'ADD_PLAYER', player: 'J2' })).toThrowError(/complète/);
    expect(JSON.stringify(g.snapshot())).toBe(before);
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT); // objectif 1 : P0 gagne
    expect(g.phase()).toBe('GAME_OVER');
    expect(() => g.apply({ type: 'ADD_PLAYER', player: 'J2' })).toThrowError(/terminée/);
  });

  it('la rotation continue dans l\'ordre des positions : le nouvel arrivant choisit quand son tour arrive', () => {
    const g = stackedGame(cfg(3, 5), {
      1: closedWin(3, 0), 2: closedWin(3, 1), 3: closedWin(3, 2),
      4: closedWin(4, 3), 5: closedWin(4, 0), 6: closedWin(4, 1),
    });
    const choosers: string[] = [];
    for (let r = 1; r <= 3; r++) {
      choosers.push(g.chooser());
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    g.apply({ type: 'ADD_PLAYER', player: 'J1' }); // arrive après le choix de P2 (UTG+2) : J1 (UTG+3) suit
    for (let r = 4; r <= 6; r++) {
      choosers.push(g.chooser());
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    expect(choosers).toEqual(['P0', 'P1', 'P2', 'J1', 'P0', 'P1']);
    expect(g.history().map((h) => h.chooser)).toEqual(choosers);
  });

  it('le nouvel arrivant joue et gagne comme les autres ; son historique commence à 0 ; sa mise est dans la cagnotte', () => {
    const g = stackedGame(cfg(3, 1), { 1: closedWin(3, 0), 2: closedWin(4, 3) });
    // objectif 1 : la manche 1 est gagnée par P0 → on prend un objectif de 2 pour continuer
    const h = stackedGame(cfg(3, 2), { 1: closedWin(3, 0), 2: closedWin(4, 3), 3: closedWin(4, 3) });
    choose(h, 'CLOSED_1');
    round(h, TIMEOUT);
    h.apply({ type: 'ADD_PLAYER', player: 'J1' });
    choose(h, 'CLOSED_1'); // manche 2 : chooser P1
    round(h, TIMEOUT); // J1 gagne 1 point
    expect(h.scoreOf('J1')).toBe(1);
    expect(h.view(null).evolution.J1).toEqual([0, 1]); // 0 avant son arrivée
    choose(h, 'CLOSED_1');
    round(h, TIMEOUT); // manche 3 : J1 atteint 2
    expect(h.outcome()!.winner).toBe('J1');
    expect(h.outcome()!.settlement).toMatchObject({ potChips: 8000, payouts: { P0: 0, P1: 0, P2: 0, J1: 8000 } });
    void g;
  });

  it('la taille de table change les règles : Fermé 2 devient indisponible à 6 joueurs', () => {
    const g = new GameManager({ ...cfg(5, 5), maxPlayers: 6 }, new SeededRng(2));
    expect(g.availableVariants()).toContain('CLOSED_2');
    g.apply({ type: 'ADD_PLAYER', player: 'J1' });
    expect(g.availableVariants()).not.toContain('CLOSED_2');
    expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'CLOSED_2' })).toThrowError(/pas jouable/);
  });

  it('snapshot / restore conserve l\'arrivée : joueurs, positions, rotation', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0), 2: closedWin(4, 1) });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    g.apply({ type: 'ADD_PLAYER', player: 'J1' });
    const r = GameManager.restore(g.snapshot(), new SeededRng(1), { stackedDeck: (n) => ({ 2: closedWin(4, 1) } as Record<number, string[]>)[n] });
    expect(r.players()).toEqual(['P0', 'P1', 'P2', 'J1']);
    expect(r.chooser()).toBe('P1');
    expect(r.view('P0')).toEqual(g.view('P0'));
  });
});

describe('exclusion par l\'hôte : le joueur garde son siège en absent permanent', () => {
  const excl = (g: GameManager, player: string) => g.apply({ type: 'EXCLUDE_PLAYER', player });

  it('siège, mise et points conservés, statut visible de tous', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 1) });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT); // P1 gagne 1 point
    const ev = excl(g, 'P1');
    expect(ev[0]).toMatchObject({ type: 'PLAYER_EXCLUDED', data: { player: 'P1' } });
    expect(g.players()).toEqual(['P0', 'P1', 'P2']);
    expect(g.scoreOf('P1')).toBe(1);
    expect(g.view(null).players.find((p) => p.player === 'P1')).toMatchObject({ excluded: true, score: 1 });
    expect(g.view(null).potChips).toBe(6000); // sa mise reste dans la cagnotte
    expect(g.excludedPlayers()).toEqual(['P1']);
    expect(() => excl(g, 'P1')).toThrowError(/déjà exclu/);
    expect(() => excl(g, 'X')).toThrowError(/inconnu/);
  });

  it('un joueur exclu ne peut plus agir : toutes ses commandes sont refusées, sans effet sur l\'état', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0) });
    excl(g, 'P2');
    choose(g, 'CLOSED_1');
    const before = JSON.stringify(g.snapshot());
    const forbidden: RoundCommand[] = [
      { type: 'SELECT', player: 'P2', cards: [] },
      { type: 'VALIDATE', player: 'P2' },
    ];
    for (const command of forbidden) {
      let code = '';
      try {
        round(g, command);
      } catch (e) {
        code = (e as RuleError).code;
      }
      expect(code).toBe('EXCLUDED');
    }
    expect(JSON.stringify(g.snapshot())).toBe(before);
    // les joueurs présents ne sont pas gênés
    round(g, { type: 'VALIDATE', player: 'P0' });
  });

  it('un chooser exclu : une variante est tirée immédiatement, sans attendre 30 s', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0) });
    choose(g, 'CLOSED_1');
    round(g, TIMEOUT);
    expect(g.chooser()).toBe('P1');
    const ev = excl(g, 'P1');
    expect(ev.map((e) => e.type)).toEqual(['PLAYER_EXCLUDED', 'VARIANT_CHOSEN']);
    expect(ev[1]).toMatchObject({ data: { chooser: 'P1', auto: true } });
    expect(g.phase()).toBe('ROUND');
    expect(g.awaiting()).not.toContain('P1');
  });

  it('Fermé : la phase se clôt dès que les joueurs présents ont validé (0 change pour l\'exclu)', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0) });
    choose(g, 'CLOSED_1');
    round(g, { type: 'VALIDATE', player: 'P0' });
    round(g, { type: 'VALIDATE', player: 'P1' });
    expect(g.phase()).toBe('ROUND');
    const ev = excl(g, 'P2'); // seul P2 était attendu : résolu instantanément
    expect(ev.map((e) => e.type)).toContain('SHOWDOWN');
    expect(g.phase()).toBe('VARIANT_SELECTION');
    expect(g.history()[0]!.award).toMatchObject({ kind: 'POINTS', winner: 'P0', points: 1 });
  });

  it('exclu avant la manche : les joueurs présents jouent sans jamais attendre l\'absent', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 0) });
    excl(g, 'P2');
    choose(g, 'CLOSED_1');
    round(g, { type: 'VALIDATE', player: 'P0' });
    const ev = round(g, { type: 'VALIDATE', player: 'P1' }); // le dernier présent valide : tout se résout
    expect(ev.map((e) => e.type)).toContain('ROUND_SCORED');
    expect(g.scoreOf('P0')).toBe(1);
  });

  it('Aviation : la main de l\'exclu est foldée immédiatement, sans minuteur', () => {
    const hands = [
      ['As', 'Ad', '2c', '3d'],
      ['Ks', 'Kd', '4c', '5d'],
      ['7s', '8d', '9c', 'Th'],
    ];
    const g = stackedGame(cfg(3, 5), { 1: dealStack(hands, ['Ah', '9s', 'Js', '3c', '2h']) });
    excl(g, 'P2');
    choose(g, 'AVIATION');
    round(g, { type: 'SELECT', player: 'P0', cards: ['2c'] });
    round(g, { type: 'VALIDATE', player: 'P0' });
    round(g, { type: 'SELECT', player: 'P1', cards: ['4c'] });
    const ev = round(g, { type: 'VALIDATE', player: 'P1' });
    expect(ev.filter((e) => e.type === 'PLAYER_FOLDED').map((e) => e.data.player)).toEqual(['P2']);
    expect(g.currentRound!.phase()).toBe('DISCARD_2');
    expect(g.awaiting()).toEqual(['P0', 'P1']);
  });

  it('6-1 : les retournements du joueur exclu sont automatiques ; la manche va au bout avec les seuls présents', () => {
    const g = new GameManager(cfg(3, 5), new SeededRng(21));
    excl(g, 'P1');
    choose(g, 'V6_1');
    let guard = 0;
    while (g.history().length === 0) {
      if (++guard > 40) throw new Error('boucle');
      expect(g.awaiting()).not.toContain('P1');
      round(g, { type: 'REVEAL', player: g.awaiting()[0]! });
    }
    expect(g.history()).toHaveLength(1);
    expect(g.history()[0]!.variant).toBe('V6_1');
    expect(guard).toBeLessThan(15); // les retournements de P1 (5) ont été faits automatiquement
    // la manche suivante est choisie par P1 (exclu) : variante tirée d'office, la partie continue
    expect(g.phase()).toBe('ROUND');
    expect(g.chooser()).toBe('P1');
  });

  it('on ne peut pas exclure le dernier joueur présent', () => {
    const g = new GameManager(cfg(3, 5), new SeededRng(3));
    excl(g, 'P1');
    excl(g, 'P2');
    expect(() => excl(g, 'P0')).toThrowError(/Au moins un joueur/);
  });

  it('assurance : proposition en attente vers un exclu → refusée d\'office ; un exclu ne peut ni proposer ni être proposé', () => {
    const g = stackedGame(cfg(4, 2), { 1: closedWin(4, 0), 2: closedWin(4, 1) });
    for (let r = 1; r <= 2; r++) {
      choose(g, 'CLOSED_1');
      round(g, TIMEOUT);
    }
    g.apply({ type: 'PROPOSE_INSURANCE', player: 'P0', partner: 'P1', insuranceType: 'SPLIT_50_50' });
    const ev = excl(g, 'P1');
    expect(ev.map((e) => e.type)).toEqual(['PLAYER_EXCLUDED', 'INSURANCE_EXPIRED']);
    expect(g.pendingInsurance()).toBeNull();
    expect(() => g.apply({ type: 'PROPOSE_INSURANCE', player: 'P0', partner: 'P1', insuranceType: 'SPLIT_50_50' })).toThrowError(/exclu/);
    expect(g.view(null).insurance.eligible).toEqual(['P0']);
  });

  it('règlement : la mise et les points de l\'exclu restent dans le jeu ; le vainqueur récupère toute la cagnotte', () => {
    const g = stackedGame(cfg(3, 1), { 1: closedWin(3, 0) });
    excl(g, 'P2');
    choose(g, 'CLOSED_1');
    round(g, { type: 'VALIDATE', player: 'P0' });
    round(g, { type: 'VALIDATE', player: 'P1' });
    expect(g.outcome()!.settlement).toEqual({ potChips: 6000, payouts: { P0: 6000, P1: 0, P2: 0 }, applied: null });
  });
});

describe('simulation : arrivées et exclusions aléatoires en cours de partie', () => {
  it('chaque partie se termine ; l\'exclu n\'est jamais attendu ; la cagnotte est répartie sans centime perdu', () => {
    let joined = 0;
    let excluded = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const n0 = 2 + (seed % 3);
      const g = new GameManager({ players: names(n0), targetPoints: 3, stakeChips: 700, maxPlayers: 6 }, new SeededRng(seed * 3 + 1));
      const bot = new SeededRng(seed);
      let steps = 0;
      let extra = 0;
      while (g.phase() !== 'GAME_OVER') {
        if (++steps > 20000) throw new Error(`partie interminable (seed ${seed})`);
        const before = JSON.stringify(g.snapshot());
        try {
          const roll = bot.int(14);
          if (roll === 0 && g.phase() === 'VARIANT_SELECTION') {
            g.apply({ type: 'ADD_PLAYER', player: `J${++extra}` });
            joined++;
          } else if (roll === 1) {
            const cand = g.players();
            g.apply({ type: 'EXCLUDE_PLAYER', player: cand[bot.int(cand.length)]! });
            excluded++;
          } else if (g.phase() === 'VARIANT_SELECTION') {
            if (g.view(null).insurance.pending) g.apply({ type: 'TIMEOUT' });
            else g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: VARIANT_IDS[bot.int(6)]! });
          } else if (bot.int(6) === 0) {
            g.apply({ type: 'TIMEOUT' });
          } else {
            g.apply({ type: 'ROUND', command: randomCommand(g.currentRound!, bot) });
          }
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
          expect(JSON.stringify(g.snapshot()), 'une commande refusée a modifié l\'état').toBe(before);
        }
        for (const p of g.awaiting()) expect(g.excludedPlayers(), `${p} est exclu mais attendu`).not.toContain(p);
        // jamais de blocage : tant que la partie continue, au moins un joueur PRÉSENT est attendu
        if (g.phase() !== 'GAME_OVER') expect(g.awaiting().length, `partie bloquée (seed ${seed}, ${g.phase()})`).toBeGreaterThan(0);
      }
      const out = g.outcome()!;
      const total = g.players().length;
      expect(total).toBe(n0 + extra);
      expect(Object.values(out.settlement.payouts).reduce((a, b) => a + b, 0)).toBe(700 * total);
      expect(Object.keys(out.settlement.payouts)).toEqual(g.players());
    }
    expect(joined).toBeGreaterThan(5);
    expect(excluded).toBeGreaterThan(5);
  });
});

describe('vues, persistance', () => {
  it('la vue d\'un joueur ne contient jamais les cartes cachées des autres ; historique et scores publics', () => {
    const g = stackedGame(cfg(3, 5), { 1: closedWin(3, 1) });
    choose(g, 'CLOSED_1');
    const v = g.view('P0');
    expect(v.round!.cards.hands.P1).toMatchObject({ kind: 'opponent', shown: [], hiddenCount: 5 });
    expect(JSON.stringify(v)).not.toContain('"As"');
    expect(g.view(null).round!.cards.hands.P0).toMatchObject({ kind: 'opponent' });
    expect(g.view('P0').round).toEqual(g.currentRound!.view('P0'));
  });

  it('snapshot / restore en cours de manche et entre deux manches : mêmes vues, même issue', () => {
    const stacks = { 1: closedWin(3, 1), 2: stack63(['7c', '2s', 'Kh']) };
    const make = () => stackedGame(cfg(3, 3), stacks);
    const ref = make();
    choose(ref, 'CLOSED_1');
    round(ref, TIMEOUT);
    choose(ref, 'V6_3');
    lines63(ref, [{ P0: ['As', 'Ad'] }]);

    const g = make();
    choose(g, 'CLOSED_1');
    // coupure entre le choix et la fin de manche
    const mid = GameManager.restore(JSON.parse(JSON.stringify(g.snapshot())), new SeededRng(9), { stackedDeck: (r) => stacks[r as 1 | 2] });
    for (const v of ['P0', 'P1', 'P2', null]) expect(mid.view(v)).toEqual(g.view(v));
    round(mid, TIMEOUT);
    // coupure entre deux manches
    const between = GameManager.restore(mid.snapshot(), new SeededRng(9), { stackedDeck: (r) => stacks[r as 1 | 2] });
    expect(between.phase()).toBe('VARIANT_SELECTION');
    expect(between.chooser()).toBe('P1');
    choose(between, 'V6_3');
    lines63(between, [{ P0: ['As', 'Ad'] }]);
    // même état joué (mains, plateau, lignes, scores, historique) ; seule la queue non truquée du paquet,
    // mélangée avec un autre générateur après la coupure, peut différer : elle n'a jamais été tirée
    const played = (g: GameManager) => {
      const snap = g.snapshot();
      return JSON.stringify({ ...snap, round: snap.round && { ...snap.round, cards: { ...snap.round.cards, deck: [] } } });
    };
    expect(played(between)).toBe(played(ref));
    for (const v of ['P0', 'P1', 'P2', null]) expect(between.view(v)).toEqual(ref.view(v));
  });
});

describe('simulation : parties complètes aléatoires (2 à 6 joueurs)', () => {
  it('chaque partie se termine ; rotation, scores et victoire cohérents', () => {
    let games = 0;
    let acceptances = 0;
    const victories: Record<string, number> = {};
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 12; seed++) {
        const config: GameConfig = { players: assignPositions(names(n), new SeededRng(seed)).order, targetPoints: 3, stakeChips: 1000 };
        const g = new GameManager(config, new SeededRng(seed * 13 + n));
        const bot = new SeededRng(seed * 7 + n);
        let steps = 0;
        while (g.phase() !== 'GAME_OVER') {
          if (++steps > 20000) throw new Error(`partie interminable (n=${n}, seed=${seed})`);
          if (g.phase() === 'VARIANT_SELECTION') {
            const ins = g.view(null).insurance;
            if (ins.pending) {
              // le chooser est bloqué tant que la proposition n'a pas de réponse
              const before = JSON.stringify(g.snapshot());
              expect(() => g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant: 'V6_3' })).toThrowError(RuleError);
              expect(JSON.stringify(g.snapshot())).toBe(before);
              const k = bot.int(3);
              g.apply(k === 0 ? { type: 'INSURANCE_TIMEOUT' } : { type: 'RESPOND_INSURANCE', player: ins.pending.partner, accept: k === 1 });
              if (k === 1) {
                acceptances++;
                for (const p of g.insurancesAccepted().at(-1)!.players) expect(g.scoreOf(p)).toBe(3 - 1); // à 1 point de la fin
              }
              continue;
            }
            if (bot.int(3) === 0) {
              const pool = ins.canPropose && bot.int(4) > 0 ? ins.eligible : config.players; // souvent valide, parfois hors règles
              const a = pool[bot.int(pool.length)]!;
              const b = pool[bot.int(pool.length)]!;
              const before = JSON.stringify(g.snapshot());
              try {
                g.apply({ type: 'PROPOSE_INSURANCE', player: a, partner: b, insuranceType: bot.int(2) === 0 ? 'SPLIT_50_50' : 'LOSER_NOT_PAYING' });
              } catch (e) {
                if (!(e instanceof RuleError)) throw e;
                expect(JSON.stringify(g.snapshot())).toBe(before);
              }
              continue;
            }
            const variant = VARIANT_IDS[bot.int(VARIANT_IDS.length)]!;
            const before = JSON.stringify(g.snapshot());
            try {
              g.apply({ type: 'CHOOSE_VARIANT', player: g.chooser(), variant });
            } catch (e) {
              if (!(e instanceof RuleError)) throw e;
              expect(['CLOSED_2', 'LE10']).toContain(variant); // seuls refus possibles : Fermé 2 et Le 10 à 6 joueurs
              expect(n).toBe(6);
              expect(JSON.stringify(g.snapshot())).toBe(before);
            }
          } else {
            const before = JSON.stringify(g.snapshot());
            try {
              g.apply({ type: 'ROUND', command: randomCommand(g.currentRound!, bot) });
            } catch (e) {
              if (!(e instanceof RuleError)) throw e;
              expect(JSON.stringify(g.snapshot())).toBe(before);
            }
          }
        }
        games++;
        const out = g.outcome()!;
        victories[out.victoryType] = (victories[out.victoryType] ?? 0) + 1;
        const history = g.history();
        // rotation stricte, manche après manche, y compris les manches sans gagnant
        history.forEach((h, i) => {
          expect(h.roundNo).toBe(i + 1);
          expect(h.chooser).toBe(config.players[i % n]);
          expect(Object.values(h.points).filter((x) => x > 0).length).toBeLessThanOrEqual(1);
        });
        // les scores sont exactement la somme des points marqués
        for (const p of config.players) {
          expect(g.scoreOf(p)).toBe(history.reduce((s, h) => s + h.points[p]!, 0));
        }
        if (out.victoryType === 'SCORE') {
          expect(g.scoreOf(out.winner)).toBeGreaterThanOrEqual(3);
          for (const p of config.players.filter((x) => x !== out.winner)) expect(g.scoreOf(p)).toBeLessThan(3);
        } else {
          expect(history.at(-1)!.variant).toBe('V6_3');
          expect(history.at(-1)!.award.kind).toBe('INSTANT_VICTORY');
        }
        expect(out.standings[0]!.player).toBe(out.winner);
        // règlement : la cagnotte est répartie à l'euro près, sans centime perdu ni négatif
        expect(Object.values(out.settlement.payouts).reduce((x, y) => x + y, 0)).toBe(1000 * n);
        expect(out.settlement.potChips).toBe(1000 * n);
        expect(g.insurancesAccepted().length).toBeLessThanOrEqual(1); // une seule assurance par partie
        const ins = g.insurancesAccepted()[0];
        if (ins && ins.players.includes(out.winner)) {
          const partner = ins.players.find((x) => x !== out.winner)!;
          expect(out.insurance).toEqual(ins);
          expect(out.standings.map((x) => x.player)).toEqual([out.winner, partner]);
          expect(out.settlement.payouts[partner]).toBeGreaterThan(-1);
        } else {
          expect(out.insurance).toBeNull();
          expect(out.standings.map((x) => x.player)).toEqual([out.winner]); // vainqueur non assuré : seul, il récupère tout
          expect(out.settlement.payouts[out.winner]).toBe(1000 * n);
        }
        // 6-3 ne se termine jamais sur un Hold'em de départage à moins de 4 joueurs
        for (const h of history) if (h.variant === 'V6_3' && h.result.kind === 'TIE') expect(n).toBeGreaterThanOrEqual(4);
      }
    }
    expect(games).toBe(60);
    expect(victories.SCORE).toBeGreaterThan(0);
    expect(acceptances).toBeGreaterThan(0); // l'assurance est bien exercée par les parties aléatoires
  });
});
