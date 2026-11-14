import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountClient } from '../src/lib/account';
import { AccountProvider } from '../src/lib/context';
import { SettingsProvider } from '../src/lib/settings';
import { I18nProvider } from '../src/i18n';
import { Space } from '../src/screens/Space';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ME = { id: 'u1', nickname: 'Emeric', email: 'e@x.fr', avatar: 'or', role: 'user', notifyEmail: true, club: null };
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('appareils de confiance', () => {
  it('« faire confiance » conserve le jeton durablement ; sinon, le temps de l’onglet', async () => {
    const calls: unknown[] = [];
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')));
      return json({ token: 'tok-123', account: ME });
    }) as unknown as typeof fetch;
    const durable = mem();
    const short = mem();
    const c = new AccountClient({ fetchFn, storage: durable, sessionStorage: short });
    await c.login('Emeric', 'motdepasse', true);
    expect(durable.getItem('poker.account.v1')).toBe('tok-123');
    expect(short.getItem('poker.account.v1')).toBeNull();
    expect(calls[0]).toMatchObject({ remember: true });
    await c.login('Emeric', 'motdepasse', false);
    expect(durable.getItem('poker.account.v1')).toBeNull();
    expect(short.getItem('poker.account.v1')).toBe('tok-123');
    expect(new AccountClient({ fetchFn, storage: durable, sessionStorage: short }).token).toBe('tok-123');
    await c.logout();
    expect(short.getItem('poker.account.v1')).toBeNull();
  });

  it('Mon espace liste les appareils et déconnecte un appareil distant', async () => {
    const user = userEvent.setup();
    const devices = [
      { id: 'aaaaaaaaaaaaaaaa', label: 'Chrome sur Windows', createdAt: 1_790_000_000_000, lastSeen: 1_795_000_000_000, expiresAt: 1_803_000_000_000, trusted: true, current: true },
      { id: 'bbbbbbbbbbbbbbbb', label: 'Safari sur iOS', createdAt: 1_790_000_000_000, lastSeen: 1_794_000_000_000, expiresAt: 1_795_000_000_000, trusted: false, current: false },
    ];
    const deleted: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/me/devices' && (init?.method ?? 'GET') === 'GET') return json({ devices });
      if (url.startsWith('/me/devices/') && init?.method === 'DELETE') { deleted.push(url); devices.pop(); return json({ ok: true }); }
      if (url === '/me/recovery-code') return json({ exists: true });
      return json(ME);
    }) as unknown as typeof fetch;
    const client = new AccountClient({ fetchFn, storage: null });
    client.store.setState({ token: 't', account: ME as never, ready: true });
    render(
      <I18nProvider initial="fr">
        <SettingsProvider>
          <AccountProvider account={client}>
            <Space onBack={() => undefined} initialTab="profil" />
          </AccountProvider>
        </SettingsProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText('Chrome sur Windows')).toBeInTheDocument();
    expect(screen.getByText('Cet appareil')).toBeInTheDocument();
    expect(screen.getByText('Safari sur iOS')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Déconnecter Safari sur iOS' }));
    await waitFor(() => expect(deleted).toEqual(['/me/devices/bbbbbbbbbbbbbbbb']));
    await waitFor(() => expect(screen.queryByText('Safari sur iOS')).toBeNull());
  });
});
