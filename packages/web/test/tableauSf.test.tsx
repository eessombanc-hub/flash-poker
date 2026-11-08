import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsTable } from '../src/components/tableau/Board';
import { I18nProvider } from '../src/i18n';
import type { TbGameDto } from '../src/lib/types';

describe('Tableau — fin sur une quinte flush', () => {
  it('le détail des colonnes ne s’affiche pas quand aucune colonne n’a pu être comparée', () => {
    const dto = { you: 0, players: [null, null], result: { columns: [], straightFlush: null, score: [0, 0], ties: 0, winner: 0 } } as unknown as TbGameDto;
    const { container } = render(
      <I18nProvider initial="fr">
        <ResultsTable dto={dto} />
      </I18nProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
