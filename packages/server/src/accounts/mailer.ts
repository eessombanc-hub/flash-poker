import { maskEmail } from '../netSecurity';
/**
 * Envoi d'e-mails (mot de passe oublié, joueur favori connecté).
 *
 * Configuration par variables d'environnement, sans rien d'écrit dans le code. Trois modes, essayés dans cet ordre :
 *   1. API HTTPS de Brevo : BREVO_API_KEY. Fonctionne partout, y compris sur l'offre gratuite de Render qui
 *      bloque les ports SMTP (25, 465, 587) ;
 *   2. API HTTPS de Resend : RESEND_API_KEY (même avantage) ;
 *   3. SMTP : SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_USER, SMTP_PASS (hébergement sans blocage des ports).
 * MAIL_FROM : expéditeur (« Flash Poker <no-reply@flash-poker.fr> »), obligatoire avec les modes 1 et 2.
 * APP_URL : adresse publique du jeu, pour les liens des e-mails (ex. https://flash-poker.fr).
 * Sans configuration, les e-mails ne partent pas : ils sont écrits dans le journal du serveur, et la récupération
 * de mot de passe est signalée indisponible.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Vrai si les e-mails partent réellement (service d'envoi configuré). */
  readonly enabled: boolean;
  /** Nom du service utilisé, pour le journal de démarrage. */
  readonly kind?: string;
  send(message: MailMessage): Promise<void>;
}

/** Sans SMTP : rien ne part, le message est seulement conservé (tests) et signalé dans le journal. */
export class LogMailer implements Mailer {
  readonly kind = 'aucun';
  readonly sent: MailMessage[] = [];
  constructor(readonly enabled = false, private readonly log: (s: string) => void = (s) => console.log(s)) {}
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.log(`[e-mail non envoyé, SMTP non configuré] à ${maskEmail(message.to)} : ${message.subject}`);
  }
}

export class SmtpMailer implements Mailer {
  readonly enabled = true;
  readonly kind = 'SMTP';
  private transport: { sendMail(m: Record<string, unknown>): Promise<unknown> } | null = null;
  constructor(private readonly env: Record<string, string | undefined>) {}

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      const nodemailer = await import('nodemailer');
      const port = Number(this.env.SMTP_PORT ?? 587);
      this.transport = nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined,
      });
    }
    await this.transport.sendMail({ from: this.env.MAIL_FROM ?? this.env.SMTP_USER, ...message });
  }
}

/** Sépare « Nom <adresse> » en nom et adresse (une adresse seule est acceptée). */
export function parseSender(from: string): { name: string | undefined; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (m) return { name: m[1]!.trim() || undefined, email: m[2]! };
  return { name: undefined, email: from.trim() };
}

/** Envoi par API HTTPS (Brevo ou Resend) : aucun port SMTP, donc compatible avec les hébergements qui les bloquent. */
export class HttpMailer implements Mailer {
  readonly enabled = true;
  constructor(
    readonly kind: 'Brevo' | 'Resend',
    private readonly key: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const sender = parseSender(this.from);
    const brevo = this.kind === 'Brevo';
    const res = await this.fetchFn(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(brevo ? { 'api-key': this.key } : { authorization: `Bearer ${this.key}` }) },
      body: JSON.stringify(
        brevo
          ? { sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) }, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, textContent: message.text }
          : { from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text },
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${this.kind} a refusé l'envoi (HTTP ${res.status}) ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
}

export function resolveMailer(env: Record<string, string | undefined>, fetchFn?: typeof fetch): Mailer {
  const from = env.MAIL_FROM?.trim();
  if (env.BREVO_API_KEY && from) return new HttpMailer('Brevo', env.BREVO_API_KEY, from, fetchFn);
  if (env.RESEND_API_KEY && from) return new HttpMailer('Resend', env.RESEND_API_KEY, from, fetchFn);
  return env.SMTP_HOST ? new SmtpMailer(env) : new LogMailer(false);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mise en page commune des e-mails : sobre, lisible sur téléphone, avec une version texte. */
export function mail(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }): MailMessage {
  const text = [...paragraphs, ...(action ? [`${action.label}. ${action.url}`] : []), '', 'Flash Poker'].join('\n\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#14213d">
<h1 style="font-family:Georgia,serif;color:#a9843f;font-weight:normal">Flash Poker</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#c9a25a;color:#081a3d;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>` : ''}
<p style="font-size:12px;color:#6b7280">Jetons sans valeur monétaire : rien à gagner en argent.</p></div>`;
  return { to, subject, text, html };
}
