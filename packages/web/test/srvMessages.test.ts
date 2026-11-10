import { describe, expect, it } from 'vitest';
import { DICTS, type Lang, type Params } from '../src/i18n';
import { ApiError } from '../src/lib/api';
import { errorText } from '../src/lib/tbText';
import { SERVER_MESSAGES } from '../src/lib/srvMessages';

const createI18n = (lang: Lang) => {
  const t = (key: string, params?: Params): string => {
    const raw = (DICTS[lang] as Record<string, string>)[key] ?? (DICTS.fr as Record<string, string>)[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params?.[k] ?? ''));
  };
  return { lang, t, tp: (base: string, n: number, params?: Params) => t(`${base}.${n < 2 ? 'one' : 'other'}`, { n, ...params }) };
};

describe('messages du serveur traduits côté navigateur', () => {
  it('traduit un message statique et un message à paramètres', () => {
    const en = createI18n('en');
    expect(errorText(en, new ApiError('BAD_REQUEST', 'Mise invalide'))).toBe('Invalid bet');
    expect(errorText(en, new ApiError('FORBIDDEN', 'Cette table demande le niveau 7'))).toBe('This table requires level 7');
    expect(errorText(createI18n('de'), new ApiError('X', 'Jetons insuffisants. 50 demandés, 20 disponibles'))).toBe('Nicht genug Chips. 50 angefordert, 20 verfügbar');
  });
  it('garde le français tel quel et replie sur un message générique pour un texte inconnu', () => {
    expect(errorText(createI18n('fr'), new ApiError('BAD_REQUEST', 'Mise invalide'))).toBe('Mise invalide');
    expect(errorText(createI18n('es'), new ApiError('ZZZ', 'Texte inconnu'))).not.toBe('Texte inconnu');
  });
  it('couvre tous les motifs', () => {
    expect(SERVER_MESSAGES.length).toBeGreaterThan(100);
  });
});
