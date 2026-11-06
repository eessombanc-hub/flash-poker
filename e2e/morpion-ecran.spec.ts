import { devices, expect, test, type Page } from '@playwright/test';
import { chooseVariant, createRoom, joinRoom, newPage } from './helpers';

// Morpion : tout ce qu'il faut pour jouer tient dans l'écran, sans défiler — grille de 9 cartes, vos 4 cartes,
// les 8 alignements et le bouton de validation. Vérifié sur des écrans d'ordinateur et de téléphone courants.
const SCREENS: { name: string; use: Parameters<Awaited<ReturnType<typeof import('@playwright/test')['chromium']['launch']>>['newContext']>[0] }[] = [
  { name: 'portable 1366×650 (navigateur ouvert)', use: { viewport: { width: 1366, height: 650 } } },
  { name: 'ordinateur 1280×720', use: { viewport: { width: 1280, height: 720 } } },
  { name: 'grand écran 1920×950', use: { viewport: { width: 1920, height: 950 } } },
  { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
  { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
  { name: 'Galaxy S8', use: { ...devices['Galaxy S8'] } },
];

/** Vrai si l'élément est entièrement dans la fenêtre et réellement visible (ni coupé par une zone qui défile, ni recouvert). */
async function fullyVisible(page: Page, selector: string, text?: string): Promise<{ total: number; hidden: string[] }> {
  return page.evaluate(([sel, txt]) => {
    const els = ([...document.querySelectorAll(sel!)] as HTMLElement[]).filter((e) => !txt || e.textContent?.trim() === txt);
    const hidden: string[] = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const inside = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.height > 0;
      const probes = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 3, r.top + 3],
        [r.right - 3, r.bottom - 3],
      ];
      const seen = inside && probes.every(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return !!hit && (el === hit || el.contains(hit));
      });
      if (!seen) hidden.push(el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName);
    }
    return { total: els.length, hidden };
  }, [selector, text ?? '']);
}

for (const screen of SCREENS) {
  for (const players of [2, 6]) {
    test(`Morpion, ${players} joueurs, ${screen.name} : tout est visible sans défiler`, async ({ browser }, info) => {
      const ps = [];
      for (let i = 0; i < players; i++) {
        const page = await newPage(browser, screen.use);
        ps.push({ name: ['Alice', 'Bruno', 'Chloé', 'David', 'Emma', 'Farid'][i]!, page });
      }
      const code = await createRoom(ps[0]!, { table: 'Écran Morpion', players, target: 3 });
      for (const p of ps.slice(1)) await joinRoom(p, code);
      await ps[0]!.page.getByRole('button', { name: /Démarrer/ }).click();
      await chooseVariant(ps, /^Morpion/);
      const page = ps[0]!.page;
      await expect(page.getByRole('button', { name: 'Valider ma combinaison' })).toBeAttached();
      await page.waitForTimeout(1200);                                  // fin des animations de distribution
      await page.screenshot({ path: info.outputPath('ecran.png') });

      const grid = await fullyVisible(page, '.felt svg[role="img"]');
      const hand = await fullyVisible(page, '[role="group"][aria-label="Votre main"] button');
      const lines = await fullyVisible(page, '[role="radiogroup"][aria-label="Alignement"] [role="radio"]');
      const validate = await fullyVisible(page, 'button', 'Valider ma combinaison');
      const timer = await fullyVisible(page, '[role="timer"]');
      const title = await fullyVisible(page, 'h2', 'Choisissez 2 cartes et un alignement');
      expect(validate.total, 'bouton de validation').toBe(1);
      expect(timer.total, 'compte à rebours').toBe(1);
      expect({ minuteur: timer.hidden, titre: title.hidden }).toEqual({ minuteur: [], titre: [] });
      expect(grid.total, 'grille de 9 cartes').toBe(9);
      expect(hand.total, 'main de 4 cartes').toBe(4);
      expect(lines.total, '8 alignements').toBe(8);
      expect({ grille: grid.hidden, main: hand.hidden, alignements: lines.hidden, valider: validate.hidden }).toEqual({ grille: [], main: [], alignements: [], valider: [] });
    });
  }
}
