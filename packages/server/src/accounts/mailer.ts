/**
 * Envoi d'e-mails (mot de passe oublié, joueur favori connecté).
 *
 * Configuration par variables d'environnement, sans rien d'écrit dans le code :
 *   SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_USER, SMTP_PASS, MAIL_FROM (« Flash Poker <no-reply@…> »)
 *   APP_URL : adresse publique du jeu, pour les liens des e-mails (ex. https://flash-poker.onrender.com)
 * Tout service SMTP convient (Brevo, Mailjet, OVH, Gmail…). Sans configuration, les e-mails ne partent pas :
 * ils sont écrits dans le journal du serveur, et la récupération de mot de passe est signalée indisponible.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Vrai si les e-mails partent réellement (SMTP configuré). */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

/** Sans SMTP : rien ne part, le message est seulement conservé (tests) et signalé dans le journal. */
export class LogMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  constructor(readonly enabled = false, private readonly log: (s: string) => void = (s) => console.log(s)) {}
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.log(`[e-mail non envoyé, SMTP non configuré] à ${message.to} : ${message.subject}`);
  }
}

export class SmtpMailer implements Mailer {
  readonly enabled = true;
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

export function resolveMailer(env: Record<string, string | undefined>): Mailer {
  return env.SMTP_HOST ? new SmtpMailer(env) : new LogMailer(false);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mise en page commune des e-mails : sobre, lisible sur téléphone, avec une version texte. */
export function mail(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }): MailMessage {
  const text = [...paragraphs, ...(action ? [`${action.label} : ${action.url}`] : []), '', '— Flash Poker'].join('\n\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#14213d">
<h1 style="font-family:Georgia,serif;color:#a9843f;font-weight:normal">Flash Poker</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#c9a25a;color:#081a3d;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>` : ''}
<p style="font-size:12px;color:#6b7280">Cagnotte virtuelle — aucun paiement réel.</p></div>`;
  return { to, subject, text, html };
}
