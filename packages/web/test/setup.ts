import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Les tests existants sont rédigés en français : le navigateur simulé déclare cette langue.
Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });
Object.defineProperty(window.navigator, 'languages', { value: ['fr-FR', 'fr'], configurable: true });

afterEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem('flashpoker.lang');
  } catch {
    /* ignoré */
  }
});

// jsdom n'implémente pas matchMedia
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}
