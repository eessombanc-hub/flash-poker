import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WalletCard } from '../src/screens/Space';

const base = { balance: 5000, startingChips: 5000, threshold: 1000, refillTo: 2000, refillDelayMs: 7_200_000, nextRefillAt: null };

describe('Portefeuille', () => {
  it('solde suffisant : rappelle la règle de recharge', () => {
    render(<WalletCard wallet={base} />);
    expect(screen.getByTestId('wallet-balance').textContent).toMatch(/5\s?000/);
    expect(screen.getByText(/recharge à .*2\s?000.* après 2 h sans partie/)).toBeInTheDocument();
  });
  it('solde sous le seuil : annonce l’heure de la recharge', () => {
    render(<WalletCard wallet={{ ...base, balance: 400, nextRefillAt: Date.UTC(2026, 10, 8, 18, 30) }} />);
    expect(screen.getByText(/Solde sous .*1\s?000.* recharge à .*2\s?000/)).toBeInTheDocument();
  });
});
