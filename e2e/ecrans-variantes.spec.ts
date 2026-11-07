import { devices, expect, test, type Page } from '@playwright/test';
import { chooseVariant, createRoom, joinRoom, newPage } from './helpers';

// Toutes les variantes : au moment de jouer, les cartes communes, les cartes visibles des adversaires, votre main
// et le compte à rebours tiennent dans l'écran, sans défiler. Écrans : portable bas, iPhone, téléphone étroit.
const SCREENS = [
  { name: 'portable 1366×650', use: { viewport: { width: 1366, height: 650 } } },
  { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
  { name: 'Galaxy S8', use: { ...devices['Galaxy S8'] } },
];
const VARIANTS: [string, RegExp][] = [
  ['6-3', /^6-3/], ['6-1', /^6-1/], ['fermé 1', /Poker fermé — 1 change/], ['fermé 2', /Poker fermé — 2 changes/],
  ['Aviation', /^Aviation/], ['Avia 6', /^Avia 6/], ['Le 10', /^Le 10/],
];

async function hiddenOf(page: Page, selector: string): Promise<{ total: number; hidden: number }> {
  return page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)] as HTMLElement[];
    let hidden = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const inside = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.height > 0;
      const probes = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]];
      // Main en éventail (téléphone) : chaque carte peut recouvrir le bas droit de la précédente ; son coin (valeur
      // et couleur) et son centre doivent rester visibles, et rien d'autre qu'une carte voisine ne doit la couvrir.
      const group = el.closest('[aria-label="Votre main"]');
      const seen = inside && probes.every(([x, y], i) => {
        const hit = document.elementFromPoint(x!, y!);
        if (!hit) return false;
        if (el === hit || el.contains(hit)) return true;
        return i === 2 && !!group && group.contains(hit);
      });
      if (!seen) hidden++;
    }
    return { total: els.length, hidden };
  }, selector);
}

for (const screen of SCREENS) {
  for (const [label, pattern] of VARIANTS) {
    for (const players of [2, 5]) {
      test(`${label}, ${players} joueurs, ${screen.name} : cartes et minuteur visibles sans défiler`, async ({ browser }, info) => {
        // 5 ou 6 navigateurs à la fois : sous la charge de toute la série, ce test peut dépasser 3 minutes sans
        // défaut du jeu. Il dispose donc d'un délai triple.
        if (players >= 5) test.slow();
        const ps = [];
        for (let i = 0; i < players; i++) {
          const page = await newPage(browser, screen.use);
          ps.push({ name: ['Alice', 'Bruno', 'Chloé', 'David', 'Emma'][i]!, page });
        }
        const code = await createRoom(ps[0]!, { table: `Écran ${label}`, players, target: 3 });
        for (const p of ps.slice(1)) await joinRoom(p, code);
        await ps[0]!.page.getByRole('button', { name: /Démarrer/ }).click();
        await chooseVariant(ps, pattern);
        const page = ps[0]!.page;
        await expect(page.locator('[role="timer"]')).toBeVisible();
        await page.waitForTimeout(1500);                                 // fin des animations et de l'annonce
        await page.screenshot({ path: info.outputPath('ecran.png') });
        const table = await hiddenOf(page, '.felt svg[role="img"]');         // cartes communes et cartes retournées
        const hand = await hiddenOf(page, '[aria-label="Votre main"] svg, [aria-label="Votre main"] button');
        const timer = await hiddenOf(page, '[role="timer"]');
        expect(table.total + hand.total, 'des cartes sont affichées').toBeGreaterThan(0);
        expect({ table: table.hidden, main: hand.hidden, minuteur: timer.hidden }).toEqual({ table: 0, main: 0, minuteur: 0 });
      });
    }
  }
}
