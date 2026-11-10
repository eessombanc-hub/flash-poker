import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fr, type Key } from './fr';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { it } from './it';

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';
export type { Key };
export type Dict = Record<Key, string>;

/** Langues proposées, nommées dans leur propre langue (le sélecteur doit rester lisible quelle que soit la langue active). */
export const LANGS: readonly { id: Lang; name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'de', name: 'Deutsch' },
  { id: 'it', name: 'Italiano' },
];

export const DICTS: Record<Lang, Dict> = { fr, en, es, de, it };
const STORAGE_KEY = 'flashpoker.lang';

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && LANGS.some((l) => l.id === v);

/** Langue initiale : choix mémorisé, sinon langue du navigateur si elle est prise en charge, sinon français. */
export function detectLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* stockage indisponible */
  }
  try {
    for (const l of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const short = String(l ?? '').slice(0, 2).toLowerCase();
      if (isLang(short)) return short;
    }
  } catch {
    /* ignoré */
  }
  return 'fr';
}

export type Params = Record<string, string | number>;

function fill(template: string, params?: Params): string {
  return params ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : template;
}

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Traduit une clé ; repli sur le français si la clé manque. */
  t: (key: Key, params?: Params) => string;
  /** Pluriel : choisit `<base>.one` ou `<base>.other` selon `n` (0 et 1 sont singuliers en français). */
  tp: (base: string, n: number, params?: Params) => string;
}

function build(lang: Lang, setLang: (l: Lang) => void): I18n {
  const dict = DICTS[lang];
  const t = (key: Key, params?: Params): string => fill(dict[key] ?? fr[key] ?? key, params);
  const tp = (base: string, n: number, params?: Params): string => {
    const one = lang === 'fr' ? n < 2 : n === 1;
    return t(`${base}.${one ? 'one' : 'other'}` as Key, { n, ...params });
  };
  return { lang, setLang, t, tp };
}

const DEFAULT: I18n = build('fr', () => undefined);
const Ctx = createContext<I18n>(DEFAULT);

/** Langue active pour le code hors composants (libellés, annonces, messages d'erreur). Mise à jour à chaque rendu du fournisseur,
 *  donc toujours cohérente avec ce que les composants affichent. */
let current: I18n = DEFAULT;
export const tr = (key: Key, params?: Params): string => current.t(key, params);
export const trp = (base: string, n: number, params?: Params): string => current.tp(base, n, params);
export const currentI18n = (): I18n => current;
export const currentLang = (): Lang => current.lang;
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', de: 'de-DE', it: 'it-IT' };
/** Étiquette de langue BCP 47 pour les dates et les nombres. */
export const locale = (): string => LOCALES[current.lang];

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? detectLang());
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignoré */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => build(lang, setLang), [lang, setLang]);
  current = value;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = (): I18n => useContext(Ctx);

/** Sélecteur de langue placé en haut de page. */
export function LanguageSelect() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-xs text-ivory-200">
      <span className="sr-only sm:not-sr-only">{t('lang.label')}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t('lang.label')}
        className="rounded-full border border-ivory-200/25 bg-ink-800/80 px-3 py-1.5 text-sm text-ivory-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
