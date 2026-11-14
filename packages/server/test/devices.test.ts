import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService, deviceLabel } from '../src/accounts/service';

const DAY = 24 * 3_600_000;
function setup() {
  const clock = { t: 1_800_000_000_000 };
  const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(true, () => undefined), { now: () => clock.t, log: () => undefined });
  return { accounts, clock };
}
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1';

describe('appareils de confiance', () => {
  it('libellé lisible sans conserver le User-Agent', () => {
    expect(deviceLabel(CHROME_WIN)).toBe('Chrome sur Windows');
    expect(deviceLabel(SAFARI_IOS)).toBe('Safari sur iOS');
    expect(deviceLabel(undefined)).toBe('Navigateur');
  });

  it("un appareil de confiance reste connecté 90 jours et se prolonge à l'usage", async () => {
    const { accounts, clock } = setup();
    const r = await accounts.register({ nickname: 'Emeric', email: 'e@x.fr', password: 'tapis-vert-42' }, CHROME_WIN);
    clock.t += 80 * DAY;
    expect(accounts.userBySession(r.token)).not.toBeNull();
    clock.t += 80 * DAY; // 160 jours au total, mais prolongé à J+80
    expect(accounts.userBySession(r.token)).not.toBeNull();
    clock.t += 91 * DAY;
    expect(accounts.userBySession(r.token)).toBeNull();
  });

  it('sans confiance : une journée, sans prolongation', async () => {
    const { accounts, clock } = setup();
    await accounts.register({ nickname: 'Emeric', email: 'e@x.fr', password: 'tapis-vert-42' });
    const r = await accounts.login({ login: 'Emeric', password: 'tapis-vert-42', remember: false }, SAFARI_IOS);
    clock.t += 12 * 3_600_000;
    expect(accounts.userBySession(r.token)).not.toBeNull();
    clock.t += 13 * 3_600_000;
    expect(accounts.userBySession(r.token)).toBeNull();
  });

  it('liste les appareils, repère le courant et permet de les révoquer', async () => {
    const { accounts } = setup();
    const a = await accounts.register({ nickname: 'Emeric', email: 'e@x.fr', password: 'tapis-vert-42' }, CHROME_WIN);
    const b = await accounts.login({ login: 'Emeric', password: 'tapis-vert-42' }, SAFARI_IOS);
    const list = accounts.devices(a.account.id, a.token);
    expect(list).toHaveLength(2);
    expect(list.find((d) => d.current)?.label).toBe('Chrome sur Windows');
    expect(JSON.stringify(list)).not.toContain(a.token);
    const other = list.find((d) => !d.current)!;
    accounts.revokeDevice(a.account.id, other.id);
    expect(accounts.userBySession(b.token)).toBeNull();
    expect(accounts.userBySession(a.token)).not.toBeNull();
    const c = await accounts.login({ login: 'Emeric', password: 'tapis-vert-42' });
    expect(accounts.revokeOtherDevices(a.account.id, a.token)).toBe(1);
    expect(accounts.userBySession(c.token)).toBeNull();
    expect(() => accounts.revokeDevice(a.account.id, '0123456789abcdef')).toThrow();
  });

  it("on ne révoque pas l'appareil d'un autre compte et on garde au plus 20 appareils", async () => {
    const { accounts, clock } = setup();
    const a = await accounts.register({ nickname: 'Emeric', email: 'e@x.fr', password: 'tapis-vert-42' });
    const z = await accounts.register({ nickname: 'Zoe', email: 'z@x.fr', password: 'tapis-vert-42' });
    const id = accounts.devices(a.account.id, a.token)[0]!.id;
    expect(() => accounts.revokeDevice(z.account.id, id)).toThrow();
    for (let i = 0; i < 25; i++) {
      clock.t += 1000;
      await accounts.login({ login: 'Emeric', password: 'tapis-vert-42' });
    }
    expect(accounts.devices(a.account.id).length).toBeLessThanOrEqual(20);
  });
});
