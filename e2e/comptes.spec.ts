import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { jsErrors, newPlayer, type Player } from './helpers';

// Comptes joueurs dans un vrai navigateur : inscription, espace personnel (chaque onglet), favori connecté.
// Chaque écran passe l'audit d'accessibilité (aucun défaut grave ou critique) et fait l'objet d'une capture.
mkdirSync('e2e-audit/comptes', { recursive: true });

async function audit(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${label} : ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')})`)).toEqual([]);
  await page.screenshot({ path: `e2e-audit/comptes/${label.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
}

async function register(p: Player, nickname: string): Promise<void> {
  await p.page.goto('/');
  await p.page.getByRole('button', { name: /Se connecter/ }).click();
  await p.page.getByRole('button', { name: 'Créer un compte' }).click();
  await p.page.getByLabel('Pseudo').fill(nickname);
  await p.page.getByLabel('Adresse e-mail').fill(`${nickname.toLowerCase()}@exemple.fr`);
  await p.page.getByLabel('Mot de passe', { exact: true }).fill('tapis-vert-42');
  await p.page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(p.page.getByRole('button', { name: new RegExp(nickname) })).toBeVisible();
}

test('comptes : inscription, espace joueur, favori connecté, sur ordinateur et téléphone', async ({ browser }) => {
  const stamp = Date.now().toString(36).slice(-4);
  const ana = await newPlayer(browser, 'Ana');
  const bea = await newPlayer(browser, 'Bea', 'iPhone 13');

  await ana.page.goto('/');
  await ana.page.getByRole('button', { name: /Se connecter/ }).click();
  await audit(ana.page, 'connexion (ordinateur)');
  await ana.page.getByRole('button', { name: 'Créer un compte' }).click();
  await audit(ana.page, 'inscription (ordinateur)');

  await register(ana, `Ana${stamp}`);
  await audit(ana.page, 'accueil connecté (ordinateur)');
  await register(bea, `Bea${stamp}`);
  await audit(bea.page, 'accueil connecté (téléphone)');

  // Ana ajoute Bea en favori
  await ana.page.getByRole('button', { name: new RegExp(`Ana${stamp}`) }).click();
  for (const tab of ['Profil', 'Historique', 'Statistiques', 'Manches favorites', 'Bankroll', 'Joueurs favoris']) {
    await ana.page.getByRole('tab', { name: tab }).click();
    await expect(ana.page.getByRole('tabpanel')).toBeVisible();
    await audit(ana.page, `espace ${tab} (ordinateur)`);
  }
  await ana.page.getByLabel('Ajouter un joueur inscrit').fill(`Bea${stamp}`);
  await ana.page.getByRole('option').getByRole('button', { name: 'Ajouter' }).click();
  await expect(ana.page.getByRole('list', { name: 'Mes joueurs favoris' })).toContainText(`Bea${stamp}`);
  await audit(ana.page, 'espace favoris rempli (ordinateur)');

  // Lien d'invitation, ouvert par un nouveau venu sur téléphone
  await ana.page.getByRole('tab', { name: 'Inviter des amis' }).click();
  const link = await ana.page.getByRole('textbox', { name: 'Lien d’invitation' }).inputValue();
  await audit(ana.page, 'espace inviter (ordinateur)');
  const zoe = await newPlayer(browser, 'Zoé', 'iPhone 13');
  await zoe.page.goto(new URL(link).pathname + new URL(link).search);
  await expect(zoe.page.getByText(new RegExp(`Ana${stamp}.*vous invite à rejoindre Flash Poker`))).toBeVisible();
  await audit(zoe.page, 'inscription par invitation (téléphone)');

  // Bea ouvre son espace sur téléphone
  await bea.page.getByRole('button', { name: new RegExp(`Bea${stamp}`) }).click();
  await audit(bea.page, 'espace profil (téléphone)');
  await bea.page.getByRole('tab', { name: 'Statistiques' }).click();
  await audit(bea.page, 'espace statistiques (téléphone)');

  // Bea se déconnecte puis revient : Ana, en ligne, est prévenue
  await bea.page.getByRole('tab', { name: 'Profil' }).click();
  await bea.page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(bea.page.getByRole('button', { name: /Se connecter/ })).toBeVisible();
  await bea.page.getByRole('button', { name: /Se connecter/ }).click();
  await bea.page.getByLabel('Pseudo ou adresse e-mail').fill(`bea${stamp}@exemple.fr`);
  await bea.page.getByLabel('Mot de passe', { exact: true }).fill('tapis-vert-42');
  await bea.page.getByRole('button', { name: 'Se connecter' }).last().click();
  await expect(ana.page.getByText(new RegExp(`Bea${stamp}, un de vos joueurs favoris, vient de se connecter`))).toBeVisible();

  // Un invité ne peut pas prendre le pseudo d'un inscrit
  const guest = await newPlayer(browser, 'Invité');
  await guest.page.goto('/');
  await guest.page.getByRole('button', { name: /Créer une partie/ }).first().click();
  await guest.page.getByLabel('Nom de la table').fill('Test');
  await guest.page.getByLabel('Votre pseudo').fill(`ana${stamp}`);
  await guest.page.getByRole('button', { name: 'Créer la table' }).click();
  await expect(guest.page.getByRole('alert')).toContainText('appartient à un joueur inscrit');

  for (const p of [ana, bea, guest, zoe]) expect(jsErrors(p)).toEqual([]);
});
