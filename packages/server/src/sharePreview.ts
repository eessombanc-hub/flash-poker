/**
 * Aperçu des liens partagés (WhatsApp, SMS, réseaux sociaux).
 *
 * Les applications de messagerie lisent les balises Open Graph de la page d'accueil, sans exécuter son code.
 * Le serveur complète donc `index.html` avant de l'envoyer :
 * - `__APP_URL__` devient l'adresse publique du jeu (les images d'aperçu exigent une adresse complète) ;
 * - un lien d'invitation (`?invitation=…`) affiche le pseudo de l'invitant ;
 * - un lien de partie (`?code=POKER-XXXX`) annonce la table, sans révéler son nom (une salle peut être privée).
 */
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PreviewContext {
  /** Adresse publique du jeu, sans barre finale (ex. https://flash-poker.onrender.com). */
  baseUrl: string;
  query: Record<string, string | undefined>;
  /** Pseudo de l'auteur d'une invitation, ou null si le code est inconnu. */
  inviterOf?: (code: string) => string | null;
}

function setMeta(html: string, property: string, value: string): string {
  const re = new RegExp(`(<meta property="${property}" content=")[^"]*(")`);
  return html.replace(re, `$1${escapeHtml(value)}$2`);
}

export function renderIndex(template: string, ctx: PreviewContext): string {
  let html = template.split('__APP_URL__').join(escapeHtml(ctx.baseUrl));
  const invite = ctx.query.invitation;
  const code = ctx.query.code?.toUpperCase();
  if (invite && /^[A-Za-z0-9_-]{6,40}$/.test(invite)) {
    const who = ctx.inviterOf?.(invite);
    if (who) {
      html = setMeta(html, 'og:title', `${who} vous invite sur Flash Poker`);
      html = setMeta(html, 'og:description', 'Créez votre compte gratuit en quelques secondes et rejoignez sa table. Huit variantes de poker entre amis, en temps réel.');
    }
  } else if (code && /^POKER-[2-9A-Z]{4}$/.test(code)) {
    html = setMeta(html, 'og:title', 'Une table de Flash Poker vous attend');
    html = setMeta(html, 'og:description', `Partie ${code}. Touchez le lien pour vous asseoir à la table, sans rien installer.`);
  }
  return html;
}
