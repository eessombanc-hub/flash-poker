import { CATEGORY_LABELS_FR, VARIANT_IDS, VARIANT_LABELS } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { isCardCode, parseCode, sortHand } from '../src/lib/cards';
import { dealDelay } from '../src/components/Card';
const cardName = (c: string) => parseCode(c).name;
import { CATEGORY_LABELS, INSURANCE_LABELS, NEXT_REASON_TEXT, VARIANTS, winningCards, winningCombination } from '../src/lib/labels';
import { clockText, deNom, formatEuros, formatLinePoints, formatSignedEuros, initials } from '../src/lib/format';
import { describeInsurance } from '../src/lib/insurance';
import { describeEvent } from '../src/lib/events';
import { LocalSessionStore, MemorySessionStore } from '../src/lib/session';
import { initialState, reduceUpdate } from '../src/lib/client';
import { assistCategory, closedInfo, discardInfo, line63Info, reveal61Info } from '../src/lib/roundInfo';
import { collectRoundEvents, finalBoard } from '../src/screens/Overlays';
import { normalizeCode } from '../src/screens/Forms';
import { orderFromMe } from '../src/screens/Table';
import { game, roomView, round } from './fixtures';
import type { FeedItem } from '../src/lib/client';
import type { RoundEvent, RoundRecord, UpdateMessage } from '../src/lib/types';

const flat = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('cartes', () => {
  it('lit les codes et nomme les cartes en français', () => {
    expect(cardName('As')).toBe('As de pique');
    expect(cardName('Kh')).toBe('Roi de cœur');
    expect(cardName('Td')).toBe('10 de carreau');
    expect(parseCode('2c')).toMatchObject({ rank: 2, suit: 'c', label: '2' });
    expect(parseCode('Ad').rank).toBe(14);
  });
  it('rejette les codes invalides', () => {
    for (const bad of ['', 'A', 'Ax', '1c', 'Asd', 'as']) expect(isCardCode(bad)).toBe(false);
    expect(() => parseCode('Zz')).toThrow();
  });
  it('tri neutre : rang décroissant puis couleur, sans modifier l’entrée', () => {
    const hand = ['2c', 'Ah', 'Kd', 'As', '9c'];
    expect(sortHand(hand)).toEqual(['As', 'Ah', 'Kd', '9c', '2c']);
    expect(hand[0]).toBe('2c');
  });
});

describe('formats', () => {
  it('euros en centimes', () => {
    expect(flat(formatEuros(2000))).toBe('20 €');
    expect(flat(formatEuros(1250))).toBe('12,50 €');
    expect(flat(formatEuros(1205))).toBe('12,05 €');
    expect(flat(formatEuros(5))).toBe('0,05 €');
    expect(flat(formatEuros(0))).toBe('0 €');
    expect(flat(formatSignedEuros(-1000))).toBe('−10 €');
    expect(flat(formatSignedEuros(500))).toBe('+5 €');
  });
  it('points de ligne du 6-3 en fractions', () => {
    expect(['60', '30', '20', '15', '12', '10'].map((u) => formatLinePoints(Number(u)))).toEqual(['1', '½', '⅓', '¼', '⅕', '⅙']);
    expect(formatLinePoints(90)).toBe('1,50');
  });
  it('initiales et horloge', () => {
    expect(initials('Emeric')).toBe('EM');
    expect(initials('Jean-Paul Dupont')).toBe('JP');
    expect(clockText(29.2)).toBe('0:30');
    expect(clockText(-3)).toBe('0:00');
    expect(clockText(75)).toBe('1:15');
  });
});

describe('élision française', () => {
  it('« de » devant une voyelle ou un h muet, sinon « de »', () => {
    expect(['Emeric', 'Alice', 'Hugo', 'Élodie', 'Bob', 'Marc'].map(deNom)).toEqual(['d’Emeric', 'd’Alice', 'd’Hugo', 'd’Élodie', 'de Bob', 'de Marc']);
  });
});

describe('cohérence avec le moteur (mêmes libellés, mêmes identifiants)', () => {
  it('variantes', () => {
    expect(VARIANTS.map((v) => v.id).sort()).toEqual([...VARIANT_IDS].sort());
    for (const v of VARIANTS) expect(v.name).toBe(VARIANT_LABELS[v.id]);
  });
  it('catégories de mains', () => {
    expect([...CATEGORY_LABELS]).toEqual(Object.values(CATEGORY_LABELS_FR));
  });
  it('raisons d’ordre du 6-1 et formules d’assurance', () => {
    expect(Object.keys(NEXT_REASON_TEXT).sort()).toEqual(['LOWEST_SIXTH_CARD', 'TIE_LAST_REVEALER', 'TIE_POSITION', 'WEAKEST']);
    expect(Object.keys(INSURANCE_LABELS).sort()).toEqual(['LOSER_NOT_PAYING', 'SPLIT_50_50']);
  });
});

