import { defineConfig, devices } from '@playwright/test';

// Parties de bout en bout : un vrai serveur (mode production, comme sur Render) et de vrais navigateurs.
// Lancement : npm run test:e2e  (la première fois : npx playwright install chromium).
const PORT = Number(process.env.E2E_PORT ?? 4310);

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-rapport' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Interface compilée servie par le serveur lui-même (même origine), base jetable, minuteurs de 15 s.
    command: 'npm run build:web && npm -w @poker/server run start',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), WEB_DIST: '../web/dist', STORE: 'memory', PHASE_SECONDS: '15' },
  },
});
