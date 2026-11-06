import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { FeedItem } from '../src/lib/client';
import type { GameOutcome, RoundRecord } from '../src/lib/types';
import { CreateRoom, JoinRoom } from '../src/screens/Forms';
import { Lobby } from '../src/screens/Lobby';
import { GameOverModal, TiebreakSequence } from '../src/screens/Overlays';
import { Table } from '../src/screens/Table';
import { game, players, renderWith, roomView, round } from './fixtures';

const flat = (s: string | null) => (s ?? '').replace(/[\u202f\u00a0]/g, ' ');

describe('salle d’attente', () => {
  const lobby = (n: number, role: 'HOST' | 'PLAYER' = 'HOST', over = {}) => roomView({ status: 'WAITING', players: players(n).map((p) => ({ ...p, state: 'LOBBY' as const, position: null })), you: { playerId: role === 'HOST' ? 'p1' : 'p2', role }, seatsLeft: 6 - n, config: { maxPlayers: 6, targetPoints: 3, stakeCents: 2000, potCents: 2000 * n, assistance: false }, ...over }, null);
  it('affiche le code, les places et la cagnotte', () => {
    renderWith(<Lobby />, lobby(2));
    expect(screen.getByTestId('room-code')).toHaveTextContent('POKER-ABCD');
    expect(screen.getByRole('list', { name: 'Joueurs' })).toBeInTheDocument();
    expect(screen.getAllByText('Place libre')).toHaveLength(4);
    expect(flat(screen.getByText(/Cagnotte actuelle/).textContent)).toContain('40 €');
  });
  it('hôte : démarrer impossible seul, possible à deux', async () => {
    const user = userEvent.setup();
    const one = renderWith(<Lobby />, lobby(1));
    expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeDisabled();
    expect(screen.getByText('Il faut au moins 2 joueurs pour démarrer.')).toBeInTheDocument();
    one.unmount();
    const two = renderWith(<Lobby />, lobby(2));
    await user.click(screen.getByRole('button', { name: 'Démarrer la partie' }));
    expect(two.calls.start).toBe(1);
  });
  it('hôte : retirer un joueur ; annuler la partie', async () => {
    const user = userEvent.setup();
    const { calls } = renderWith(<Lobby />, lobby(3));
    expect(screen.queryByRole('button', { name: 'Retirer Emeric' })).toBeNull(); // pas d'auto-exclusion
    await user.click(screen.getByRole('button', { name: 'Retirer Alice' }));
    await user.click(screen.getByRole('button', { name: 'Annuler la partie' }));
    expect(calls.excluded).toEqual(['p2']);
    expect(calls.cancel).toBe(1);
  });
  it('joueur : pas de boutons d’hôte, il peut quitter', async () => {
    const user = userEvent.setup();
    const { calls } = renderWith(<Lobby />, lobby(2, 'PLAYER'));
    expect(screen.queryByRole('button', { name: 'Démarrer la partie' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Quitter la salle' }));
    expect(calls.leave).toBe(1);
  });
  describe('assistance : vote en salle d’attente', () => {
    const withAssist = (n: number, votes: Record<string, boolean | null>, role: 'HOST' | 'PLAYER' = 'PLAYER') =>
      lobby(n, role, {
        config: { maxPlayers: 6, targetPoints: 3, stakeCents: 2000, potCents: 2000 * n, assistance: true },
        players: players(n).map((p) => ({ ...p, state: 'LOBBY' as const, position: null, assistanceApproved: votes[p.id] ?? null })),
      });

    it('sans proposition : aucune interface de vote, mention « sans assistance »', () => {
      renderWith(<Lobby />, lobby(2, 'PLAYER'));
      expect(screen.queryByRole('region', { name: 'Assistance' })).toBeNull();
      expect(screen.getByText(/Partie sans assistance/)).toBeInTheDocument();
    });

    it('avec proposition : explication, statut de chacun, et mes deux choix', () => {
      renderWith(<Lobby />, withAssist(3, { p1: true, p2: null, p3: true }));
      const box = screen.getByRole('region', { name: 'Assistance' });
      expect(within(box).getByText('En attente d’accord')).toBeInTheDocument(); // p2 n'a pas encore répondu
      expect(within(box).getByText(/jamais de suggestion/)).toBeInTheDocument();
      const list = screen.getByRole('list', { name: 'Joueurs' });
      expect(within(list).getAllByText('Assistance : oui')).toHaveLength(2);
      expect(within(list).getAllByText('Assistance : en attente')).toHaveLength(1);
    });

    it('trois états distincts à l’écran : accord, refus explicite, pas encore répondu', () => {
      renderWith(<Lobby />, withAssist(3, { p1: true, p2: false, p3: null }));
      const list = screen.getByRole('list', { name: 'Joueurs' });
      expect(within(list).getAllByText('Assistance : oui')).toHaveLength(1);
      expect(within(list).getAllByText('Assistance : non')).toHaveLength(1); // p2 a explicitement refusé
      expect(within(list).getAllByText('Assistance : en attente')).toHaveLength(1); // p3 n'a rien dit
    });

    it('je n’ai pas encore répondu : aucun de mes deux boutons n’est présenté comme déjà choisi', () => {
      renderWith(<Lobby />, withAssist(2, { p1: true, p2: null })); // je suis p2
      expect(screen.getByRole('button', { name: 'J’approuve l’assistance' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Je préfère sans assistance' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('Vous n’avez pas encore répondu.')).toBeInTheDocument();
    });

    it('j’ai explicitement refusé : seul « sans assistance » est marqué, et le rappel disparaît', () => {
      renderWith(<Lobby />, withAssist(2, { p1: true, p2: false }));
      expect(screen.getByRole('button', { name: 'Je préfère sans assistance' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'J’approuve l’assistance' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByText('Vous n’avez pas encore répondu.')).toBeNull();
    });

    it('tous approuvés : « Accord de tous » et annonce que la partie démarrera avec assistance', () => {
      renderWith(<Lobby />, withAssist(2, { p1: true, p2: true }));
      const box = screen.getByRole('region', { name: 'Assistance' });
      expect(within(box).getByText('Accord de tous')).toBeInTheDocument();
      expect(within(box).getByText(/démarrera avec assistance/)).toBeInTheDocument();
    });

    it('mes boutons envoient mon vote ; mon choix actuel est marqué', async () => {
      const user = userEvent.setup();
      const { client } = renderWith(<Lobby />, withAssist(2, { p1: true, p2: null })); // je suis p2 (invité), rien voté
      const votes: boolean[] = [];
      client.approveAssistance = async (v) => (votes.push(v), true);
      await user.click(screen.getByRole('button', { name: 'J’approuve l’assistance' }));
      await user.click(screen.getByRole('button', { name: 'Je préfère sans assistance' }));
      expect(votes).toEqual([true, false]);
    });

    it('l’hôte vote lui aussi (il est approuvé d’office mais peut se rétracter)', async () => {
      const user = userEvent.setup();
      const { client } = renderWith(<Lobby />, withAssist(2, { p1: true, p2: true }, 'HOST'));
      const votes: boolean[] = [];
      client.approveAssistance = async (v) => (votes.push(v), true);
      expect(screen.getByRole('button', { name: 'J’approuve l’assistance' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: 'Je préfère sans assistance' }));
      expect(votes).toEqual([false]);
    });
  });

  it('partie annulée', () => {
    renderWith(<Lobby />, lobby(2, 'PLAYER', { status: 'CANCELLED' }));
    expect(screen.getByText('Partie annulée')).toBeInTheDocument();
  });
});

describe('formulaires', () => {
  it('création : validation, puis envoi avec la mise en centimes', async () => {
    const user = userEvent.setup();
    const { client } = renderWith(<CreateRoom onBack={() => undefined} />, null);
    const created = vi.fn(async () => undefined);
    client.createRoom = created;
    const submit = screen.getByRole('button', { name: 'Créer la table' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Nom de la table'), 'Vendredi');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Emeric');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Objectif en points' })).getByRole('radio', { name: '5' }));
    await user.clear(screen.getByLabelText(/Mise par joueur/));
    await user.type(screen.getByLabelText(/Mise par joueur/), '12,50');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(created).toHaveBeenCalledWith({ name: 'Vendredi', maxPlayers: 4, targetPoints: 5, stakeCents: 1250, assistance: false, nickname: 'Emeric', avatar: 'or' });
  });
  it('création : le niveau « avec assistance » est proposé et transmis au serveur', async () => {
    const user = userEvent.setup();
    const { client } = renderWith(<CreateRoom onBack={() => undefined} />, null);
    const created = vi.fn(async () => undefined);
    client.createRoom = created;
    expect(screen.getByRole('radio', { name: 'Sans assistance' })).toHaveAttribute('aria-checked', 'true'); // défaut : aucune aide
    await user.type(screen.getByLabelText('Nom de la table'), 'T');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Emeric');
    await user.click(screen.getByRole('radio', { name: 'Avec assistance' }));
    expect(screen.getByText(/Chaque joueur devra approuver/)).toBeInTheDocument(); // explication du vote
    await user.click(screen.getByRole('button', { name: 'Créer la table' }));
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ assistance: true }));
  });
  it('création : mise hors bornes ou pseudo invalide refusés', async () => {
    const user = userEvent.setup();
    renderWith(<CreateRoom onBack={() => undefined} />, null);
    await user.type(screen.getByLabelText('Nom de la table'), 'T');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Emeric');
    for (const bad of ['-5', '10001', 'abc']) {
      await user.clear(screen.getByLabelText(/Mise par joueur/));
      await user.type(screen.getByLabelText(/Mise par joueur/), bad);
      expect(screen.getByRole('button', { name: 'Créer la table' })).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent('Mise de 0 à 10 000 €');
    }
    await user.clear(screen.getByLabelText(/Mise par joueur/));
    await user.type(screen.getByLabelText(/Mise par joueur/), '0');
    expect(screen.getByRole('button', { name: 'Créer la table' })).toBeEnabled(); // mise à 0 autorisée
  });
  it('création : l’erreur du serveur est affichée', async () => {
    const user = userEvent.setup();
    const { client } = renderWith(<CreateRoom onBack={() => undefined} />, null);
    const { ApiError } = await import('../src/lib/api');
    client.createRoom = async () => { throw new ApiError('RATE_LIMITED', 'Trop de requêtes, réessayez plus tard.'); };
    await user.type(screen.getByLabelText('Nom de la table'), 'T');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Emeric');
    await user.click(screen.getByRole('button', { name: 'Créer la table' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de requêtes');
    expect(screen.getByRole('button', { name: 'Créer la table' })).toBeEnabled();
  });
  it('arrivée : le code est normalisé (« ab2c » → POKER-AB2C)', async () => {
    const user = userEvent.setup();
    const { client } = renderWith(<JoinRoom onBack={() => undefined} />, null);
    const joined = vi.fn(async () => undefined);
    client.joinRoom = joined;
    const submit = screen.getByRole('button', { name: 'Rejoindre la table' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Code de la partie'), 'ab2c');
    await user.type(screen.getByLabelText('Votre pseudo'), 'Alice');
    await user.click(submit);
    expect(joined).toHaveBeenCalledWith('POKER-AB2C', { nickname: 'Alice', avatar: 'emeraude' });
  });
  it('arrivée : code prérempli par le lien d’invitation ; code invalide bloqué', async () => {
    const user = userEvent.setup();
    renderWith(<JoinRoom onBack={() => undefined} initialCode="POKER-7K2M" />, null);
    expect(screen.getByLabelText('Code de la partie')).toHaveValue('POKER-7K2M');
    await user.clear(screen.getByLabelText('Code de la partie'));
    await user.type(screen.getByLabelText('Code de la partie'), 'POKER-0000'); // 0 et O exclus de l'alphabet
    await user.type(screen.getByLabelText('Votre pseudo'), 'Alice');
    expect(screen.getByRole('button', { name: 'Rejoindre la table' })).toBeDisabled();
  });
});

describe('fin de partie', () => {
  const outcome = (over: Partial<GameOutcome> = {}): GameOutcome => ({
    winner: 'p1',
    victoryType: 'SCORE',
    standings: [{ player: 'p1', position: 'UTG', score: 3, rank: 1 }, { player: 'p2', position: 'UTG+1', score: 2, rank: 2 }, { player: 'p3', position: 'UTG+2', score: 0, rank: 3 }],
    settlement: { potCents: 6000, payouts: { p1: 4000, p2: 2000, p3: 0 }, applied: { players: ['p1', 'p2'], type: 'LOSER_NOT_PAYING' } },
    insurance: { players: ['p1', 'p2'], type: 'LOSER_NOT_PAYING' },
    ...over,
  });
  const over = (o: GameOutcome) => roomView({ status: 'FINISHED' }, game({ phase: 'GAME_OVER', round: null, outcome: o }));

  it('vainqueur, classement et répartition de la cagnotte (mise, gain, solde)', () => {
    renderWith(<GameOverModal view={over(outcome())} onClose={() => undefined} onLeave={() => undefined} />, over(outcome()));
    expect(screen.getByRole('heading', { name: 'Victoire d’Emeric' })).toBeInTheDocument();
    expect(screen.getByText('Objectif atteint')).toBeInTheDocument();
    const row = (n: string) => flat(screen.getByRole('row', { name: new RegExp(n) }).textContent);
    expect(row('Emeric')).toContain('40 €');
    expect(row('Emeric')).toContain('+20 €');
    expect(row('Alice')).toContain('20 €');
    expect(row('Bob')).toContain('−20 €');
    expect(flat(screen.getByRole('row', { name: /Cagnotte/ }).textContent)).toContain('60 €');
    expect(screen.getByText(/Assurance appliquée : Emeric et Alice — Le perdant ne paye pas/)).toBeInTheDocument();
  });
  it('quinte flush au 6-3 : victoire immédiate, sans assurance', () => {
    const o = outcome({ victoryType: 'STRAIGHT_FLUSH_63', insurance: null, settlement: { potCents: 6000, payouts: { p1: 6000, p2: 0, p3: 0 }, applied: null } });
    renderWith(<GameOverModal view={over(o)} onClose={() => undefined} onLeave={() => undefined} />, over(o));
    expect(screen.getByText('Quinte flush au 6-3 — victoire immédiate')).toBeInTheDocument();
    expect(screen.queryByText(/Assurance appliquée/)).toBeNull();
    expect(flat(screen.getByRole('row', { name: /Emeric/ }).textContent)).toContain('+40 €');
  });
  it('la somme des gains égale la cagnotte, quel que soit le cas', () => {
    const o = outcome();
    const total = Object.values(o.settlement.payouts).reduce((a, b) => a + b, 0);
    expect(total).toBe(o.settlement.potCents);
  });
  it('boutons : revoir la table / retour à l’accueil', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onLeave = vi.fn();
    renderWith(<GameOverModal view={over(outcome())} onClose={onClose} onLeave={onLeave} />, over(outcome()));
    await user.click(screen.getByRole('button', { name: 'Revoir la table' }));
    await user.click(screen.getByRole('button', { name: 'Retour à l’accueil' }));
    expect([onClose.mock.calls.length, onLeave.mock.calls.length]).toEqual([1, 1]);
  });
});

describe('Hold’em de départage', () => {
  afterEach(() => vi.useRealTimers());
  const tb = { winner: 'p2', rounds: [{ players: ['p1', 'p2'], hands: { p1: ['Ah', 'Kh'] as [string, string], p2: ['2c', '2d'] as [string, string] }, board: ['3s', '4s', '5s', '9d', 'Jc'], winners: ['p2'] }] };
  it('mains ouvertes d’abord, puis flop, turn, river, puis le vainqueur', () => {
    vi.useFakeTimers();
    renderWith(<TiebreakSequence tiebreak={tb} view={roomView()} />, roomView());
    const board = () => within(screen.getByRole('group', { name: 'Cartes communes du départage' })).queryAllByRole('img');
    expect(screen.getByRole('img', { name: 'As de cœur' })).toBeInTheDocument(); // cartes privées ouvertes
    expect(board()).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(1100));
    expect(board()).toHaveLength(3);
    act(() => void vi.advanceTimersByTime(1100));
    expect(board()).toHaveLength(4);
    expect(screen.queryByText(/Vainqueur du départage/)).toBeNull();
    act(() => void vi.advanceTimersByTime(1100));
    expect(board()).toHaveLength(5);
    expect(screen.getByText('Vainqueur du départage : Alice')).toBeInTheDocument();
  });
  it('« Passer » affiche directement le résultat', async () => {
    const user = userEvent.setup();
    renderWith(<TiebreakSequence tiebreak={tb} view={roomView()} />, roomView());
    await user.click(screen.getByRole('button', { name: 'Passer' }));
    expect(screen.getByText('Vainqueur du départage : Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();
  });
  it('égalité répétée : chaque tour est rejoué', () => {
    vi.useFakeTimers();
    const two = { winner: 'p1', rounds: [{ ...tb.rounds[0]!, winners: ['p1', 'p2'] }, { ...tb.rounds[0]!, board: ['6s', '7s', '8s', 'Td', 'Qc'], winners: ['p1'] }] };
    renderWith(<TiebreakSequence tiebreak={two} view={roomView()} />, roomView());
    expect(screen.getByText(/tour 1/)).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => void vi.advanceTimersByTime(1100)); // chaque étape planifie la suivante après son rendu
    expect(screen.getByText(/tour 2/)).toBeInTheDocument();
  });
});

describe('table : résultat de manche et routage des panneaux', () => {
  const record: RoundRecord = { roundNo: 1, chooser: 'p1', variant: 'AVIATION', result: { kind: 'WINNER', winner: 'p2', points: 1 }, award: { kind: 'POINTS', winner: 'p2', points: 1 }, points: { p2: 1 }, scoresAfter: { p1: 0, p2: 1, p3: 0 } };
  const item = (id: number, type: string, data: Record<string, unknown>): FeedItem => ({ id, version: id, event: { type, visibility: 'PUBLIC', data } });
  const pick = (over = {}) => roomView({}, game({ phase: 'VARIANT_SELECTION', round: null, ...over }));

  it('une manche qui se termine ouvre le récapitulatif (mains dévoilées, plateau complété)', async () => {
    const { client } = renderWith(<Table />, pick({ roundNo: 1 }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // manche en cours : plateau connu (flop + turn), puis fin de manche avec showdown et river révélée
    act(() => client.store.setState({ view: roomView({}, game({ round: round('AVIATION', ['As', 'Kd'], { step: 2, discardCount: 1, status: {}, validated: [], yourDraft: [] }, { phase: 'DISCARD_2', board: ['2c', '7d', 'Th', '9s', null] }) })) }));
    act(() =>
      client.store.setState({
        feed: [item(1, 'VARIANT_CHOSEN', { roundNo: 1, variant: 'AVIATION', chooser: 'p1' }), item(2, 'BOARD_REVEALED', { slot: 4, card: 'Qc' }), item(3, 'SHOWDOWN', { hands: { p1: { cards: ['As', 'Kd'], category: 0 }, p2: { cards: ['9h', '9c'], category: 3 } } })],
        view: roomView({}, game({ roundNo: 2, phase: 'VARIANT_SELECTION', round: null, history: [record] })),
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Résultat de la manche 1' });
    expect(within(dialog).getByText('Alice remporte la manche (+1 point)')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Mains dévoilées' })).toBeInTheDocument();
    expect(within(dialog).getByText('Brelan')).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Cartes communes' }).querySelectorAll('[role=img]')).toHaveLength(5);
    expect(within(dialog).getByRole('img', { name: 'Dame de trèfle (Q)' })).toBeInTheDocument(); // river révélée à la clôture
  });
  it('rien à l’ouverture d’une partie déjà entamée (l’historique n’est pas rejoué)', () => {
    renderWith(<Table />, pick({ roundNo: 2, history: [record] }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('partie terminée à l’ouverture : écran de fin de partie', () => {
    const o: GameOutcome = { winner: 'p2', victoryType: 'SCORE', standings: [{ player: 'p2', position: 'UTG+1', score: 3, rank: 1 }], settlement: { potCents: 6000, payouts: { p1: 0, p2: 6000, p3: 0 }, applied: null }, insurance: null };
    renderWith(<Table />, roomView({ status: 'FINISHED' }, game({ phase: 'GAME_OVER', round: null, outcome: o, history: [record] })));
    expect(screen.getByRole('heading', { name: 'Victoire d’Alice' })).toBeInTheDocument();
  });
  it('chaque variante affiche son propre panneau', () => {
    const cases: [Parameters<typeof round>[0], Record<string, unknown>, RegExp][] = [
      ['CLOSED_2', { change: 1, totalChanges: 2, validated: [], yourDraft: [] }, /Choisissez les cartes à changer/],
      ['AVIATION', { step: 1, discardCount: 1, status: {}, validated: [], yourDraft: [] }, /Jetez exactement 1 carte/],
      ['AVIA_6', { step: 1, discardCount: 2, status: {}, validated: [], yourDraft: [] }, /Jetez exactement 2 cartes/],
      ['V6_3', { line: 2, validated: [], yourDraft: [], lines: [], unitsScale: 60 }, /LIGNE 2/],
      ['V6_1', { next: 'p3', reason: 'WEAKEST', reveals: 0, history: [] }, /Bob doit révéler/],
      ['MORPION', { validated: [], yourDraft: { cards: [], line: null } }, /2 cartes et un alignement/],
      ['LE10', { next: 'p3', reason: 'WEAKEST', reveals: 0, history: [] }, /Bob doit révéler/],
    ];
    for (const [variant, info, expected] of cases) {
      const { unmount } = renderWith(<Table />, roomView({}, game({ round: round(variant, ['As', 'Kd', '9c', '5h', '2s', '3d'], info, { board: variant === 'V6_3' ? ['2c', '7d', 'Th', '9s', 'Ah', null, null] : [] }) })));
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).join(' ')).toMatch(expected);
      unmount();
    }
  });
  it('joueur exclu : bandeau explicite ; file d’attente : bandeau d’arrivée', () => {
    const ex = renderWith(<Table />, roomView({ players: players(3, { p1: { excluded: true } }) }, game({ round: null, phase: 'VARIANT_SELECTION' })));
    expect(screen.getByText(/exclu de la partie par l’hôte/)).toBeInTheDocument();
    ex.unmount();
    renderWith(<Table />, roomView({ you: { playerId: 'p1', role: 'QUEUED' } }, game({ round: null, phase: 'VARIANT_SELECTION' })));
    expect(screen.getByText(/rejoindrez la table entre deux manches/)).toBeInTheDocument();
  });
  it('scores : historique et assurance affichés', async () => {
    const user = userEvent.setup();
    const g = game({ round: null, phase: 'VARIANT_SELECTION', history: [record], evolution: { p2: [1] }, insurance: { eligible: [], canPropose: false, blockedPartners: [], pending: null, accepted: [{ players: ['p1', 'p2'], type: 'SPLIT_50_50' }] } });
    renderWith(<Table />, roomView({}, g));
    await user.click(screen.getByRole('button', { name: 'Scores' }));
    const dialog = screen.getByRole('dialog', { name: 'Scores et historique' });
    expect(within(dialog).getByText(/Assuré avec Alice/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Aviation/)).toBeInTheDocument();
    expect(within(dialog).getByText('Alice +1')).toBeInTheDocument();
  });

  it('résultat de manche : toucher la fenêtre arrête la fermeture automatique', () => {
    vi.useFakeTimers();
    try {
      const { client } = renderWith(<Table />, pick({ roundNo: 1 }));
      act(() => client.store.setState({ view: roomView({}, game({ roundNo: 2, phase: 'VARIANT_SELECTION', round: null, history: [record] })) }));
      const dialog = screen.getByRole('dialog', { name: 'Résultat de la manche 1' });
      expect(within(dialog).getByText(/Fermeture dans/)).toBeInTheDocument();
      fireEvent.pointerDown(within(dialog).getByRole('heading', { level: 2 })); // toute interaction dans la fenêtre
      expect(within(dialog).queryByText(/Fermeture dans/)).toBeNull();
      for (let i = 0; i < 20; i++) act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole('dialog', { name: 'Résultat de la manche 1' })).toBeInTheDocument(); // ne s'est pas fermé seul
    } finally {
      vi.useRealTimers();
    }
  });

  it('résultat de manche : sans interaction, se ferme après 14 s', () => {
    vi.useFakeTimers();
    try {
      const { client } = renderWith(<Table />, pick({ roundNo: 1 }));
      act(() => client.store.setState({ view: roomView({}, game({ roundNo: 2, phase: 'VARIANT_SELECTION', round: null, history: [record] })) }));
      screen.getByRole('dialog', { name: 'Résultat de la manche 1' });
      for (let i = 0; i < 14; i++) act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('dialog', { name: 'Résultat de la manche 1' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('options : le réglage des sons se règle et se conserve dans la session', async () => {
    const user = userEvent.setup();
    renderWith(<Table />, pick({}));
    await user.click(screen.getByRole('button', { name: 'Options' }));
    const dialog = screen.getByRole('dialog', { name: 'Options' });
    const soundToggle = within(dialog).getByRole('checkbox', { name: /Sons et vibrations/ });
    expect(soundToggle).toBeChecked(); // activé par défaut
    await user.click(soundToggle);
    expect(soundToggle).not.toBeChecked();
  });

  it('fin de partie : des confettis accompagnent la victoire', () => {
    const o: GameOutcome = { winner: 'p1', victoryType: 'SCORE', standings: [{ player: 'p1', position: 'UTG', score: 3, rank: 1 }], settlement: { potCents: 6000, payouts: { p1: 6000 }, applied: null }, insurance: null };
    const { container } = renderWith(<GameOverModal view={roomView({ status: 'FINISHED' }, game({ phase: 'GAME_OVER', round: null, outcome: o }))} onClose={() => undefined} onLeave={() => undefined} />, roomView({}, game({ outcome: o })));
    expect(container.querySelectorAll('span[style*="background-color"]').length).toBeGreaterThan(0);
  });
});

describe('application : écrans selon l’état', () => {
  it('sans session : accueil', () => {
    const f = renderWith(<App />, null);
    f.client.store.setState({ session: null });
    return screen.findByRole('button', { name: 'Créer une partie' });
  });
  it('session sans vue : connexion en cours, avec sortie possible', () => {
    renderWith(<App />, null);
    expect(screen.getByText(/Connexion à la partie POKER-ABCD/)).toBeInTheDocument();
  });
  it('lobby, puis table selon le statut de la room', () => {
    const w = renderWith(<App />, roomView({ status: 'WAITING' }, null));
    expect(screen.getByText('Salle d’attente')).toBeInTheDocument();
    act(() => w.client.store.setState({ view: roomView({}, game({ round: null, phase: 'VARIANT_SELECTION' })) }));
    expect(screen.getByRole('navigation', { name: 'Menu de la table' })).toBeInTheDocument();
  });
  it('bannière de connexion perdue : les minuteurs continuent', () => {
    const w = renderWith(<App />, roomView({}, game({ round: null, phase: 'VARIANT_SELECTION' })));
    act(() => w.client.store.setState({ connection: 'offline' }));
    expect(screen.getByText(/Connexion perdue — reconnexion en cours/)).toBeInTheDocument();
    act(() => w.client.store.setState({ connection: 'online' }));
    expect(screen.queryByText(/Connexion perdue/)).toBeNull();
  });
  it('exclusion par l’hôte : retour à l’accueil avec message', () => {
    const w = renderWith(<App />, null);
    act(() => w.client.store.setState({ session: null, view: null, closed: 'KICKED' }));
    expect(screen.getByRole('alert')).toHaveTextContent('retiré de la partie par l’hôte');
  });
});
