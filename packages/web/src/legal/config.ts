/**
 * Informations légales du site : un seul endroit à tenir à jour.
 * Renseignez `contactEmail` avant la mise en ligne : l'adresse est publiée dans les mentions légales
 * et sert à l'exercice des droits sur les données personnelles.
 */
export const LEGAL = {
  siteName: 'Flash Poker',
  siteUrl: 'https://flash-poker.fr',
  publisher: 'Emeric Essomba',
  /** Adresse électronique de l'éditeur (obligatoire pour les mentions légales). Laisser vide tant qu'elle n'est pas choisie. */
  contactEmail: '',
  updatedAt: '13 novembre 2026',
  hosts: [
    { role: 'Interface du site (pages web)', name: 'Vercel Inc.', address: '440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis', url: 'https://vercel.com' },
    { role: 'Serveur de jeu, comptes et base de données', name: 'Render Services, Inc.', address: '525 Brannan Street, Suite 300, San Francisco, CA 94107, États-Unis', url: 'https://render.com' },
  ],
  registrar: { name: 'OVH SAS', address: '2 rue Kellermann, 59100 Roubaix, France', url: 'https://www.ovhcloud.com' },
  mailer: { name: 'Resend', url: 'https://resend.com' },
  /** Dépôt privé recevant les sauvegardes chiffrées de la base des comptes. */
  backup: { name: 'GitHub, Inc.', url: 'https://github.com' },
} as const;

export type LegalPage = 'mentions' | 'privacy' | 'cookies';
export const LEGAL_PAGES: readonly LegalPage[] = ['mentions', 'privacy', 'cookies'];
export const LEGAL_HASH: Record<LegalPage, string> = { mentions: '#mentions-legales', privacy: '#confidentialite', cookies: '#cookies' };

/** Page demandée par l'adresse (`/#confidentialite`), ou null. */
export function legalFromHash(hash: string): LegalPage | null {
  const h = hash.toLowerCase();
  return LEGAL_PAGES.find((p) => LEGAL_HASH[p] === h) ?? null;
}
