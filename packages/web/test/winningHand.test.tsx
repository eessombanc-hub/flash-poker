import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoundList } from '../src/screens/Overlays';
import { I18nProvider } from '../src/i18n';
import type { RoundRecord } from '../src/lib/types';

const record = (summary: RoundRecord['summary']): RoundRecord =>
  ({
    roundNo: 2,
    chooser: 'p1',
    variant: 'HOLDEM',
    result: { kind: 'WINNER', winner: 'p1' },
    award: { kind: 'POINTS', winner: 'p1', points: 1 },
    points: { p1: 1, p2: 0 },
    scoresAfter: { p1: 1, p2: 0 },
    summary,
  }) as unknown as RoundRecord;

const show = (r: RoundRecord) =>
  render(
    <I18nProvider initial="fr">
      <RoundList history={[r]} nameOf={(id) => (id === 'p1' ? 'Ana' : 'Bob')} />
    </I18nProvider>,
  );

describe('combinaison gagnante à chaque manche', () => {
  it('une main ordinaire (brelan) est nommée dans le récapitulatif, pas seulement la quinte flush', () => {
    show(record({ hands: { p1: { cards: ['Ah', 'Ad', 'As', 'Kc', '2d'], category: 3 }, p2: { cards: ['9h', '9d', '4s', '5c', '7d'], category: 1 } } }));
    expect(screen.getByText(/Brelan/i)).toBeInTheDocument();
  });

  it('une manche gagnée par abandon l’indique', () => {
    show(record({ byFold: true }));
    expect(screen.getByText(/couch/i)).toBeInTheDocument();
  });
});
