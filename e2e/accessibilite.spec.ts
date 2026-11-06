import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chooseVariant, createRoom, joinRoom, newPlayer } from './helpers';

// Audit d'accessibilité (axe-core, normes WCAG 2.1 A et AA) des écrans principaux, sur ordinateur et téléphone.
// Échec si un défaut « grave » ou « critique » apparaît ; les défauts mineurs sont seulement consignés.
type Finding = { screen: string; id: string; impact: string; help: string; nodes: number; targets: string[] };
const findings: Finding[] = [];

async function audit(page: Page, screen: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of result.violations) {
    findings.push({ screen, id: v.id, impact: v.impact ?? 'inconnu', help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) });
  }
}

test.afterAll(() => {
  mkdirSync('e2e-audit', { recursive: true });
  writeFileSync('e2e-audit/accessibilite.json', JSON.stringify(findings, null, 2));
});

test('accessibilité : accueil, formulaires, salle d’attente, table, règles', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice');
  const bob = await newPlayer(browser, 'Bob', 'iPhone 13');

  await alice.page.goto('/');
  await audit(alice.page, 'accueil (ordinateur)');
  await bob.page.goto('/');
  await audit(bob.page, 'accueil (téléphone)');

  await alice.page.getByRole('button', { name: /Créer une partie/i }).first().click();
  await audit(alice.page, 'formulaire de création');
  await bob.page.getByRole('button', { name: /Rejoindre/i }).first().click();
  await audit(bob.page, 'formulaire pour rejoindre (téléphone)');

  const code = await createRoom(alice, { table: 'Audit', players: 2, target: 3 });
  await joinRoom(bob, code);
  await audit(alice.page, 'salle d’attente (ordinateur)');
  await audit(bob.page, 'salle d’attente (téléphone)');

  await alice.page.getByRole('button', { name: /Démarrer/ }).click();
  await expect(alice.page.getByRole('group', { name: 'Table de jeu' })).toBeVisible();
  await audit(alice.page, 'table, choix de la variante');
  await chooseVariant([alice, bob], /^Morpion/);
  await alice.page.waitForTimeout(800);
  await audit(alice.page, 'table, Morpion (ordinateur)');
  await audit(bob.page, 'table, Morpion (téléphone)');

  await alice.page.getByRole('button', { name: 'Règles' }).click();
  await audit(alice.page, 'mémo des règles');

  const blocking = findings.filter((f) => f.impact === 'critical' || f.impact === 'serious');
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
