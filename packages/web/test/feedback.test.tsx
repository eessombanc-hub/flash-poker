import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackList, FeedbackScreen } from '../src/screens/Feedback';
import { AccountClient } from '../src/lib/account';
import { render } from '@testing-library/react';
import { AccountProvider } from '../src/lib/context';
import { SettingsProvider } from '../src/lib/settings';

const show = (ui: React.ReactElement, account: AccountClient) => render(<SettingsProvider><AccountProvider account={account}>{ui}</AccountProvider></SettingsProvider>);
const mkClient = (fetchFn: typeof fetch) => new AccountClient({ baseUrl: '', fetchFn, storage: null });
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Un bug ?', () => {
  it('le bouton reste inactif tant que le message est trop court, puis envoie et confirme', async () => {
    const fetchFn = vi.fn(async () => ok({ id: 'x' }, 201)) as unknown as typeof fetch;
    show(<FeedbackScreen from="home" onBack={() => undefined} />, mkClient(fetchFn));
    const send = screen.getByRole('button', { name: 'Envoyer' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Votre message'), 'court');
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Une idée' }));
    await userEvent.type(screen.getByLabelText('Votre message'), ' mais finalement assez long');
    await userEvent.click(send);
    await waitFor(() => expect(screen.getByText('Message envoyé')).toBeInTheDocument());
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/feedback');
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: 'idea', where: 'home' });
  });

  it('affiche l’erreur du serveur sans perdre le texte', async () => {
    const fetchFn = vi.fn(async () => ok({ error: { code: 'RATE_LIMITED', message: 'Trop de messages' } }, 429)) as unknown as typeof fetch;
    show(<FeedbackScreen from="home" onBack={() => undefined} />, mkClient(fetchFn));
    await userEvent.type(screen.getByLabelText('Votre message'), 'Un message suffisamment long');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de messages');
    expect(screen.getByLabelText('Votre message')).toHaveValue('Un message suffisamment long');
  });

  it('administration : messages listés avec le jeton, marquage traité', async () => {
    const item = { id: 'a1', createdAt: 1_700_000_000_000, kind: 'bug', message: 'Écran noir au tour 3', contact: 'ana@x.fr', nickname: 'Ana', context: 'écran table', status: 'open' };
    let status = 'open';
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer jeton-de-test-1234567');
      if (init?.method === 'POST') { status = 'done'; return new Response(null, { status: 204 }); }
      return ok({ items: [{ ...item, status }] });
    }) as unknown as typeof fetch;
    show(<FeedbackList token="jeton-de-test-1234567" />, mkClient(fetchFn));
    expect(await screen.findByText('Écran noir au tour 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marquer traité' }));
    await waitFor(() => expect(screen.queryByText('Écran noir au tour 3')).not.toBeInTheDocument());
    sessionStorage.clear();
  });
});
