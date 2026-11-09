import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FitToScreen } from '../src/components/FitToScreen';

describe('FitToScreen', () => {
  it('affiche toujours son contenu, sans réduction quand la place manque de mesure (aucune mise en page réelle)', () => {
    const { container } = render(
      <FitToScreen>
        <p>Contenu</p>
      </FitToScreen>,
    );
    expect(screen.getByText('Contenu')).toBeInTheDocument();
    expect(container.querySelector('[data-fit-scale]')).toBeNull();
  });
  it('désactivé : contenu inchangé', () => {
    const { container } = render(
      <FitToScreen enabled={false}>
        <p>Résultat</p>
      </FitToScreen>,
    );
    expect(screen.getByText('Résultat')).toBeInTheDocument();
    expect(container.querySelector('[data-fit-scale]')).toBeNull();
  });
});
