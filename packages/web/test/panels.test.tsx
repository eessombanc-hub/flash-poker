import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Board } from '../src/components/Board';
import { Seat } from '../src/components/Seat';
import { SettingsProvider } from '../src/lib/settings';
import { ClosedPanel } from '../src/panels/ClosedPanel';
import { DiscardPanel } from '../src/panels/DiscardPanel';
import { InsurancePanel } from '../src/panels/InsurancePanel';
import { Line63Panel } from '../src/panels/Line63Panel';
import { MorpionPanel } from '../src/panels/MorpionPanel';
import { Reveal10Panel } from '../src/panels/Reveal10Panel';
import { Reveal61Panel } from '../src/panels/Reveal61Panel';
import { VariantPicker } from '../src/panels/VariantPicker';
import { game, players, renderWith, roomView, round } from './fixtures';

// Nom exact, ou suivi de la lettre d'une figure : « Roi de carreau » trouve « Roi de carreau (K) ».
const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}( \\([JQK]\\))?$`) });
const flat = (s: string | null) => (s ?? '').replace(/[\u202f\u00a0]/g, ' ');

describe('Poker fermé', () => {
  const HAND = ['As', 'Kd', '9c', '5h', '2s'];
  const view = (info: Record<string, unknown> = {}) => roomView({}, game({ round: round('CLOSED_1', HAND, { change: 1, totalChanges: 1, validated: [], yourDraft: [], ...info }, { phase: 'CHANGE_1' }) }));

  it('3 cartes au plus ; la quatrième est refusée', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<ClosedPanel />, view());
    for (const n of ['As de pique', 'Roi de carreau', '9 de trèfle']) await user.click(card(n));
    expect(card('5 de cœur')).toBeDisabled();
    expect(screen.getByText('3 cartes à changer')).toBeInTheDocument();
    expect(sent.at(-1)).toEqual({ type: 'SELECT', cards: ['As', 'Kd', '9c'] });
  });
  it('0 carte : « Garder ma main » ; sinon « Changer n cartes » ; valider envoie VALIDATE', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<ClosedPanel />, view());
    expect(screen.getByRole('button', { name: 'Garder ma main' })).toBeEnabled();
    await user.click(card('9 de trèfle'));
    await user.click(screen.getByRole('button', { name: 'Changer 1 carte' }));
    expect(sent.at(-1)).toEqual({ type: 'VALIDATE' });
  });
  it('une fois validé : verrouillé et compteur d’attente', () => {
    renderWith(<ClosedPanel />, view({ validated: ['p1'] }));
    expect(screen.getByRole('button', { name: 'Change validé' })).toBeDisabled();
    expect(card('As de pique')).toBeDisabled();
    expect(screen.getByText(/En attente des autres joueurs \(1 \/ 3\)/)).toBeInTheDocument();
  });
  it('reprend le brouillon conservé par le serveur (rechargement de page)', () => {
    renderWith(<ClosedPanel />, view({ yourDraft: ['Kd'] }));
    expect(card('Roi de carreau')).toHaveAttribute('aria-pressed', 'true');
    expect(card('As de pique')).toHaveAttribute('aria-pressed', 'false');
  });
  it('spectateur ou file d’attente : aucune action possible', () => {
    const g = game({ round: round('CLOSED_1', HAND, { validated: [] }, { n: 3 }), players: game().players.filter((p) => p.player !== 'p1') });
    renderWith(<ClosedPanel />, roomView({ you: { playerId: 'p1', role: 'QUEUED' } }, g));
    expect(screen.getByText(/spectateur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Garder|Changer/ })).toBeNull();
  });
  it('double-tap : deux cartes touchées dans le même cycle de rendu s’additionnent', () => {
    const { sent } = renderWith(<ClosedPanel />, view());
    act(() => {
      card('As de pique').click();
      card('Roi de carreau').click();
    });
    expect(sent.at(-1)).toEqual({ type: 'SELECT', cards: ['As', 'Kd'] });
  });
});

describe('Aviation et Avia 6', () => {
  const status = { p1: 'ACTIVE', p2: 'ACTIVE', p3: 'ACTIVE' };
  const view = (variant: 'AVIATION' | 'AVIA_6', hand: string[], n: number, over: Record<string, unknown> = {}) =>
    roomView({}, game({ round: round(variant, hand, { step: 1, discardCount: n, status, validated: [], yourDraft: [], ...over }, { phase: 'DISCARD_1', board: ['2c', '7d', 'Th', null, null] }) }));

  it('Aviation : valider exige exactement 1 carte', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<DiscardPanel />, view('AVIATION', ['As', 'Kd', '9c', '5h'], 1));
    const validate = screen.getByRole('button', { name: 'Valider ma défausse' });
    expect(validate).toBeDisabled();
    expect(screen.getByText('0 / 1 carte à jeter')).toBeInTheDocument();
    await user.click(card('9 de trèfle'));
    expect(validate).toBeEnabled();
    await user.click(validate);
    expect(sent.at(-1)).toEqual({ type: 'VALIDATE' });
  });
  it('Avia 6 : exactement 2 cartes (1 seule ne suffit pas), jamais 3', async () => {
    const user = userEvent.setup();
    renderWith(<DiscardPanel />, view('AVIA_6', ['As', 'Kd', '9c', '5h', '4d', '2s'], 2));
    const validate = screen.getByRole('button', { name: 'Valider ma défausse' });
    await user.click(card('9 de trèfle'));
    expect(validate).toBeDisabled();
    await user.click(card('5 de cœur'));
    expect(validate).toBeEnabled();
    expect(card('As de pique')).toBeDisabled(); // plafond atteint
    expect(screen.getByRole('heading', { name: 'Jetez exactement 2 cartes' })).toBeInTheDocument();
  });
  it('main couchée : bandeau, cartes atténuées, aucune action', () => {
    renderWith(<DiscardPanel />, view('AVIATION', ['As', 'Kd', '9c', '5h'], 1, { status: { ...status, p1: 'FOLDED' } }));
    expect(screen.getByText('Votre main est couchée pour cette manche')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider ma défausse' })).toBeNull();
  });
});

describe('6-3 : aucune aide au joueur', () => {
  const HAND = ['As', 'Ad', 'Kc', '7h', '4d', '2s'];
  const BOARD = ['Ah', 'Ks', 'Kd', '9c', '2c', null, null];
  const view = (info: Record<string, unknown> = {}) => roomView({}, game({ round: round('V6_3', HAND, { line: 1, validated: [], yourDraft: [], lines: [], unitsScale: 60, ...info }, { phase: 'LINE_1', board: BOARD }) }));
  const LABELS = /^(Carte haute|Paire|Double paire|Brelan|Quinte|Couleur|Full|Carré|Quinte flush)$/;

  it('le texte affiché est strictement identique, que la paire choisie soit la meilleure ou la pire', async () => {
    const user = userEvent.setup();
    const a = renderWith(<Line63Panel />, view());
    await user.click(card('As de pique'));
    await user.click(card('As de carreau')); // meilleure paire possible
    const best = a.container.textContent;
    a.unmount();
    const b = renderWith(<Line63Panel />, view());
    await user.click(card('7 de cœur'));
    await user.click(card('2 de pique')); // pire paire possible
    const worst = b.container.textContent;
    expect(best).toBe(worst);
    expect(best).toContain('2 / 2 cartes désignées');
  });
  it('aucun libellé de combinaison, aucune mise en évidence pendant la désignation', async () => {
    const user = userEvent.setup();
    const { container } = renderWith(<Line63Panel />, view());
    await user.click(card('As de pique'));
    await user.click(card('As de carreau'));
    expect(screen.queryByText(LABELS)).toBeNull();
    expect(container.querySelector('[aria-label*="Paire" i], [aria-label*="Brelan" i], [aria-label*="meilleure" i]')).toBeNull();
    // seules les cartes réellement cliquées sont marquées
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
  });
  it('2 cartes exactement : validation impossible avec 1, troisième carte refusée', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<Line63Panel />, view());
    const validate = screen.getByRole('button', { name: 'Valider ma combinaison' });
    await user.click(card('As de pique'));
    expect(validate).toBeDisabled();
    await user.click(card('Roi de trèfle'));
    expect(validate).toBeEnabled();
    expect(card('4 de carreau')).toBeDisabled();
    await user.click(validate);
    expect(sent.at(-1)).toEqual({ type: 'VALIDATE' });
  });
  it('lignes closes : désignations dévoilées, gagnant et points ; « ligne perdue » sans désignation', () => {
    const lines = [{ line: 1, designations: { p1: { pair: ['As', 'Ad'], rank: 9, category: 3 }, p2: null, p3: { pair: ['7h', '4d'], rank: 1, category: 0 } }, winners: ['p1'], unitsEach: 60 }];
    renderWith(<Line63Panel />, view({ line: 2, lines }));
    const recap = screen.getByLabelText('Lignes terminées');
    expect(within(recap).getByText('Brelan')).toBeInTheDocument();
    expect(within(recap).getByText('Carte haute')).toBeInTheDocument();
    expect(within(recap).getByText('Ligne perdue')).toBeInTheDocument();
    expect(flat(recap.textContent)).toContain('Emeric · 1 pt');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('LIGNE 2');
  });
  it('point de ligne partagé affiché en fraction', () => {
    const lines = [{ line: 1, designations: { p1: { pair: ['As', 'Ad'], rank: 9, category: 1 }, p2: { pair: ['Kc', 'Ks'], rank: 9, category: 1 }, p3: null }, winners: ['p1', 'p2'], unitsEach: 30 }];
    renderWith(<Line63Panel />, view({ line: 2, lines }));
    expect(flat(screen.getByLabelText('Lignes terminées').textContent)).toContain('Emeric + Alice · ½ pt chacun');
  });
});

describe('6-1 : révélations', () => {
  const HAND = ['9c', '5h', 'Kd', '2s', '7d', '3h'];
  const ranking = { p1: { category: 1, rank: 100 }, p2: { category: 2, rank: 300 }, p3: { category: 0, rank: 50 } };
  const view = (next: string) =>
    roomView({}, game({ round: round('V6_1', HAND, { next, reason: 'WEAKEST', reveals: 3, history: [{ revealer: 'p2', card: '9h', ranking, nextRevealer: next, reason: 'WEAKEST' }] }, { phase: 'REVEAL', awaiting: [next], board: ['2c', '7d', '9d', 'Js', 'Kc'], visibleMine: [false, false, false, false, false, true] }) }));

  it('« À toi de révéler » et bouton : uniquement pour le joueur désigné', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<Reveal61Panel />, view('p1'));
    expect(screen.getByRole('heading', { name: 'À toi de révéler' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retourner ma carte' }));
    expect(sent.at(-1)).toEqual({ type: 'REVEAL' });
  });
  it('un autre joueur est désigné : pas de bouton, message d’attente', () => {
    renderWith(<Reveal61Panel />, view('p3'));
    expect(screen.getByRole('heading', { name: 'Bob doit révéler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retourner ma carte' })).toBeNull();
    expect(screen.getByText('En attente de Bob…')).toBeInTheDocument();
  });
  it('attente avec élision : « d’Alice », « de Bob »', () => {
    const a = renderWith(<Reveal61Panel />, view('p2'));
    expect(screen.getByText('En attente d’Alice…')).toBeInTheDocument();
    a.unmount();
    renderWith(<Reveal61Panel />, view('p3'));
    expect(screen.getByText('En attente de Bob…')).toBeInTheDocument();
  });
  it('mes cartes non encore retournées : dos de carte, jamais leur valeur — même pour moi', () => {
    renderWith(<Reveal61Panel />, view('p1'));
    const hand = within(screen.getByRole('group', { name: 'Votre main' }));
    const backs = hand.getAllByRole('img', { name: 'Carte face cachée — pas encore retournée' });
    expect(backs).toHaveLength(5); // 5 des 6 cartes : jamais révélées, y compris à leur propriétaire
    for (const rank of ['9', '5', 'Roi', '2', '7']) expect(hand.queryByRole('img', { name: new RegExp(rank) })).toBeNull();
    expect(hand.getByRole('img', { name: '3 de cœur — visible de tous' })).toBeInTheDocument(); // la seule déjà visible
  });

  it('classement du plus faible au plus fort, avec la carte qui vient d’être retournée', () => {
    renderWith(<Reveal61Panel />, view('p3'));
    const items = within(screen.getByRole('list', { name: /de la plus faible à la plus forte/ })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('Bob'), expect.stringContaining('Emeric'), expect.stringContaining('Alice')]);
    expect(items[0]!.textContent).toContain('Carte haute');
    expect(items[0]!.textContent).toContain('Plus faible');
    expect(screen.getByText(/Alice/, { selector: 'strong' })).toBeInTheDocument();
  });
  it('ma prochaine carte à retourner est celle de l’ordre de distribution', () => {
    renderWith(<Reveal61Panel />, view('p1'));
    expect(screen.getAllByText('prochaine')).toHaveLength(1);
  });
});

describe('Morpion : 2 cartes + un alignement, aucune aide', () => {
  const HAND = ['As', 'Kd', '9c', '2s'];
  const view = (info: Record<string, unknown> = {}) =>
    roomView({}, game({ round: round('MORPION', HAND, { validated: [], yourDraft: { cards: [], line: null }, ...info }, { phase: 'SELECTION', board: ['2c', '3d', '4h', '5s', '6c', '7d', '8h', '9s', 'Tc'] }) }));

  it('2 cartes au plus ; validation impossible sans 2 cartes ET un alignement', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<MorpionPanel />, view());
    const validate = screen.getByRole('button', { name: 'Valider ma combinaison' });
    expect(validate).toBeDisabled();
    await user.click(card('As de pique'));
    await user.click(card('Roi de carreau'));
    expect(card('9 de trèfle')).toBeDisabled(); // plafond de 2 cartes atteint
    expect(validate).toBeDisabled(); // pas encore d'alignement
    await user.click(screen.getByRole('radio', { name: 'Colonne 2' }));
    expect(validate).toBeEnabled();
    expect(sent.at(-1)).toEqual({ type: 'SELECT', cards: ['As', 'Kd'], line: 4 });
    await user.click(validate);
    expect(sent.at(-1)).toEqual({ type: 'VALIDATE' });
  });

  it('aucune aide : le texte affiché est identique quelle que soit la paire choisie', async () => {
    const user = userEvent.setup();
    const a = renderWith(<MorpionPanel />, view());
    await user.click(card('As de pique'));
    await user.click(card('Roi de carreau'));
    await user.click(screen.getByRole('radio', { name: 'Ligne 1' }));
    const withGoodPair = a.container.textContent;
    a.unmount();
    const b = renderWith(<MorpionPanel />, view());
    await user.click(card('9 de trèfle'));
    await user.click(card('2 de pique'));
    await user.click(screen.getByRole('radio', { name: 'Ligne 1' }));
    const withWeakPair = b.container.textContent;
    expect(withGoodPair).toBe(withWeakPair);
    expect(screen.queryByText(/Paire|Brelan|Couleur|Quinte|Full|Carré/)).toBeNull();
  });

  it('changer d’alignement après coup reste possible tant que non validé', async () => {
    const user = userEvent.setup();
    renderWith(<MorpionPanel />, view());
    await user.click(screen.getByRole('radio', { name: 'Diagonale ↘' }));
    expect(screen.getByRole('radio', { name: 'Diagonale ↘' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Diagonale ↗' }));
    expect(screen.getByRole('radio', { name: 'Diagonale ↘' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Diagonale ↗' })).toHaveAttribute('aria-checked', 'true');
  });

  it('une fois validé : tout verrouillé, compteur d’attente', () => {
    renderWith(<MorpionPanel />, view({ validated: ['p1'], yourDraft: { cards: ['As', 'Kd'], line: 0 } }));
    expect(screen.getByRole('button', { name: 'Combinaison verrouillée' })).toBeDisabled();
    expect(card('As de pique')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Ligne 1' })).toBeDisabled();
    expect(screen.getByText(/En attente des autres joueurs \(1 \/ 3\)/)).toBeInTheDocument();
  });

  it('reprend le brouillon conservé par le serveur (rechargement de page)', () => {
    renderWith(<MorpionPanel />, view({ yourDraft: { cards: ['Kd'], line: 3 } }));
    expect(card('Roi de carreau')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: 'Colonne 1' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Le 10 : révélation', () => {
  const HAND = Array.from({ length: 10 }, (_, i) => ['2c', '3d', '4h', '5s', '6c', '7d', '8h', '9s', 'Tc', 'Jd'][i]!);
  const view = (next: string) =>
    roomView({}, game({ round: round('LE10', HAND, { next, reason: 'WEAKEST', reveals: 3, history: [{ revealer: 'p2', card: '9h', ranking: { p1: { category: 1, rank: 100 }, p2: { category: 0, rank: 50 } }, nextRevealer: next, reason: 'WEAKEST' }] }, { phase: 'REVEAL', board: [], visibleMine: [false, false, false, false, false, false, false, false, false, true] }) }));

  it('« À toi de révéler » uniquement pour le joueur désigné', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<Reveal10Panel />, view('p1'));
    expect(screen.getByRole('heading', { name: 'À toi de révéler' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retourner ma carte' }));
    expect(sent.at(-1)).toEqual({ type: 'REVEAL' });
  });

  it('un autre joueur désigné : pas de bouton, message d’attente', () => {
    renderWith(<Reveal10Panel />, view('p3'));
    expect(screen.getByRole('heading', { name: 'Bob doit révéler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retourner ma carte' })).toBeNull();
  });

  it('mes 10 cartes sont affichées, la prochaine cachée mise en évidence', () => {
    renderWith(<Reveal10Panel />, view('p1'));
    expect(within(screen.getByRole('group', { name: 'Votre main' })).getAllByRole('img')).toHaveLength(10);
    expect(screen.getAllByText('prochaine')).toHaveLength(1);
  });
});

describe('assistance : indicateur du nom de la combinaison (jamais de suggestion)', () => {
  const on = { assistance: true };
  const HAND6 = ['As', 'Ad', 'Kc', '7h', '4d', '2s'];
  const badge = () => screen.queryByTestId('assist-badge');

  it('Poker fermé : nom de la combinaison actuelle, quand l’assistance est active', () => {
    const g = game({ ...on, round: round('CLOSED_1', ['As', 'Ad', '2c', '7d', '9h'], { change: 1, totalChanges: 1, validated: [], yourDraft: [], assistCategory: 1 }, { phase: 'CHANGE_1' }) });
    renderWith(<ClosedPanel />, roomView({}, g));
    expect(badge()).toHaveTextContent('Votre combinaison');
    expect(badge()).toHaveTextContent('Paire');
  });

  it('sans assistance : aucun indicateur, même si le serveur envoyait une valeur (défense en profondeur côté affichage)', () => {
    const g = game({ assistance: false, round: round('CLOSED_1', ['As', 'Ad', '2c', '7d', '9h'], { change: 1, totalChanges: 1, validated: [], yourDraft: [], assistCategory: 1 }, { phase: 'CHANGE_1' }) });
    renderWith(<ClosedPanel />, roomView({}, g));
    expect(badge()).toBeNull();
    expect(screen.queryByText('Paire')).toBeNull();
  });

  it('Aviation : indicateur des cartes gardées ; message d’attente tant que rien n’est évaluable', () => {
    const info = { step: 1, discardCount: 1, status: { p1: 'ACTIVE', p2: 'ACTIVE', p3: 'ACTIVE' }, validated: [], yourDraft: [] };
    const a = renderWith(<DiscardPanel />, roomView({}, game({ ...on, round: round('AVIATION', HAND6.slice(0, 4), { ...info, assistCategory: 2 }, { phase: 'DISCARD_1', board: ['2c', '7d', 'Th', null, null] }) })));
    expect(badge()).toHaveTextContent('Double paire');
    a.unmount();
    renderWith(<DiscardPanel />, roomView({}, game({ ...on, round: round('AVIATION', HAND6.slice(0, 4), { ...info, assistCategory: null }, { phase: 'DISCARD_1' }) })));
    expect(badge()).toHaveTextContent('Combinaison des cartes que vous gardez');
  });

  it('6-3 : rien avant d’avoir désigné 2 cartes, puis le nom de la combinaison', () => {
    const base = { line: 1, validated: [], lines: [], unitsScale: 60 };
    const a = renderWith(<Line63Panel />, roomView({}, game({ ...on, round: round('V6_3', HAND6, { ...base, yourDraft: ['As'], assistCategory: null }, { phase: 'LINE_1' }) })));
    expect(badge()).toHaveTextContent('Désignez 2 cartes');
    a.unmount();
    renderWith(<Line63Panel />, roomView({}, game({ ...on, round: round('V6_3', HAND6, { ...base, yourDraft: ['As', 'Ad'], assistCategory: 3 }, { phase: 'LINE_1' }) })));
    expect(badge()).toHaveTextContent('Brelan');
  });

  it('Morpion : rien avant 2 cartes ET un alignement, puis le nom de la combinaison', () => {
    const a = renderWith(<MorpionPanel />, roomView({}, game({ ...on, round: round('MORPION', ['As', 'Kd', '9c', '2s'], { validated: [], yourDraft: { cards: ['As', 'Kd'], line: null }, assistCategory: null }, { phase: 'SELECTION' }) })));
    expect(badge()).toHaveTextContent('Choisissez 2 cartes et un alignement');
    a.unmount();
    renderWith(<MorpionPanel />, roomView({}, game({ ...on, round: round('MORPION', ['As', 'Kd', '9c', '2s'], { validated: [], yourDraft: { cards: ['As', 'Kd'], line: 0 }, assistCategory: 5 }, { phase: 'SELECTION' }) })));
    expect(badge()).toHaveTextContent('Couleur');
  });

  it('l’indicateur ne contient EXACTEMENT que « Votre combinaison » + le nom : aucun conseil, aucune comparaison', () => {
    for (const [cat, nom] of [[0, 'Carte haute'], [1, 'Paire'], [2, 'Double paire'], [3, 'Brelan'], [4, 'Quinte'], [5, 'Couleur'], [6, 'Full'], [7, 'Carré'], [8, 'Quinte flush']] as const) {
      const g = game({ ...on, round: round('CLOSED_1', ['As', 'Ad', '2c', '7d', '9h'], { change: 1, totalChanges: 1, validated: [], yourDraft: [], assistCategory: cat }, { phase: 'CHANGE_1' }) });
      const { unmount } = renderWith(<ClosedPanel />, roomView({}, g));
      expect(badge()!.textContent).toBe(`Votre combinaison${nom}`);
      unmount();
    }
  });

  it('la catégorie 0 (« carte haute ») s’affiche bien — 0 est une valeur, pas une absence', () => {
    const g = game({ ...on, round: round('CLOSED_1', ['As', 'Kd', '2c', '7d', '9h'], { change: 1, totalChanges: 1, validated: [], yourDraft: [], assistCategory: 0 }, { phase: 'CHANGE_1' }) });
    renderWith(<ClosedPanel />, roomView({}, g));
    expect(badge()).toHaveTextContent('Carte haute');
    expect(badge()).not.toHaveTextContent('Sélectionnez vos cartes');
  });
});

describe('choix de la variante', () => {
  const pick = (over = {}, chooser = 'p1') => roomView({}, game({ phase: 'VARIANT_SELECTION', chooser, round: null, timer: { kind: 'VARIANT', key: 'v1' }, ...over }));
  it('le joueur qui choisit clique ; le choix est envoyé', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<VariantPicker />, pick());
    expect(screen.getByRole('heading', { name: 'Choisissez la variante' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^6-3/ }));
    expect(sent.at(-1)).toEqual({ type: 'CHOOSE_VARIANT', variant: 'V6_3' });
  });
  it('les autres joueurs ne peuvent rien choisir', () => {
    renderWith(<VariantPicker />, pick({}, 'p2'));
    expect(screen.getByRole('heading', { name: 'Alice choisit la variante' })).toBeInTheDocument();
    for (const b of within(screen.getByRole('list', { name: 'Variantes' })).getAllByRole('button')) expect(b).toBeDisabled();
  });
  it('six variantes ; Fermé 2 changes grisé quand il est indisponible', () => {
    const variants = game().variants.map((v) => (v.variant === 'CLOSED_2' ? { ...v, available: false } : v));
    renderWith(<VariantPicker />, pick({ variants }));
    const buttons = within(screen.getByRole('list', { name: 'Variantes' })).getAllByRole('button');
    expect(buttons).toHaveLength(8);
    expect(screen.getByRole('button', { name: /2 changes/ })).toBeDisabled();
    expect(screen.getByText('2 à 5 joueurs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 change/ })).toBeEnabled();
  });
  it('proposition d’assurance en attente : choix suspendu', () => {
    const insurance = { eligible: ['p1', 'p2'], canPropose: false, pending: { proposer: 'p2', partner: 'p1', type: 'SPLIT_50_50' as const }, accepted: [] };
    renderWith(<VariantPicker />, pick({ insurance }));
    expect(screen.getByRole('button', { name: /^6-3/ })).toBeDisabled();
  });
});

describe('assurance', () => {
  const ins = (over = {}) => roomView({}, game({ phase: 'VARIANT_SELECTION', round: null, potChips: 60, stakeChips: 20, insurance: { eligible: ['p1', 'p2'], canPropose: true, blockedPartners: [], pending: null, accepted: [], ...over } }));
  it('proposition : partenaire unique présélectionné, formule au choix, texte chiffré', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<InsurancePanel />, ins());
    expect(screen.getByText('Vous êtes à 1 point de la victoire')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeChecked();
    expect(flat(screen.getByText(/parts égales/).textContent)).toContain('30 jetons chacun');
    await user.click(screen.getByRole('button', { name: 'Proposer l’assurance' }));
    expect(sent.at(-1)).toEqual({ type: 'PROPOSE_INSURANCE', partner: 'p2', insuranceType: 'SPLIT_50_50' });
    await user.click(screen.getByRole('radio', { name: /Le perdant ne paye pas/ }));
    await user.click(screen.getByRole('button', { name: 'Proposer l’assurance' }));
    expect(sent.at(-1)).toEqual({ type: 'PROPOSE_INSURANCE', partner: 'p2', insuranceType: 'LOSER_NOT_PAYING' });
  });
  it('plusieurs partenaires possibles : il faut choisir avant de proposer', async () => {
    const user = userEvent.setup();
    renderWith(<InsurancePanel />, ins({ eligible: ['p1', 'p2', 'p3'] }));
    expect(screen.getByRole('button', { name: 'Proposer l’assurance' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Bob' }));
    expect(screen.getByRole('button', { name: 'Proposer l’assurance' })).toBeEnabled();
  });
  it('partenaire déjà refusé (blockedPartners) : absent de la liste, un autre reste proposable', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<InsurancePanel />, ins({ eligible: ['p1', 'p2', 'p3'], blockedPartners: ['p2'] }));
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull(); // p2, bloqué pour moi : absent
    expect(screen.getByRole('radio', { name: 'Bob' })).toBeChecked(); // seul candidat restant : présélectionné
    await user.click(screen.getByRole('button', { name: 'Proposer l’assurance' }));
    expect(sent.at(-1)).toEqual({ type: 'PROPOSE_INSURANCE', partner: 'p3', insuranceType: 'SPLIT_50_50' });
  });
  it('tous les partenaires éligibles sont bloqués pour moi : rien à proposer', () => {
    const { container } = renderWith(<InsurancePanel />, ins({ blockedPartners: ['p2'] })); // seul p2 était éligible avec moi
    expect(container.textContent).toBe('');
  });
  it('destinataire : accepter ou refuser', async () => {
    const user = userEvent.setup();
    const { sent } = renderWith(<InsurancePanel />, ins({ canPropose: false, pending: { proposer: 'p2', partner: 'p1', type: 'LOSER_NOT_PAYING' } }));
    expect(screen.getByText(/vous propose une assurance/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accepter l’assurance' }));
    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(sent).toEqual([{ type: 'RESPOND_INSURANCE', accept: true }, { type: 'RESPOND_INSURANCE', accept: false }]);
  });
  it('proposant : attente, sans boutons de réponse', () => {
    renderWith(<InsurancePanel />, ins({ canPropose: false, pending: { proposer: 'p1', partner: 'p2', type: 'SPLIT_50_50' } }));
    expect(screen.getByText(/Proposition envoyée à Alice/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter l’assurance' })).toBeNull();
  });
  it('joueur non éligible : rien à afficher', () => {
    const { container } = renderWith(<InsurancePanel />, ins({ eligible: ['p2', 'p3'] }));
    expect(container.textContent).toBe('');
  });
});

describe('Plateau du Morpion : grille 3×3', () => {
  const BOARD9 = ['Ah', '5c', '6d', '9c', 'Tc', 'Jc', '2s', '3s', '4s'];
  it('affiche exactement 9 cartes, toutes visibles', () => {
    render(
      <SettingsProvider>
        <Board round={{ variant: 'MORPION', phase: 'SELECTION', awaiting: [], cards: { deckCount: 0, discardCount: 0, board: BOARD9, hands: {} }, info: {}, result: null } as any} />
      </SettingsProvider>,
    );
    const grid = screen.getByLabelText('Grille du morpion');
    expect(within(grid).getAllByRole('img')).toHaveLength(9);
  });
});

describe('Plateau du 6-3 : 3 plateaux indépendants de 5 cartes', () => {
  // 13 cartes visibles (ligne 1 entière + flop/turn des lignes 2 et 3), 2 cachées (rivers des lignes 2 et 3)
  const BOARD15 = ['Ah', 'Ks', 'Kd', '9c', '2c', '9d', 'Tc', '3d', '5h', null, '9s', 'Jc', '6h', '5c', null];
  const renderBoard = (line: number) =>
    render(
      <SettingsProvider>
        <Board round={{ variant: 'V6_3', phase: `LINE_${line}`, awaiting: [], cards: { deckCount: 0, discardCount: 0, board: BOARD15, hands: {} }, info: { line }, result: null } as any} />
      </SettingsProvider>,
    );

  it('affiche les 3 lignes, chacune avec ses 5 cartes propres', () => {
    renderBoard(1);
    expect(screen.getByLabelText('Ligne 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Ligne 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Ligne 3')).toBeInTheDocument();
  });

  it('13 cartes visibles, 2 emplacements vides (rivers non révélées des lignes 2 et 3) — quelle que soit la ligne en cours', () => {
    for (const line of [1, 2, 3]) {
      const { unmount } = renderBoard(line);
      const allImgs = screen.getAllByRole('img');
      const hidden = allImgs.filter((e) => /^River [23]$/.test(e.getAttribute('aria-label') ?? ''));
      expect(hidden).toHaveLength(2);
      expect(allImgs).toHaveLength(15);
      expect(allImgs.length - hidden.length).toBe(13);
      unmount();
    }
  });

  it('la river de la ligne 1 est une vraie carte, jamais un simple emplacement', () => {
    renderBoard(1);
    const line1 = within(screen.getByLabelText('Ligne 1'));
    expect(line1.getByRole('img', { name: '2 de trèfle' })).toBeInTheDocument(); // 5e carte de la ligne 1 = 2c
  });

  it('les rivers cachées affichent leur étiquette, jamais une valeur de carte', () => {
    renderBoard(1);
    expect(screen.getByRole('img', { name: 'River 2' }).textContent).toBe('River 2');
    expect(screen.getByRole('img', { name: 'River 3' }).textContent).toBe('River 3');
  });
});

describe('sièges : secret des cartes et statuts', () => {
  const base = { player: players(3)[1]!, isMe: false, target: 3, shown: [] as string[], hiddenCount: 0, active: false, validated: false, folded: false, insured: false, isChooser: false, score: 1 };
  it('cartes cachées d’un adversaire : uniquement des dos, jamais un nom de carte', () => {
    const { container } = renderWith(<Seat {...base} hiddenCount={5} />, null);
    expect(screen.getAllByRole('img', { name: 'Carte face cachée' })).toHaveLength(5);
    expect(container.innerHTML).not.toMatch(/ de (pique|cœur|carreau|trèfle)/);
  });
  it('cartes visibles montrées à côté des dos', () => {
    renderWith(<Seat {...base} shown={['9h']} hiddenCount={4} />, null);
    expect(screen.getByRole('img', { name: '9 de cœur' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Carte face cachée' })).toHaveLength(4);
  });
  it('statuts : hors ligne, exclu, couché, a validé, assuré', () => {
    const p = players(3)[1]!;
    renderWith(<Seat {...base} player={{ ...p, connected: false }} />, null);
    expect(screen.getByText('Hors ligne')).toBeInTheDocument();
    renderWith(<Seat {...base} player={{ ...p, excluded: true }} />, null);
    expect(screen.getByText('Exclu')).toBeInTheDocument();
    renderWith(<Seat {...base} folded insured validated />, null);
    expect(screen.getByText('Couché')).toBeInTheDocument();
    expect(screen.getByText('Assuré')).toBeInTheDocument();
  });
  it('« réfléchit… » pour un adversaire actif ; « À jouer » pour moi-même', () => {
    const a = renderWith(<Seat {...base} active isMe={false} />, null);
    expect(screen.getByText('réfléchit…')).toBeInTheDocument();
    expect(screen.queryByText('À jouer')).toBeNull();
    a.unmount();
    renderWith(<Seat {...base} active isMe />, null);
    expect(screen.getByText('À jouer')).toBeInTheDocument();
    expect(screen.queryByText('réfléchit…')).toBeNull();
  });
});
