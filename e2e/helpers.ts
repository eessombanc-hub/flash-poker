import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page, devices } from '@playwright/test';

// Chaque contexte ouvert (un joueur = un appareil) est refermé après le test : sans cela, les navigateurs
// s'accumulent au fil de la série et la ralentissent jusqu'aux dépassements de délai.
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => undefined)));
});

/** Nouveau contexte de navigateur suivi (refermé automatiquement après le test). */
export async function newPage(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  opened.push(context);
  return context.newPage();
}

export type Player = { name: string; page: Page };

/** Un joueur = un contexte de navigateur séparé (comme un appareil distinct). */
export async function newPlayer(browser: Browser, name: string, device?: keyof typeof devices): Promise<Player> {
  const page = await newPage(browser, device ? { ...devices[device] } : { viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { jsErrors: string[] }).jsErrors = errors;
  return { name, page };
}

export function jsErrors(p: Player): string[] {
  return (p.page as Page & { jsErrors: string[] }).jsErrors;
}

export async function createRoom(host: Player, opts: { table: string; players: number; target: number }): Promise<string> {
  const { page } = host;
  await page.goto('/');
  await page.getByRole('button', { name: /Créer une partie/i }).first().click();
  await page.fill('#name', opts.table);
  await page.getByRole('radiogroup', { name: 'Nombre de joueurs' }).getByRole('radio', { name: String(opts.players) }).click();
  await page.getByRole('radiogroup', { name: 'Objectif en points' }).getByRole('radio', { name: String(opts.target) }).click();
  await page.fill('#nick', host.name);
  await page.getByRole('button', { name: /^Créer/i }).last().click();
  await expect(page.getByText('Salle d’attente')).toBeVisible();
  const code = (await page.locator('body').innerText()).match(/POKER-[A-Z0-9]{4}/)?.[0];
  expect(code, 'code de partie affiché').toBeTruthy();
  return code!;
}

export async function joinRoom(p: Player, code: string): Promise<void> {
  await p.page.goto('/');
  await p.page.getByRole('button', { name: /Rejoindre/i }).first().click();
  await p.page.fill('#code', code);
  await p.page.fill('#nick', p.name);
  await p.page.getByRole('button', { name: /^Rejoindre/i }).last().click();
  await expect(p.page.getByText('Salle d’attente')).toBeVisible();
}

/** Le joueur qui choisit la variante la choisit ; renvoie son nom. */
export async function chooseVariant(players: Player[], variant: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    for (const p of players) {
      if (await p.page.getByText('Choisissez la variante').isVisible().catch(() => false)) {
        await p.page.getByRole('button', { name: variant }).first().click();
        return p.name;
      }
    }
    await players[0].page.waitForTimeout(250);
  }
  throw new Error('personne ne peut choisir la variante');
}

/** Ferme le récapitulatif de manche s'il est affiché ; vrai si la partie est terminée. */
export async function closeRecap(p: Player): Promise<boolean> {
  const final = p.page.getByRole('button', { name: 'Voir le résultat final' });
  if (await final.isVisible().catch(() => false)) {
    await final.click();
    return true;
  }
  const next = p.page.getByRole('button', { name: 'Continuer' });
  if (await next.isVisible().catch(() => false)) await next.click();
  return p.page.getByText(/^Victoire /).isVisible().catch(() => false);
}
