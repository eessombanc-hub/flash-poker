import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LEGAL_HASH, legalFromHash, type LegalPage } from '../src/legal/config';
import { LegalScreen } from '../src/screens/Legal';
import { renderWith } from './fixtures';

function Harness({ start = 'mentions' as LegalPage }) {
  const [p, setP] = useState<LegalPage>(start);
  return <LegalScreen page={p} onPage={setP} onBack={() => undefined} />;
}

describe('pages légales', () => {
  it('trois pages accessibles par onglets, avec la page active signalée', async () => {
    renderWith(<Harness />, null);
    expect(screen.getByRole('heading', { name: 'Mentions légales' })).toBeInTheDocument();
    expect(screen.getByText(/Vercel Inc\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Politique de confidentialité' }));
    expect(screen.getByRole('heading', { name: 'Politique de confidentialité' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cnil.fr/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Politique de confidentialité' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Cookies et stockage local' }));
    expect(screen.getByText(/aucun cookie de mesure d’audience/)).toBeInTheDocument();
  });
  it('les adresses #… ouvrent la bonne page, les autres sont ignorées', () => {
    expect(legalFromHash(LEGAL_HASH.privacy)).toBe('privacy');
    expect(legalFromHash('#Cookies')).toBe('cookies');
    expect(legalFromHash('#reset=abc')).toBeNull();
    expect(legalFromHash('')).toBeNull();
  });
});
