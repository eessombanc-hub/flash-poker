import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { Avatar, AvatarPicker } from '../src/components/ui';
import { DEFAULT_SPEC, PART_COUNTS, AVATAR_PARTS, encodeAvatar, isCustomAvatar, parseAvatar, randomSpec } from '../src/lib/avatarSpec';

const SERVER_RULE = /^[a-z0-9_-]{1,32}$/;

describe('Codes d’avatar personnalisé', () => {
  it('l’encodage est réversible et respecte la règle de validation du serveur', () => {
    const code = encodeAvatar(DEFAULT_SPEC);
    expect(code).toMatch(SERVER_RULE);
    expect(parseAvatar(code)).toEqual(DEFAULT_SPEC);
    for (let i = 0; i < 200; i++) {
      const spec = randomSpec();
      const c = encodeAvatar(spec);
      expect(c).toMatch(SERVER_RULE);
      expect(parseAvatar(c)).toEqual(spec);
    }
  });

  it('refuse les codes invalides et ne confond pas un préréglage avec un avatar personnalisé', () => {
    for (const bad of ['', 'or', 'emeraude', 'm1234567', 'm123456789', 'm12345678x', 'm88888888', 'm00060000', 'M01234567']) {
      expect(parseAvatar(bad)).toBeNull();
    }
    expect(isCustomAvatar('or')).toBe(false);
    expect(isCustomAvatar(null)).toBe(false);
    expect(isCustomAvatar('m01234567')).toBe(true);
  });

  it('le tirage au hasard reste dans les bornes, même aux extrêmes', () => {
    for (const r of [0, 0.9999999]) {
      const spec = randomSpec(() => r);
      for (const p of AVATAR_PARTS) expect(spec[p]).toBeLessThan(PART_COUNTS[p]);
    }
  });
});

describe('Avatar affiché', () => {
  it('dessine un visage SVG pour un code personnalisé et des initiales pour un préréglage', () => {
    const { container, rerender } = render(<I18nProvider initial="fr"><Avatar nickname="Emeric" avatar="m11100000" /></I18nProvider>);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
    rerender(<I18nProvider initial="fr"><Avatar nickname="Emeric" avatar="or" /></I18nProvider>);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('EM');
  });

  it('un code invalide retombe sur un préréglage, sans erreur', () => {
    const { container } = render(<I18nProvider initial="fr"><Avatar nickname="Zoé" avatar="m99999999" /></I18nProvider>);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toBe('');
  });
});

function Harness({ start = 'or' }: { start?: string }) {
  const [v, setV] = useState(start);
  return (
    <I18nProvider initial="fr">
      <AvatarPicker value={v} onChange={setV} />
      <output data-testid="valeur">{v}</output>
    </I18nProvider>
  );
}

describe('Atelier d’avatar', () => {
  it('permet de créer son avatar, de choisir une coiffure et de terminer', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Créer mon avatar' }));
    expect(screen.getByTestId('valeur').textContent).toBe(encodeAvatar(DEFAULT_SPEC));
    expect(screen.getByRole('group', { name: 'Atelier d’avatar' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Coiffure' }));
    await user.click(screen.getByRole('radio', { name: 'Coiffure, option 3' }));
    expect(parseAvatar(screen.getByTestId('valeur').textContent)?.hair).toBe(2);

    await user.click(screen.getByRole('radio', { name: 'Fond' }));
    await user.click(screen.getByRole('radio', { name: 'Fond, option 8' }));
    expect(parseAvatar(screen.getByTestId('valeur').textContent)?.background).toBe(7);

    await user.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(screen.queryByRole('group', { name: 'Atelier d’avatar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Modifier mon avatar' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mon avatar' })).toBeChecked();
  });

  it('« Au hasard » produit un code valide, et un préréglage reste choisissable', async () => {
    const user = userEvent.setup();
    render(<Harness start="m01234567" />);
    await user.click(screen.getByRole('button', { name: 'Modifier mon avatar' }));
    await user.click(screen.getByRole('button', { name: 'Au hasard' }));
    expect(parseAvatar(screen.getByTestId('valeur').textContent)).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Avatar saphir' }));
    expect(screen.getByTestId('valeur').textContent).toBe('saphir');
    expect(screen.queryByRole('radio', { name: 'Mon avatar' })).toBeNull();
  });
});
