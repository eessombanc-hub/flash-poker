import { describe, expect, it, vi } from 'vitest';
import { HttpMailer, LogMailer, SmtpMailer, parseSender, resolveMailer } from '../src/accounts/mailer';

const message = { to: 'ana@example.fr', subject: 'Nouveau mot de passe', text: 'texte', html: '<p>html</p>' };
const ok = () => vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }));

describe('choix du service d’envoi', () => {
  it('Brevo d’abord, puis Resend, puis SMTP, sinon rien', () => {
    const from = 'Flash Poker <no-reply@flash-poker.fr>';
    expect(resolveMailer({ BREVO_API_KEY: 'k', RESEND_API_KEY: 'r', SMTP_HOST: 'h', MAIL_FROM: from }).kind).toBe('Brevo');
    expect(resolveMailer({ RESEND_API_KEY: 'r', SMTP_HOST: 'h', MAIL_FROM: from }).kind).toBe('Resend');
    expect(resolveMailer({ SMTP_HOST: 'h' })).toBeInstanceOf(SmtpMailer);
    const none = resolveMailer({});
    expect(none).toBeInstanceOf(LogMailer);
    expect(none.enabled).toBe(false);
  });

  it('une clé d’API sans expéditeur n’active rien (l’envoi échouerait)', () => {
    expect(resolveMailer({ BREVO_API_KEY: 'k' }).enabled).toBe(false);
  });
});

describe('expéditeur', () => {
  it('lit « Nom <adresse> » ou une adresse seule', () => {
    expect(parseSender('Flash Poker <no-reply@flash-poker.fr>')).toEqual({ name: 'Flash Poker', email: 'no-reply@flash-poker.fr' });
    expect(parseSender('"Flash Poker" <no-reply@flash-poker.fr>')).toEqual({ name: 'Flash Poker', email: 'no-reply@flash-poker.fr' });
    expect(parseSender('no-reply@flash-poker.fr')).toEqual({ name: undefined, email: 'no-reply@flash-poker.fr' });
  });
});

describe('envoi par API HTTPS', () => {
  it('Brevo : clé dans l’en-tête api-key, expéditeur et destinataire séparés', async () => {
    const f = ok();
    await new HttpMailer('Brevo', 'cle-brevo', 'Flash Poker <no-reply@flash-poker.fr>', f).send(message);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init!.headers as Record<string, string>)['api-key']).toBe('cle-brevo');
    expect(JSON.parse(init!.body as string)).toEqual({
      sender: { email: 'no-reply@flash-poker.fr', name: 'Flash Poker' },
      to: [{ email: 'ana@example.fr' }],
      subject: 'Nouveau mot de passe',
      htmlContent: '<p>html</p>',
      textContent: 'texte',
    });
  });

  it('Resend : clé en Bearer, expéditeur tel quel', async () => {
    const f = ok();
    await new HttpMailer('Resend', 'cle-resend', 'Flash Poker <no-reply@flash-poker.fr>', f).send(message);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer cle-resend');
    expect(JSON.parse(init!.body as string)).toMatchObject({ from: 'Flash Poker <no-reply@flash-poker.fr>', to: ['ana@example.fr'], html: '<p>html</p>' });
  });

  it('un refus du service remonte en erreur, sans exposer la clé', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('{"message":"sender not verified"}', { status: 400 }));
    const err = await new HttpMailer('Brevo', 'cle-secrete', 'no-reply@flash-poker.fr', f).send(message).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('HTTP 400');
    expect((err as Error).message).toContain('sender not verified');
    expect((err as Error).message).not.toContain('cle-secrete');
  });
});
