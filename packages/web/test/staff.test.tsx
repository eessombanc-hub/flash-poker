import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountClient } from '../src/lib/account';
import { AccountProvider } from '../src/lib/context';
import { SettingsProvider } from '../src/lib/settings';
import { AnnouncementBanner, StaffScreen } from '../src/screens/Staff';

afterEach(() => sessionStorage.clear());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const mount = (ui: React.ReactElement, handler: Handler) => {
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => handler(url, init ?? {})) as unknown as typeof fetch;
  const client = new AccountClient({ baseUrl: '', fetchFn, storage: null });
  render(<SettingsProvider><AccountProvider account={client}>{ui}</AccountProvider></SettingsProvider>);
  return fetchFn as unknown as ReturnType<typeof vi.fn>;
};
const chat = { messages: [{ id: 7, at: 1_700_000_000_000, nickname: 'Bob', registered: true, text: 'message gênant', authorId: 'u-bob' }] };

describe('espace de l’équipe', () => {
  it('le jeton ouvre le panneau d’administration complet et n’est jamais affiché', async () => {
    const f = mount(<StaffScreen onBack={() => undefined} />, (url, init) => {
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer jeton-secret-de-test-123');
      if (url === '/staff/me') return json({ role: 'admin', name: 'Propriétaire', root: true });
      if (url === '/staff/chat') return json(chat);
      return json({});
    });
    await userEvent.type(screen.getByLabelText('Jeton d’administration'), 'jeton-secret-de-test-123');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('message gênant')).toBeInTheDocument();
    for (const t of ['Salon', 'Joueurs', 'Un bug ?', 'Annonce', 'Journal', 'Chiffres']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('jeton-secret-de-test-123');
    expect(f).toHaveBeenCalled();
  });

  it('un modérateur (session de compte) ne voit que le salon et les joueurs, et réduit un auteur au silence', async () => {
    let muted: unknown = null;
    const handler: Handler = (url, init) => {
      if (url === '/staff/me') return json({ role: 'moderator', name: 'Modo', root: false });
      if (url === '/staff/chat') return json(chat);
      if (url === '/staff/users/u-bob/mute' && init.method === 'POST') { muted = JSON.parse(init.body as string); return new Response(null, { status: 204 }); }
      return json({});
    };
    sessionStorage.setItem('poker.admin', 'jeton-moderateur-12345');
    mount(<StaffScreen onBack={() => undefined} />, handler);
    expect(await screen.findByText('message gênant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Journal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annonce' })).toBeNull();
    const li = screen.getByText('message gênant').closest('li')!;
    await userEvent.type(within(li).getByLabelText('Motif'), 'insultes');
    await userEvent.click(within(li).getByRole('button', { name: 'Réduire au silence' }));
    await waitFor(() => expect(muted).toEqual({ minutes: 10, reason: 'insultes' }));
  });

  it('un jeton refusé est affiché comme erreur et oublié', async () => {
    mount(<StaffScreen onBack={() => undefined} />, () => json({ error: { code: 'UNAUTHORIZED', message: 'Jeton ou session invalide' } }, 401));
    await userEvent.type(screen.getByLabelText('Jeton d’administration'), 'mauvais-jeton-1234567');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Jeton ou session invalide');
    expect(sessionStorage.getItem('poker.admin')).toBeNull();
  });

  it('le bandeau d’annonce s’affiche puis se masque pour la session', async () => {
    mount(<AnnouncementBanner />, () => json({ text: 'Maintenance ce soir à 22 h.' }));
    expect(await screen.findByText('Maintenance ce soir à 22 h.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Masquer l’annonce' }));
    expect(screen.queryByText('Maintenance ce soir à 22 h.')).toBeNull();
  });
});

describe('rubrique Administration de Mon espace', () => {
  const account = (role: 'user' | 'admin') => ({ id: 'u1', nickname: 'Emeric', avatar: null, email: 'e@x.fr', role, notifyEmail: false, createdAt: 1, club: null });
  const open = async (role: 'user' | 'admin', handler: Handler) => {
    const { Space } = await import('../src/screens/Space');
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => handler(url, init ?? {})) as unknown as typeof fetch;
    const client = new AccountClient({ baseUrl: '', fetchFn, storage: null });
    client.store.setState({ token: 't', account: account(role) as never, ready: true });
    const onStaff = vi.fn();
    render(<SettingsProvider><AccountProvider account={client}><Space onBack={() => undefined} initialTab={role === 'admin' ? 'admin' : 'defis'} onStaff={onStaff} /></AccountProvider></SettingsProvider>);
    return onStaff;
  };

  it('un administrateur voit le nombre de comptes créés et peut ouvrir le panneau', async () => {
    const onStaff = await open('admin', (url) => (url === '/staff/stats' ? json({ accounts: 1234, newThisWeek: 56, staff: 3, mutes: 1, bans: 0, feedbackOpen: 2 }) : json({})));
    const card = await screen.findByTestId('comptes-crees');
    await waitFor(() => expect(card.textContent).toMatch(/1\s?234/));
    expect(card).toHaveTextContent('Joueurs ayant créé un compte');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le panneau de gestion' }));
    expect(onStaff).toHaveBeenCalled();
  });

  it('un joueur ordinaire n’a pas cette rubrique', async () => {
    await open('user', () => json({}));
    expect(screen.getByRole('tab', { name: /Profil/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Administration' })).toBeNull();
  });
});
