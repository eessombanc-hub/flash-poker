import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FAQ, searchFaq } from '../src/faq/content';
import { I18nProvider } from '../src/i18n';
import { FaqScreen } from '../src/screens/Faq';

const show = (onFeedback?: () => void) => render(<I18nProvider initial="fr"><FaqScreen onBack={() => undefined} onFeedback={onFeedback} /></I18nProvider>);

describe('FAQ', () => {
  it('couvre les jeux, la progression et les données, sans question en double', () => {
    const qs = FAQ.flatMap((s) => s.items.map((i) => i.q));
    expect(new Set(qs).size).toBe(qs.length);
    expect(qs.length).toBeGreaterThanOrEqual(40);
    const ids = FAQ.map((s) => s.id);
    for (const id of ['regles', 'blackjack', 'tableau', 'progression', 'compte', 'aide']) expect(ids).toContain(id);
    for (const s of FAQ) for (const i of s.items) expect(i.a.every((p) => p.trim().length > 0)).toBe(true);
  });

  it('la recherche ignore accents et casse, et exige tous les mots', () => {
    expect(searchFaq('TETINES').flatMap((s) => s.items).length).toBeGreaterThan(0);
    expect(searchFaq('assurance 50').length).toBeGreaterThan(0);
    expect(searchFaq('zzzqqq')).toEqual([]);
  });

  it('affiche les rubriques, filtre à la frappe et renvoie vers « Un bug ? »', async () => {
    const onFeedback = vi.fn();
    show(onFeedback);
    expect(screen.getByRole('heading', { name: 'Règles du poker' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'grades');
    expect(screen.queryByRole('heading', { name: 'Règles du poker' })).toBeNull();
    expect(screen.getByText('Quels sont les grades ?')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzzqqq');
    expect(screen.getByRole('status')).toHaveTextContent('Aucune question');
    await userEvent.click(screen.getByRole('button', { name: 'Écrivez-nous' }));
    expect(onFeedback).toHaveBeenCalled();
  });
});