describe('assurance : texte chiffré', () => {
  it('« le perdant ne paye pas » : cagnotte moins la mise du partenaire', () => {
    const t = flat(describeInsurance('LOSER_NOT_PAYING', 6000, 2000));
    expect(t).toContain('40 €');
    expect(t).toContain('20 €');
  });
  it('50 / 50 : moitié chacun, centime impair au vainqueur', () => {
    expect(flat(describeInsurance('SPLIT_50_50', 6000, 2000))).toContain('30 € chacun');
    expect(flat(describeInsurance('SPLIT_50_50', 6001, 2000))).toContain('centime impair');
  });
});

describe('annonces', () => {
  const view = roomView({}, game());
  const ev = (type: string, data: Record<string, unknown>, visibility: 'PUBLIC' | 'PLAYER' = 'PUBLIC'): RoundEvent => ({ type, visibility, data });
  it('variante choisie, tirée au hasard ou non', () => {
    expect(describeEvent(ev('VARIANT_CHOSEN', { variant: 'V6_3', chooser: 'p2' }), view)?.text).toBe('Variante choisie : 6-3 par Alice');
    expect(describeEvent(ev('VARIANT_CHOSEN', { variant: 'AVIATION', chooser: 'p2', auto: true }), view)?.text).toContain('tirée au hasard');
  });
  it('ligne du 6-3 : gagnant seul, partagé, personne', () => {
    expect(describeEvent(ev('LINE_RESOLVED', { line: 1, winners: ['p2'], unitsEach: 60 }), view)?.text).toBe('Ligne 1 : Alice l’emporte (1 point de ligne)');
    expect(describeEvent(ev('LINE_RESOLVED', { line: 2, winners: ['p2', 'p3'], unitsEach: 30 }), view)?.text).toBe('Ligne 2 : Alice et Bob se partagent (½ point de ligne chacun)');
    expect(describeEvent(ev('LINE_RESOLVED', { line: 3, winners: [], unitsEach: 0 }), view)?.tone).toBe('warning');
  });
  it('6-1 : nouvel ordre avec sa raison', () => {
    expect(describeEvent(ev('REVEAL_ORDER_RECOMPUTED', { next: 'p3', reason: 'TIE_POSITION' }), view)?.text).toBe('Nouvel ordre : Bob doit révéler (égalité : ordre des positions)');
  });
  it('événements sans annonce : rien', () => {
    expect(describeEvent(ev('CHANGE_APPLIED', { received: ['As'] }, 'PLAYER'), view)).toBeNull();
    expect(describeEvent(ev('BOARD_REVEALED', { slot: 3, card: 'Ah' }), view)).toBeNull();
  });
});

