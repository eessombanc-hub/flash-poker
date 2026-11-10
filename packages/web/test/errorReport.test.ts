import { afterEach, describe, expect, it, vi } from 'vitest';
import { installErrorReporting, reportError } from '../src/lib/errorReport';

afterEach(() => vi.unstubAllGlobals());

describe('Signalement des erreurs du navigateur', () => {
  it('envoie chaque erreur une seule fois, au plus cinq par session', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    const sent = new Set<string>();
    expect(reportError('', 'boom', 'stack', '/x', sent)).toBe(true);
    expect(reportError('', 'boom', 'stack', '/x', sent)).toBe(false);
    for (let i = 0; i < 10; i++) reportError('', `e${i}`, '', '/x', sent);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  it('écoute les erreurs et les promesses rejetées', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    const handlers: Record<string, (e: unknown) => void> = {};
    installErrorReporting('https://jeu.test', { addEventListener: (t: string, h: unknown) => void (handlers[t] = h as (e: unknown) => void), location: { pathname: '/', hash: '#/tableau' } } as never);
    handlers.error!({ message: 'plantage', error: new Error('plantage') });
    handlers.unhandledrejection!({ reason: new Error('refusée') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toMatchObject({ message: 'plantage', where: '/#/tableau' });
  });
});
