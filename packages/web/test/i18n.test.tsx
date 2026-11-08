import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { DICTS, I18nProvider, LANGS, useI18n, type Lang } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import { adviceText, cardName, errorText, handLabel, partialLabel } from '../src/lib/tbText';
import { ApiError } from '../src/lib/api';
import { GameClient } from '../src/lib/client';
import { ClientProvider } from '../src/lib/context';
import { MemorySessionStore } from '../src/lib/session';

const keys = Object.keys(fr).sort();
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('dictionnaires', () => {
  for (const { id } of LANGS) {
    it(`${id} : mêmes clés que le français, aucune valeur vide hors cas prévus, mêmes paramètres`, () => {
      const d = DICTS[id] as Record<string, string>;
      expect(Object.keys(d).sort()).toEqual(keys);
      for (const k of keys) {
        if (k !== 'rank.numPlural') expect(d[k], `${id}:${k}`).not.toBe('');
        expect(placeholders(d[k]!), `${id}:${k}`).toEqual(placeholders((fr as Record<string, string>)[k]!));
      }
    });
  }
});

function lab(lang: Lang) {
  let i18n!: ReturnType<typeof useI18n>;
  function Grab() {
    i18n = useI18n();
    return null;
  }
  render(
    <I18nProvider initial={lang}>
      <Grab />
    </I18nProvider>,
  );
  return i18n;
}

describe('libellés des combinaisons', () => {
  const pair = { category: 1, cards: ['Kh', 'Kd', 'As', '5c', '2s'] } as never;
  const twoPair = { category: 2, cards: ['Ah', 'Ad', '9s', '9c', '2d'] } as never;
  const straight = { category: 4, cards: ['Qh', 'Jd', 'Ts', '9c', '8d'] } as never;
  const wheel = { category: 4, cards: ['5h', '4d', '3s', '2c', 'Ad'] } as never;
  it('français : élisions et accords', () => {
    const i = lab('fr');
    expect(handLabel(i, pair)).toBe('Paire de rois');
    expect(handLabel(i, twoPair)).toBe('Double paire d’as et de 9');
    expect(handLabel(i, straight)).toBe('Quinte à la dame');
    expect(handLabel(i, wheel)).toBe('Quinte au 5 (roue)');
  });
  it('anglais, espagnol, allemand, italien', () => {
    expect(handLabel(lab('en'), pair)).toBe('Pair of kings');
    expect(handLabel(lab('en'), twoPair)).toBe('Two pair, aces and 9s');
    expect(handLabel(lab('es'), pair)).toBe('Pareja de reyes');
    expect(handLabel(lab('de'), pair)).toBe('Paar Könige');
    expect(handLabel(lab('de'), twoPair)).toBe('Zwei Paare: Asse und 9er');
    expect(handLabel(lab('it'), pair)).toBe('Coppia di re');
  });
  it('colonnes en construction', () => {
    const en = lab('en');
    expect(partialLabel(en, [])).toBe('Empty column');
    expect(partialLabel(en, ['Kh', 'Kd'])).toBe('Pair of kings');
    expect(partialLabel(en, ['2h', '9h'])).toBe('2 suited cards: flush possible');
    expect(partialLabel(en, ['5h', '6d', '8c'])).toBe('3 connected cards: straight possible');
    expect(partialLabel(lab('fr'), ['Ah', 'Ad'])).toBe('Paire d’as');
  });
  it('cartes et conseils', () => {
    const en = lab('en');
    expect(cardName(en, 'Kh')).toBe('King ♥');
    expect(cardName(lab('de'), 'Qs')).toBe('Dame ♠');
    expect(adviceText(en, { col: 1, card: 'Kh', kind: 'improve', after: null, afterCodes: ['Kd', 'Kh'] }, true)).toBe('Place the King ♥ from your hand in column 2: it becomes “Pair of kings”.');
    expect(adviceText(lab('fr'), { col: 0, card: '7c', kind: 'empty', after: null }, false)).toBe('Placez la carte 7 ♣ en colonne 1 : c’est une colonne encore vide.');
  });
  it('erreurs de l’API traduites', () => {
    expect(errorText(lab('en'), new ApiError('CONFLICT', 'Une partie amicale est déjà en cours (TB-ABCD).', 'TB_FRIENDLY_ACTIVE'))).toBe('A friendly game is already in progress (TB-ABCD).');
    expect(errorText(lab('es'), new ApiError('NETWORK', 'Impossible de joindre le serveur.'))).toMatch(/servidor/);
    expect(errorText(lab('it'), new ApiError('NOT_YOUR_TURN', 'Ce n’est pas votre tour'))).toBe('Non è il tuo turno.');
    expect(errorText(lab('fr'), new ApiError('X', 'Message du serveur'))).toBe('Message du serveur');
  });
});

describe('sélecteur de langue', () => {
  it('change la langue de l’accueil et la mémorise', async () => {
    const user = userEvent.setup();
    const client = new GameClient({ storage: new MemorySessionStore() });
    client.resume = () => false;
    client.dispose = () => undefined;
    client.listRooms = async () => [];
    render(
      <ClientProvider client={client}>
        <App />
      </ClientProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: /Le poker entre amis/ })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Langue' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Français', 'English', 'Español', 'Deutsch', 'Italiano']);
    await user.selectOptions(select, 'en');
    expect(await screen.findByRole('heading', { level: 1, name: /Poker with friends/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a game' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('flashpoker.lang')).toBe('en');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de');
    expect(await screen.findByRole('button', { name: 'Partie erstellen' })).toBeInTheDocument();
  });
});
