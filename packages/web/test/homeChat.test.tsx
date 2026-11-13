import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeChat } from '../src/components/HomeChat';
import { ClientProvider } from '../src/lib/context';
import { SettingsProvider } from '../src/lib/settings';
import { fakeClient } from './fixtures';

describe('chat public de l’accueil', () => {
  it('affiche les messages reçus et envoie un message sous le pseudo choisi', async () => {
    const { client } = fakeClient(null);
    const msg = { id: 1, nickname: 'Alice', text: 'Bonsoir la table', at: Date.now(), registered: true, avatar: null };
    client.chatList = vi.fn().mockResolvedValue({ messages: [msg], last: 1 });
    const post = vi.fn().mockResolvedValue({ id: 2, nickname: 'Invité', text: 'Salut', at: Date.now(), registered: false, avatar: null });
    client.chatPost = post;
    render(
      <SettingsProvider>
        <ClientProvider client={client}>
          <HomeChat />
        </ClientProvider>
      </SettingsProvider>,
    );
    expect(await screen.findByText('Bonsoir la table')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Votre pseudo'), 'Invité');
    await userEvent.type(screen.getByPlaceholderText('Votre message'), 'Salut');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ text: 'Salut', nickname: 'Invité' }));
    expect(await screen.findByText('Salut')).toBeInTheDocument();
  });
});