describe('session locale', () => {
  const s = { code: 'POKER-ABCD', token: 'tok', playerId: 'p1', nickname: 'Emeric' };
  it('enregistre, relit et efface', () => {
    const mem = new Map<string, string>();
    const store = new LocalSessionStore('k', { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    expect(store.load()).toBeNull();
    store.save(s);
    expect(store.load()).toEqual(s);
    store.clear();
    expect(store.load()).toBeNull();
  });
  it('ignore un contenu corrompu ou incomplet', () => {
    for (const raw of ['{', 'null', '{"code":"x"}', '42']) {
      const store = new LocalSessionStore('k', { getItem: () => raw, setItem() {}, removeItem() {} });
      expect(store.load()).toBeNull();
    }
  });
  it('stockage indisponible : aucune exception', () => {
    const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const store = new LocalSessionStore('k', boom);
    expect(() => { store.save(s); store.clear(); }).not.toThrow();
    expect(store.load()).toBeNull();
    expect(new MemorySessionStore().load()).toBeNull();
  });
});

describe('reduceUpdate : application des mises à jour serveur', () => {
  const session = { code: 'POKER-ABCD', token: 't', playerId: 'p1', nickname: 'E' };
  const msg = (version: number, over: Partial<UpdateMessage> = {}, serverTime = 10_000): UpdateMessage => ({
    type: 'update',
    roomCode: 'POKER-ABCD',
    version,
    view: roomView({ version, serverTime }),
    events: [{ type: 'X', visibility: 'PUBLIC', data: {} }],
    ...over,
  });
  let n = 0;
  const id = () => ++n;

  it('ignore une autre room et une version périmée', () => {
    const st = { ...initialState(session), version: 7 };
    expect(reduceUpdate(st, msg(8, { roomCode: 'POKER-ZZZZ' }), 0, id)).toBeNull();
    expect(reduceUpdate(st, msg(6), 0, id)).toBeNull();
    expect(reduceUpdate(initialState(null), msg(1), 0, id)).toBeNull();
  });
  it('version suivante : vue remplacée, événements ajoutés, décalage d’horloge mesuré', () => {
    const p = reduceUpdate({ ...initialState(session), version: 4 }, msg(5, {}, 10_000), 4_000, id)!;
    expect(p.version).toBe(5);
    expect(p.serverOffsetMs).toBe(6_000);
    expect(p.feed).toHaveLength(1);
  });
  it('même version (resynchronisation) : vue remplacée sans rejouer les événements', () => {
    const p = reduceUpdate({ ...initialState(session), version: 5 }, msg(5), 0, id)!;
    expect(p.feed).toEqual([]);
    expect(p.view?.version).toBe(5);
  });
  it('trou de version : la vue complète suffit, on accepte', () => {
    const p = reduceUpdate({ ...initialState(session), version: 2 }, msg(9), 0, id)!;
    expect(p.version).toBe(9);
  });
  it('le flux d’événements est borné', () => {
    let st = initialState(session);
    for (let v = 1; v <= 200; v++) st = { ...st, ...reduceUpdate(st, msg(v), 0, id)! };
    expect(st.feed.length).toBe(150);
  });
});

describe('lecture typée des infos de manche', () => {
  it('valeurs par défaut sûres si le serveur n’envoie rien', () => {
    const r = round('CLOSED_1', [], {});
    expect(closedInfo(r)).toEqual({ change: 1, totalChanges: 1, validated: [], yourDraft: [] });
    expect(discardInfo(r)).toMatchObject({ step: 1, discardCount: 1, status: {} });
    expect(line63Info(r)).toMatchObject({ line: 1, lines: [], unitsScale: 60 });
    expect(reveal61Info(r)).toEqual({ next: null, reason: null, reveals: 0, history: [] });
  });
});

describe('assistCategory : lecture défensive de l’indicateur envoyé par le serveur', () => {
  const r = (v: unknown) => round('CLOSED_1', [], v === undefined ? {} : { assistCategory: v });
  it('garde toutes les catégories valides, y compris 0 (carte haute, valeur « fausse » en JavaScript)', () => {
    for (let c = 0; c <= 8; c++) expect(assistCategory(r(c))).toBe(c);
    expect(assistCategory(r(0))).toBe(0);
  });
  it('tout ce qui n’est pas un nombre devient « rien à afficher »', () => {
    for (const bad of [undefined, null, 'Paire', '1', true, {}, []]) expect(assistCategory(r(bad)), String(bad)).toBeNull();
  });
});


describe("dealDelay : distribution en cascade d'une carte selon sa position", () => {
  it('augmente de 60 ms par carte, sans effet, sans réduction de mouvement, ni carte qui se retourne', () => {
    for (let i = 0; i <= 5; i++) expect(dealDelay(i, false, false)).toBeCloseTo(i === 0 ? 0 : i * 0.06, 5);
  });
  it("plafonnée à 12 cartes (une très grande main ne fait pas trop attendre)", () => {
    expect(dealDelay(12, false, false)).toBeCloseTo(12 * 0.06, 5);
    expect(dealDelay(20, false, false)).toBe(dealDelay(12, false, false)); // au-delà : identique au plafond
  });
  it("aucun décalage sans position fournie (élément purement décoratif)", () => {
    expect(dealDelay(undefined, false, false)).toBe(0);
  });
  it('« carte préférée sans animation » (prefers-reduced-motion) : toujours 0, quelle que soit la position', () => {
    expect(dealDelay(5, true, false)).toBe(0);
  });
  it('une carte qui se retourne (flip) ignore la cascade : son propre effet prime', () => {
    expect(dealDelay(5, false, true)).toBe(0);
  });
});

describe('récapitulatif de manche', () => {
  const item = (id: number, type: string, data: Record<string, unknown> = {}): FeedItem => ({ id, version: id, event: { type, visibility: 'PUBLIC', data } });
  it('repart de la variante choisie de la manche', () => {
    const feed = [item(1, 'VARIANT_CHOSEN', { roundNo: 1 }), item(2, 'SHOWDOWN'), item(3, 'ROUND_SCORED'), item(4, 'VARIANT_CHOSEN', { roundNo: 2 }), item(5, 'SHOWDOWN'), item(6, 'ROUND_SCORED')];
    expect(collectRoundEvents(feed, 2).map((e) => e.type)).toEqual(['VARIANT_CHOSEN', 'SHOWDOWN', 'ROUND_SCORED']);
    expect(collectRoundEvents(feed, 1).map((e) => e.type)).toEqual(['VARIANT_CHOSEN', 'SHOWDOWN', 'ROUND_SCORED', 'VARIANT_CHOSEN', 'SHOWDOWN', 'ROUND_SCORED']);
  });
  it('après un rechargement (repère perdu) : événements postérieurs à la manche précédente', () => {
    const feed = [item(1, 'ROUND_SCORED'), item(2, 'CARD_REVEALED'), item(3, 'SHOWDOWN'), item(4, 'ROUND_SCORED')];
    expect(collectRoundEvents(feed, 9).map((e) => e.type)).toEqual(['CARD_REVEALED', 'SHOWDOWN', 'ROUND_SCORED']);
    expect(collectRoundEvents([item(1, 'SHOWDOWN')], 3)).toHaveLength(1);
  });
  it('plateau final : dernier plateau connu + cartes révélées à la clôture', () => {
    const ev = (slot: number, card: string): RoundEvent => ({ type: 'BOARD_REVEALED', visibility: 'PUBLIC', data: { slot, card } });
    expect(finalBoard(['2h', '3h', '4h', 'Ac', null], [ev(4, 'Kd')])).toEqual(['2h', '3h', '4h', 'Ac', 'Kd']);
    expect(finalBoard(['2h'], [])).toEqual(['2h']);
  });
});

describe('saisie et géométrie', () => {
  it('code de partie : casse, espaces et préfixe', () => {
    expect(normalizeCode(' 7k2m ')).toBe('POKER-7K2M');
    expect(normalizeCode('poker-7k2m')).toBe('POKER-7K2M');
    expect(normalizeCode('abc')).toBe('ABC');
  });
  it('sièges : moi d’abord, puis les autres dans l’ordre des positions', () => {
    const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
    for (let n = 2; n <= 6; n++) {
      const players = ps.slice(0, n);
      players.forEach((me, i) => {
        const ordered = orderFromMe(players, me.id);
        expect(ordered[0]).toBe(me);
        expect(ordered).toHaveLength(n);
        expect(ordered[1]).toBe(players[(i + 1) % n]);             // sens horaire
      });
    }
    expect(orderFromMe(ps.slice(0, 3), 'z')).toEqual(ps.slice(0, 3));   // spectateur
  });
});

describe('combinaison gagnante d’une manche', () => {
  const base = { roundNo: 1, chooser: 'p1', variant: 'CLOSED_1', result: { kind: 'WINNER', winner: 'p1', points: 1 }, points: { p1: 1 }, scoresAfter: { p1: 1 } } as const;
  const rec = (over: Partial<RoundRecord>): RoundRecord => ({ ...base, award: { kind: 'POINTS', winner: 'p1', points: 1 }, ...over }) as unknown as RoundRecord;
  it('abattage : catégorie de la main du vainqueur et ses cartes', () => {
    const r = rec({ summary: { hands: { p1: { cards: ['As', 'Ad', 'Ks', 'Kd', '2c'], category: 2 }, p2: { cards: ['Qs', 'Jd', '8c', '5h', '3s'], category: 0 } } } });
    expect(winningCombination(r)).toBe('Double paire');
    expect(winningCards(r)).toEqual(['As', 'Ad', 'Ks', 'Kd', '2c']);
  });
  it('départage, abandon, 6-3, quinte flush immédiate, manche sans vainqueur', () => {
    expect(winningCombination(rec({ summary: { tiebreak: { category: 5, cards: ['2h', '5h', '8h', 'Jh', 'Ah'] } } }))).toBe('Couleur au Hold’em de départage');
    expect(winningCombination(rec({ summary: { byFold: true } }))).toBe('Tous les autres joueurs se sont couchés');
    const lines = [
      { line: 1, designations: { p1: { pair: ['As', 'Ad'], rank: 0, category: 3 } }, winners: ['p1'], unitsEach: 1 },
      { line: 2, designations: { p1: null }, winners: ['p2'], unitsEach: 1 },
      { line: 3, designations: { p1: { pair: ['Ks', 'Kd'], rank: 0, category: 6 } }, winners: ['p1'], unitsEach: 1 },
    ];
    expect(winningCombination(rec({ variant: 'V6_3', summary: { lines } } as never))).toBe('Ligne 1 : Brelan · Ligne 3 : Full');
    expect(winningCombination(rec({ award: { kind: 'INSTANT_VICTORY', winner: 'p1', line: 2 } } as never))).toBe('Quinte flush à la ligne 2');
    expect(winningCombination(rec({ award: { kind: 'NO_POINT', reason: 'ALL_FOLDED' } } as never))).toBeNull();
    expect(winningCombination(rec({}))).toBeNull();        // manche enregistrée avant le résumé
  });
});
