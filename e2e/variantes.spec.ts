import { expect, test } from '@playwright/test';
import { chooseVariant, createRoom, joinRoom, jsErrors, newPlayer } from './helpers';

// Chaque variante : l'écran de jeu s'affiche chez les deux joueurs (ordinateur et téléphone), sans erreur.
// Aucune règle n'est jouée ici : les règles sont couvertes par les tests du moteur et du serveur.
const VARIANTS: [string, RegExp][] = [
  ['6-3', /^6-3/], ['6-1', /^6-1/], ['fermé 1 change', /Poker fermé \(1 change\)/], ['fermé 2 changes', /Poker fermé \(2 changes\)/],
  ['Aviation', /^Aviation/], ['Avia 6', /^Avia 6/], ['Morpion', /^Morpion/], ['Le 10', /^Le 10/],
];

for (const [label, pattern] of VARIANTS) {
  test(`variante ${label} : écran de jeu affiché sans erreur`, async ({ browser }, info) => {
    const a = await newPlayer(browser, 'Alice');
    const b = await newPlayer(browser, 'Bob', 'iPhone 13');
    const code = await createRoom(a, { table: `E2E ${label}`, players: 2, target: 3 });
    await joinRoom(b, code);
    await a.page.getByRole('button', { name: /Démarrer/ }).click();
    await chooseVariant([a, b], pattern);
    for (const p of [a, b]) {
      await expect(p.page.getByText('Choisissez la variante')).toHaveCount(0);
      await expect(p.page.getByText(/choisit la variante/)).toHaveCount(0);
      await p.page.waitForTimeout(800);
      await p.page.screenshot({ path: info.outputPath(`${p.name}.png`), fullPage: true });
    }
    // Sur ordinateur, aucun siège ne doit recouvrir une carte posée sur le tapis.
    const overlaps = await a.page.evaluate(() => {
      const seats = [...document.querySelectorAll('[data-testid^="seat-"]')].map((e) => e.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.felt [role="img"]')].map((e) => e.getBoundingClientRect());
      const hit = (r: DOMRect, s: DOMRect) => r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1;
      return cards.filter((c) => seats.some((s) => hit(c, s))).length;
    });
    expect(overlaps, 'cartes du tapis recouvertes par un siège').toBe(0);
    expect(jsErrors(a).concat(jsErrors(b))).toEqual([]);
  });
}

test('six joueurs sur ordinateur : sièges lisibles, tapis dégagé', async ({ browser }, info) => {
  const names = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma', 'Farid'];
  const ps = [];
  for (const n of names) ps.push(await newPlayer(browser, n));
  const code = await createRoom(ps[0]!, { table: 'E2E six', players: 6, target: 3 });
  for (const p of ps.slice(1)) await joinRoom(p, code);
  await ps[0]!.page.getByRole('button', { name: /Démarrer/ }).click();
  await chooseVariant(ps, /^6-3/);
  await ps[0]!.page.waitForTimeout(800);
  await ps[0]!.page.screenshot({ path: info.outputPath('six.png'), fullPage: true });
  const overlaps = await ps[0]!.page.evaluate(() => {
    const seats = [...document.querySelectorAll('[data-testid^="seat-"]')].map((e) => e.getBoundingClientRect());
    const cards = [...document.querySelectorAll('.felt [role="img"]')].map((e) => e.getBoundingClientRect());
    return cards.filter((c) => seats.some((s) => c.left < s.right - 1 && s.left < c.right - 1 && c.top < s.bottom - 1 && s.top < c.bottom - 1)).length;
  });
  expect(overlaps).toBe(0);
  expect(ps.flatMap(jsErrors)).toEqual([]);
});
