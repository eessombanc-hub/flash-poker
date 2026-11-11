import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { Variants } from '../src/screens/Variants';
import { VARIANT_META } from '../src/lib/variantInfo';
import { VARIANTS } from '../src/lib/labels';

function renderVariants(over: Partial<Parameters<typeof Variants>[0]> = {}) {
  const props = { onBack: vi.fn(), onPlaySolo: vi.fn(), onCreate: vi.fn(), onLogin: vi.fn(), ...over };
  render(
    <I18nProvider initial="fr">
      <Variants {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('Écran Variantes', () => {
  it('une fiche par variante, jamais de statistiques inventées pour un invité', () => {
    renderVariants();
    const list = screen.getByRole('list', { name: 'Variantes' });
    expect(within(list).getAllByRole('heading', { level: 2 })).toHaveLength(VARIANTS.length);
    expect(Object.keys(VARIANT_META).sort()).toEqual(VARIANTS.map((v) => v.id).sort());
    expect(within(list).getAllByText('Connectez-vous pour suivre vos manches')).toHaveLength(VARIANTS.length);
    expect(screen.getByText(/Connectez-vous pour enregistrer vos manches/)).toBeInTheDocument();
  });

  it('la fiche présente les règles, la difficulté, les joueurs et la durée, et lance une partie', async () => {
    const user = userEvent.setup();
    const props = renderVariants();
    await user.click(screen.getByRole('button', { name: '6-3' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Règles essentielles')).toBeInTheDocument();
    expect(within(dialog).getByText('Exigeante')).toBeInTheDocument();
    expect(within(dialog).getByText('2 à 6 joueurs')).toBeInTheDocument();
    expect(within(dialog).getByText('Environ 5 min par manche')).toBeInTheDocument();
    expect(within(dialog).getByText(/Connectez-vous pour suivre votre progression/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Jouer seul' }));
    expect(props.onPlaySolo).toHaveBeenCalledWith('V6_3');
  });

  it('Le 10 plafonne à 5 joueurs, comme le moteur', async () => {
    const user = userEvent.setup();
    renderVariants();
    await user.click(screen.getByRole('button', { name: 'Le 10' }));
    expect(within(await screen.findByRole('dialog')).getByText('2 à 5 joueurs')).toBeInTheDocument();
  });
});
