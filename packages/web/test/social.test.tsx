import { act, fireEvent, screen } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatDock } from '../src/components/Social';
import { GameClient } from '../src/lib/client';
import { MemorySessionStore } from '../src/lib/session';
import type { SocialMessage } from '../src/lib/types';
import { game, renderWith, roomView } from './fixtures';

const msg = (over: Partial<SocialMessage>): SocialMessage => ({ type: 'social', roomCode: 'POKER-ABCD', id: 'POKER-ABCD-1', at: 1, from: 'p2', kind: 'chat', text: 'Salut', ...over });

beforeEach(() => localStorage.clear());

describe('client : messages de la table', () => {
  function connected() {
    const handlers: Record<string, (m: unknown) => void> = {};
    const emitted: { event: string; payload: unknown }[] = [];
    let ack: unknown = { ok: true };
    const socket = {
      connected: true,
      on: (e: string, h: (m: unknown) => void) => ((handlers[e] = h), socket),
      timeout: () => ({ emit: (event: string, payload: unknown, cb: (e: Error | null, a?: unknown) => void) => (emitted.push({ event, payload }), cb(null, ack)) }),
      disconnect: () => undefined,
    };
    const storage = new MemorySessionStore();
    storage.save({ code: 'POKER-ABCD', token: 'tok', playerId: 'p1', nickname: 'Emeric' });
    const client = new GameClient({ storage, socketFactory: () => socket as unknown as Socket });
    client.resume();
    return { client, handlers, emitted, setAck: (a: unknown) => (ack = a) };
  }

  it('conserve les messages de la salle, sans doublon, et ignore ceux d’une autre salle', () => {
    const { client, handlers } = connected();
    handlers.social!(msg({}));
    handlers.social!(msg({}));
    handlers.social!(msg({ id: 'X-2', roomCode: 'POKER-ZZZZ' }));
    expect(client.state.social.map((m) => m.id)).toEqual(['POKER-ABCD-1']);
  });

  it('envoie sur l’événement « social » ; un refus du serveur devient une notification', async () => {
    const { client, emitted, setAck } = connected();
    expect(await client.sendSocial({ kind: 'throw', item: 'pie', to: 'p2' })).toBe(true);
    expect(emitted[0]).toEqual({ event: 'social', payload: { kind: 'throw', item: 'pie', to: 'p2' } });
    setAck({ ok: false, error: { code: 'RATE_LIMITED', message: 'Trop de messages' } });
    expect(await client.sendSocial({ kind: 'chat', text: 'a' })).toBe(false);
    expect(client.state.toasts.at(-1)?.tone).toBe('error');
  });
});

describe('panneau de chat', () => {
  const view = () => roomView({}, game());

  it('s’ouvre, affiche les messages et envoie un texte nettoyé de ses espaces', async () => {
    const { client } = renderWith(<ChatDock canThrow />, view());
    const sent: unknown[] = [];
    client.sendSocial = async (i) => (sent.push(i), true);
    act(() => client.store.setState({ social: [msg({ text: 'Bien joué' })] }));
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }));
    expect(await screen.findByText('Bien joué')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: '  Merci  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await act(async () => undefined);
    expect(sent).toEqual([{ kind: 'chat', text: 'Merci' }]);
  });

  it('lance l’objet choisi vers le joueur choisi, jamais vers soi-même', async () => {
    const { client } = renderWith(<ChatDock canThrow />, view());
    const sent: unknown[] = [];
    client.sendSocial = async (i) => (sent.push(i), true);
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }));
    const to = screen.getByLabelText('Destinataire') as HTMLSelectElement;
    expect([...to.options].map((o) => o.textContent)).toEqual(['Alice', 'Bob']);
    fireEvent.click(screen.getByRole('radio', { name: 'une tarte à la crème' }));
    fireEvent.change(to, { target: { value: 'p3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await act(async () => undefined);
    expect(sent).toEqual([{ kind: 'throw', item: 'pie', to: 'p3' }]);
  });

  it('salle d’attente : pas d’objets ; « Masquer les messages » cache le chat et le mémorise', () => {
    const { client } = renderWith(<ChatDock canThrow={false} />, view());
    act(() => client.store.setState({ social: [msg({ text: 'Coucou' })] }));
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }));
    expect(screen.queryByLabelText('Destinataire')).toBeNull();
    expect(screen.getByText('Coucou')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Masquer les messages'));
    expect(screen.queryByText('Coucou')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fp.social')!)).toMatchObject({ hideChat: true });
  });

  it('pastille de messages non lus tant que le panneau est fermé', () => {
    const { client } = renderWith(<ChatDock canThrow />, view());
    act(() => client.store.setState({ social: [msg({ id: 'a' }), msg({ id: 'b', text: 'Deux' })] }));
    expect(screen.getByRole('button', { name: 'Chat, 2 non lus' })).toBeTruthy();
  });
});
