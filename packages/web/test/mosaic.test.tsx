import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { GameClient } from '../src/lib/client';
import { parsePane } from '../src/lib/embed';
import { MemorySessionStore } from '../src/lib/session';
import { TableSlots } from '../src/lib/slots';
import { Mosaic } from '../src/screens/Mosaic';

const session = (code: string) => ({ code, token: `tok-${code}`, playerId: 'p1', nickname: 'Emeric' });
function slotsWith(codes: Array<string | null>) {
  const stores = codes.map((c) => {
    const s = new MemorySessionStore();
    if (c) s.save(session(c));
    return s;
  });
  const clients = stores.map((storage) => {
    const c = new GameClient({ storage });
    c.resume = () => false;
    c.dispose = vi.fn();
    return c;
  });
  return { slots: new TableSlots(clients), stores, clients };
}
const show = (slots: TableSlots) => {
  const props = { onClose: vi.fn(), onOpen: vi.fn() };
  render(
    <I18nProvider initial="fr">
      <Mosaic slots={slots} onClose={() => props.onClose()} onOpen={(x) => props.onOpen(x)} />
    </I18nProvider>,
  );
  return props;
};

describe('cadre intégré', () => {
  it('lit le paramètre pane, seulement dans un cadre', () => {
    expect(parsePane('?pane=poker:2', true)).toEqual({ kind: 'poker', slot: 2 });
    expect(parsePane('?pane=blackjack', true)).toEqual({ kind: 'blackjack' });
    expect(parsePane('?pane=tableau:TB-AB12', true)).toEqual({ kind: 'tableau', code: 'TB-AB12' });
    expect(parsePane('?pane=poker:2', false)).toBeNull();
    expect(parsePane('?pane=poker:9', true)).toBeNull();
    expect(parsePane('?pane=tableau:<x>', true)).toBeNull();
    expect(parsePane('', true)).toBeNull();
  });
});

describe('vue mosaïque', () => {
  it('affiche chaque table dans son cadre, tous jeux confondus, et coupe les connexions de la page', () => {
    const { slots, clients } = slotsWith(['POKER-AAAA', null, 'POKER-BBBB', null]);
    act(() => slots.setExternalTables([{ game: 'blackjack', code: 'BJ-1' }, { game: 'tableau', code: 'TB-2' }]));
    show(slots);
    const frames = document.querySelectorAll('iframe');
    expect([...frames].map((f) => new URL(f.getAttribute('src')!, 'http://x').search)).toEqual(['?pane=poker%3A0', '?pane=poker%3A2', '?pane=blackjack', '?pane=tableau%3ATB-2']);
    expect(screen.getByText('4/4')).toBeInTheDocument();
    for (const c of clients) expect(c.dispose).toHaveBeenCalled();
  });

  it('plafonne à quatre tables, et invite à en ouvrir une seconde quand il y en a moins de deux', () => {
    const { slots } = slotsWith(['POKER-AAAA', 'POKER-BBBB', 'POKER-CCCC', 'POKER-DDDD']);
    act(() => slots.setExternalTables([{ game: 'blackjack', code: 'BJ-1' }]));
    show(slots);
    expect(document.querySelectorAll('iframe')).toHaveLength(4);
  });
  it('une seule table : message explicatif, pas de cadre', () => {
    const { slots } = slotsWith(['POKER-AAAA', null, null, null]);
    show(slots);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(screen.getByText(/au moins deux tables/)).toBeInTheDocument();
  });

  it('« Agrandir » et la demande d’un cadre ouvrent la table en plein écran ; quitter ferme', async () => {
    const user = userEvent.setup();
    const { slots } = slotsWith(['POKER-AAAA', 'POKER-BBBB', null, null]);
    const props = show(slots);
    await user.click(screen.getByRole('button', { name: 'Agrandir Poker POKER-BBBB' }));
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'poker:1', game: 'poker', code: 'POKER-BBBB' }));
    props.onOpen.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'mosaic:focus', pane: 'poker:0' }, origin: window.location.origin }));
    });
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'poker:0' }));
    props.onOpen.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'mosaic:focus', pane: 'poker:1' }, origin: 'https://autre.example' }));
    });
    expect(props.onOpen).not.toHaveBeenCalled();
    await user.click(within(document.body).getByRole('button', { name: /Quitter la mosaïque/ }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('une table quittée dans un cadre est oubliée par la page ; la fermeture reprend les connexions', () => {
    const { slots, clients, stores } = slotsWith(['POKER-AAAA', 'POKER-BBBB', null, null]);
    const resume = vi.fn(() => false);
    clients.forEach((c) => (c.resume = resume));
    const { unmount } = render(
      <I18nProvider initial="fr">
        <Mosaic slots={slots} onClose={vi.fn()} onOpen={vi.fn()} />
      </I18nProvider>,
    );
    stores[1]!.clear(); // le cadre a quitté la table
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'mosaic:gone', pane: 'poker:1' }, origin: window.location.origin }));
    });
    expect(clients[1]!.state.session).toBeNull();
    expect(clients[0]!.state.session?.code).toBe('POKER-AAAA');
    unmount();
    expect(resume).toHaveBeenCalledTimes(4);
  });

  it('un cadre intégré ne tient que son emplacement', () => {
    const { clients } = slotsWith(['POKER-AAAA', 'POKER-BBBB', null, null]);
    const frame = new TableSlots(clients, 1);
    expect(frame.active).toBe(1);
    const resume = vi.fn(() => false);
    clients.forEach((c) => (c.resume = resume));
    frame.resumeAll();
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
