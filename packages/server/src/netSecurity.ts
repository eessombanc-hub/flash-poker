import type { IncomingHttpHeaders } from 'node:http';

/**
 * Nombre de relais de confiance placés devant le serveur (TRUST_PROXY). Sur Render, le trafic passe par leur
 * répartiteur : sans cela, toutes les requêtes semblent venir de la même adresse et les limites par IP
 * deviennent communes à tous les joueurs. 0 (ou absent) hors hébergement : l'adresse du socket fait foi.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv): number {
  const raw = env.TRUST_PROXY;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  }
  return env.RENDER ? 1 : 0; // variable posée automatiquement par Render
}

/** Même règle que Fastify (`trustProxy: n`) pour les connexions Socket.IO : on remonte n relais depuis le socket. */
export function clientIp(headers: IncomingHttpHeaders, remote: string | undefined, hops: number): string {
  const direct = remote ?? 'inconnue';
  if (hops <= 0) return direct;
  const xff = String(headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [...xff, direct];
  return chain[chain.length - 1 - hops] ?? chain[0] ?? direct;
}

/** Adresse e-mail masquée pour les journaux : `ab***@domaine.fr`. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address.slice(0, Math.min(2, at))}***${address.slice(at)}`;
}

/** En-têtes de sécurité envoyés sur toutes les réponses. */
export function securityHeaders(opts: { connectExtra?: string } = {}): Record<string, string> {
  const connect = ["'self'", 'ws:', 'wss:', ...(opts.connectExtra ? [opts.connectExtra] : [])].join(' ');
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // l'interface utilise des styles en ligne (attribut style)
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "media-src 'self' data: blob:",
      `connect-src ${connect}`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
