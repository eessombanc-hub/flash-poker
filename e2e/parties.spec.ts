import { expect, test } from '@playwright/test';
import { chooseVariant, closeRecap, createRoom, joinRoom, jsErrors, newPlayer, type Player } from './helpers';

/** Chaque joueur garde sa main au poker fermé (aucune règle n'est jouée ici : seulement le parcours). */
async function playClosedRound(players: Player[]): Promise<boolean> {
  await chooseVariant(players, /Poker fermé — 1 change/);
  for (const p of players) {
    const keep = p.page.getByRole('button', { name: 'Garder ma main' });
    await expect(keep).toBeVisible();
    await expect(p.page.getByRole('group', { name: 'Votre main' }).getByRole('button')).toHaveCount(5);
    await keep.click();
  }
  // Récapitulatif de manche chez tous les joueurs.
  let finished = false;
  for (const p of players) {
    await expect(p.page.getByRole('button', { name: /Continuer|Voir le résultat final/ })).toBeVisible({ timeout: 30_000 });
    // Au poker fermé, la manche a toujours un vainqueur (au besoin par Hold'em de départage) : nom et combinaison affichés.
    await expect(p.page.getByTestId('vainqueur-manche')).toContainText(/— (Carte haute|Paire|Double paire|Brelan|Quinte|Couleur|Full|Carré)/);
    finished = (await closeRecap(p)) || finished;
  }
  return finished;
}

test('partie complète à deux : ordinateur et téléphone, de la création à la victoire', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice');
  const bob = await newPlayer(browser, 'Bob', 'iPhone 13');
  const code = await createRoom(alice, { table: 'E2E duel', players: 2, target: 1 });
  await joinRoom(bob, code);
  await expect(alice.page.getByText('Bob')).toBeVisible();
  await alice.page.getByRole('button', { name: /Démarrer/ }).click();

  let finished = false;
  for (let round = 1; round <= 12 && !finished; round++) finished = await playClosedRound([alice, bob]);
  expect(finished, 'la partie doit se terminer (objectif 1 point)').toBe(true);
  for (const p of [alice, bob]) await expect(p.page.getByText(/^Victoire /)).toBeVisible();
  // Fin de partie : le détail de chaque manche se déplie.
  await alice.page.getByRole('button', { name: /Voir le résultat de chaque manche/ }).click();
  await expect(alice.page.getByRole('region', { name: 'Résultat de chaque manche' }).getByText(/^Manche 1/)).toBeVisible();
  expect(jsErrors(alice).concat(jsErrors(bob))).toEqual([]);
});

test('table de trois : rechargement de page en pleine manche, la main et le tour sont retrouvés', async ({ browser }) => {
  const [a, b, c] = [await newPlayer(browser, 'Alice'), await newPlayer(browser, 'Bruno', 'Pixel 7'), await newPlayer(browser, 'Chloé', 'iPhone 13')];
  const code = await createRoom(a, { table: 'E2E trio', players: 3, target: 3 });
  await joinRoom(b, code);
  await joinRoom(c, code);
  await a.page.getByRole('button', { name: /Démarrer/ }).click();
  await chooseVariant([a, b, c], /Poker fermé — 1 change/);

  const hand = () => c.page.getByRole('group', { name: 'Votre main' }).getByRole('button');
  await expect(hand()).toHaveCount(5);
  const before = await hand().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await c.page.reload();
  await expect(hand()).toHaveCount(5);
  const after = await hand().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(after, 'même main après rechargement').toEqual(before);

  for (const p of [a, b, c]) await p.page.getByRole('button', { name: 'Garder ma main' }).click();
  for (const p of [a, b, c]) await expect(p.page.getByRole('button', { name: /Continuer|Voir le résultat final/ })).toBeVisible({ timeout: 30_000 });
  expect([a, b, c].flatMap(jsErrors)).toEqual([]);
});

test('sans action, la manche se termine seule à l’échéance du minuteur', async ({ browser }) => {
  const a = await newPlayer(browser, 'Alice');
  const b = await newPlayer(browser, 'Bob');
  const code = await createRoom(a, { table: 'E2E minuteur', players: 2, target: 3 });
  await joinRoom(b, code);
  await a.page.getByRole('button', { name: /Démarrer/ }).click();
  await chooseVariant([a, b], /Poker fermé — 1 change/);
  // Minuteurs de 30 s en test (60 s en vrai) : personne ne joue, la manche doit se clore d'elle-même.
  for (const p of [a, b]) await expect(p.page.getByRole('button', { name: /Continuer|Voir le résultat final/ })).toBeVisible({ timeout: 60_000 });
});

test('code inconnu : message clair, pas de plantage', async ({ browser }) => {
  const p = await newPlayer(browser, 'Zoé', 'iPhone 13');
  await p.page.goto('/');
  await p.page.getByRole('button', { name: /Rejoindre/i }).first().click();
  await p.page.fill('#code', 'POKER-ZZZZ');
  await p.page.fill('#nick', 'Zoé');
  await p.page.getByRole('button', { name: /^Rejoindre/i }).last().click();
  await expect(p.page.getByRole('alert').or(p.page.getByText(/introuvable|n’existe pas|inconnu/i)).first()).toBeVisible();
  expect(jsErrors(p)).toEqual([]);
});

test('l’hôte retire un joueur de la salle d’attente', async ({ browser }) => {
  const a = await newPlayer(browser, 'Alice');
  const b = await newPlayer(browser, 'Bob');
  const code = await createRoom(a, { table: 'E2E retrait', players: 3, target: 3 });
  await joinRoom(b, code);
  await a.page.getByRole('button', { name: 'Retirer Bob' }).click();
  await expect(a.page.getByRole('list', { name: 'Joueurs' }).getByText('Bob')).toHaveCount(0);
  expect(jsErrors(a).concat(jsErrors(b))).toEqual([]);
});

test('salle privée : absente des parties ouvertes, accessible par le code', async ({ browser }) => {
  const host = await newPlayer(browser, 'Alice');
  const guest = await newPlayer(browser, 'Bob', 'iPhone 13');
  await host.page.goto('/');
  await host.page.getByRole('button', { name: /Créer une partie/i }).first().click();
  await host.page.fill('#name', 'Table secrète');
  await host.page.getByRole('radiogroup', { name: 'Visibilité' }).getByRole('radio', { name: 'Privée' }).click();
  await host.page.fill('#nick', 'Alice');
  await host.page.getByRole('button', { name: /^Créer/i }).last().click();
  await expect(host.page.getByText(/Salle privée/)).toBeVisible();
  await expect(host.page.getByText(/POKER-[A-Z0-9]{4}/).first()).toBeVisible(); // salle d'attente affichée
  const code = (await host.page.locator('body').innerText()).match(/POKER-[A-Z0-9]{4}/)![0];
  await guest.page.goto('/');
  await expect(guest.page.getByText('Recherche de tables…')).toHaveCount(0);   // liste chargée
  await expect(guest.page.getByText('Table secrète')).toHaveCount(0);
  await joinRoom(guest, code);
  await expect(host.page.getByText('Bob')).toBeVisible();
});
