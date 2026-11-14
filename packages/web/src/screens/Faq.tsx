import { useMemo, useState } from 'react';
import { Button, Eyebrow, inputClass, Panel, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { FAQ, searchFaq } from '../faq/content';

/** Foire aux questions : recherche, rubriques repliables, lien vers « Un bug ? » pour une question absente. */
export function FaqScreen({ onBack, onFeedback }: { onBack: () => void; onFeedback?: () => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => searchFaq(query, FAQ), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-4">
      <Button variant="secondary" onClick={onBack}>{t('legal.retour')}</Button>
      <Panel className="p-5 sm:p-8">
        <Eyebrow>Flash Poker</Eyebrow>
        <Title className="mt-1">{t('faq.title')}</Title>
        {lang !== 'fr' && <p className="mt-4 rounded-lg border border-ivory-100/15 bg-black/20 px-3 py-2 text-xs text-ivory-200">{t('faq.fr_only')}</p>}
        <div lang="fr">
          <label htmlFor="faq-search" className="sr-only">{t('faq.search')}</label>
          <input id="faq-search" type="search" className={`${inputClass} mt-5`} placeholder={t('faq.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {!searching && (
            <nav aria-label={t('faq.title')} className="mt-4 flex flex-wrap gap-2">
              {FAQ.map((s) => (
                <a key={s.id} href={`#faq-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`faq-${s.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }} className="rounded-full border border-ivory-100/15 px-3 py-1.5 text-xs text-ivory-200 transition hover:border-gold-500/50 hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                  {s.title}
                </a>
              ))}
            </nav>
          )}
          {sections.length === 0 && <p role="status" className="mt-6 text-sm text-ivory-200">{t('faq.empty')}</p>}
          {sections.map((s) => (
            <section key={s.id} id={`faq-${s.id}`} aria-labelledby={`faq-h-${s.id}`} className="mt-7 scroll-mt-4">
              <h3 id={`faq-h-${s.id}`} className="font-display text-lg text-gold-300">{s.title}</h3>
              <div className="mt-2 divide-y divide-ivory-100/10 rounded-2xl border border-ivory-100/10 bg-ink-900/50">
                {s.items.map((i) => (
                  <details key={i.q} open={searching ? true : undefined} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-medium text-ivory-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                      <span>{i.q}</span>
                      <span aria-hidden="true" className="mt-0.5 text-gold-400 transition group-open:rotate-45">+</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {i.a.map((p, k) => <p key={k} className="text-sm leading-relaxed text-ivory-100/90">{p}</p>)}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
          {onFeedback && (
            <p className="mt-8 text-sm text-ivory-200">
              {t('faq.absent')}{' '}
              <button type="button" onClick={onFeedback} className="text-gold-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">{t('faq.absent.lien')}</button>
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
