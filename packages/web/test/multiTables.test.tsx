import { describe, expect, it } from 'vitest';
import { GameClient } from '../src/lib/client';
import { MemorySessionStore } from '../src/lib/session';
import { MAX_TABLES, TableSlots } from '../src/lib/slots';

const make = () => new TableSlots(Array.from({ length: MAX_TABLES }, () => new GameClient({ storage: new MemorySessionStore() })));
const sit = (s: TableSlots, i: number) => s.clients[i]!.store.setState({ session: { code: `POKER-000${i}`, token: 't', playerId: 'p', nickname: 'n' } });

describe('tables multiples', () => {
  it('prend un emplacement libre quand la table affichée est occupée', () => {
    const s = make();
    sit(s, 0);
    expect(s.focusFree()).toBe(true);
    expect(s.active).toBe(1);
  });
  it('refuse une cinquième table, tous jeux confondus', () => {
    const s = make();
    sit(s, 0);
    sit(s, 1);
    s.setExternal(2);
    expect(s.total()).toBe(4);
    expect(s.canOpen()).toBe(false);
    expect(s.focusFree()).toBe(false);
  });
  it('compte les tables hors poker dans le plafond', () => {
    const s = make();
    s.setExternal(3);
    sit(s, 0);
    s.setActive(1);
    expect(s.focusFree()).toBe(false);
  });
  it('rend la place quand une table est quittée', () => {
    const s = make();
    for (let i = 0; i < 4; i++) sit(s, i);
    expect(s.canOpen()).toBe(false);
    s.clients[2]!.leave();
    expect(s.canOpen()).toBe(true);
    s.setActive(0);
    expect(s.focusFree()).toBe(true);
    expect(s.active).toBe(2);
  });
  it('le client refuse de créer une table quand le plafond est atteint', async () => {
    const c = new GameClient({ storage: new MemorySessionStore(), beforeNewTable: () => { throw new Error('limite'); } });
    await expect(c.createRoom({} as never)).rejects.toThrow('limite');
    await expect(c.joinRoom('X', {} as never)).rejects.toThrow('limite');
  });
});
