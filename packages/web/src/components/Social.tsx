import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { useClient, useGame } from '../lib/context';
import { useSettings } from '../lib/settings';
import { CHAT_MAX_CHARS, ITEM_EMOJI, ITEM_KEY, ITEM_ORDER, loadPrefs, savePrefs, type SocialPrefs } from '../lib/social';
import { Sound } from '../lib/sound';
import type { PlayerPublic, SocialMessage, ThrowItem } from '../lib/types';
import { Avatar } from './ui';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400';

function usePrefs(): [SocialPrefs, (p: SocialPrefs) => void] {
  const [prefs, setPrefs] = useState<SocialPrefs>(loadPrefs);
  return [prefs, (p) => { setPrefs(p); savePrefs(p); }];
}

/** Premier siège visible de ce joueur (la table peut en dessiner une version compacte et une version large). */
function seatRect(playerId: string): DOMRect | null {
  for (const el of document.querySelectorAll(`[data-seat="${CSS.escape(playerId)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/** Fait voler le pictogramme du siège de l'expéditeur à celui du destinataire (transformations seules, aucun filtre). */
function fly(emoji: string, from: string, to: string, onLand: () => void): void {
  const target = seatRect(to);
  if (!target) return onLand();
  const origin = seatRect(from);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('span');
  el.textContent = emoji;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:70;font-size:2rem;line-height:1;pointer-events:none;will-change:transform,opacity';
  document.body.appendChild(el);
  const tx = target.left + target.width / 2 - 16;
  const ty = target.top + target.height / 2 - 16;
  const sx = origin ? origin.left + origin.width / 2 - 16 : window.innerWidth / 2 - 16;
  const sy = origin ? origin.top + origin.height / 2 - 16 : window.innerHeight - 40;
  const done = () => {
    el.remove();
    onLand();
  };
  if (typeof el.animate !== 'function') return done();
  const pop = () => {
    const a = el.animate(
      [{ transform: `translate(${tx}px,${ty}px) scale(1)`, opacity: 1 }, { transform: `translate(${tx}px,${ty}px) scale(2.4)`, opacity: 0 }],
      { duration: 480, easing: 'ease-out', fill: 'forwards' },
    );
    a.onfinish = done;
  };
  if (reduce) return pop();
  onLand();
  const mx = (sx + tx) / 2;
  const my = Math.min(sy, ty) - 70;
  const flight = el.animate(
    [
      { transform: `translate(${sx}px,${sy}px) scale(.6) rotate(0deg)`, opacity: 0.9 },
      { transform: `translate(${mx}px,${my}px) scale(1.15) rotate(200deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px,${ty}px) scale(1) rotate(420deg)`, opacity: 1 },
    ],
    { duration: 720, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'forwards' },
  );
  flight.onfinish = pop;
}

/** Objets lancés : animation d'un siège à l'autre et annonce pour les lecteurs d'écran. À monter une fois par écran de jeu. */
export function ThrowLayer() {
  const { t } = useI18n();
  const social = useGame((s) => s.social);
  const players = useGame((s) => s.view?.players);
  const { sound } = useSettings();
  const [prefs] = usePrefs();
  const seen = useRef<Set<string>>(new Set(social.map((m) => m.id)));
  const [said, setSaid] = useState('');
  useEffect(() => {
    for (const m of social) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.kind !== 'throw' || !m.item || !m.to || prefs.hideItems) continue;
      const nameOf = (id: string) => players?.find((p) => p.id === id)?.nickname ?? '';
      setSaid(t('soc.thrown', { from: nameOf(m.from), item: t(ITEM_KEY[m.item]), to: nameOf(m.to) }));
      fly(ITEM_EMOJI[m.item], m.from, m.to, () => { if (sound) Sound.splat(); });
    }
  }, [social, players, prefs.hideItems, sound, t]);
  return <p className="sr-only" role="status">{said}</p>;
}

function line(m: SocialMessage, players: PlayerPublic[], t: ReturnType<typeof useI18n>['t']): { who: PlayerPublic | undefined; text: string } {
  const who = players.find((p) => p.id === m.from);
  const nick = (id?: string) => players.find((p) => p.id === id)?.nickname ?? '';
  return {
    who,
    text: m.kind === 'chat' ? m.text ?? '' : t('soc.thrown', { from: who?.nickname ?? '', item: m.item ? t(ITEM_KEY[m.item]) : '', to: nick(m.to) }),
  };
}

/** Bouton et panneau de chat de la table : messages, envoi d'objets amusants, préférences de masquage. */
export function ChatDock({ canThrow }: { canThrow: boolean }) {
  const { t } = useI18n();
  const client = useClient();
  const id = useId();
  const view = useGame((s) => s.view);
  const social = useGame((s) => s.social);
  const [prefs, setPrefs] = usePrefs();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [item, setItem] = useState<ThrowItem>('tomato');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [seenCount, setSeenCount] = useState(social.length);
  const [bubble, setBubble] = useState<{ id: string; text: string } | null>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const me = view?.you.playerId ?? '';
  const players = view?.players ?? [];
  const targets = useMemo(() => players.filter((p) => p.id !== me && !p.excluded), [players, me]);
  const visible = useMemo(() => social.filter((m) => (m.kind === 'chat' ? !prefs.hideChat : !prefs.hideItems)), [social, prefs]);
  const unread = open || prefs.hideChat ? 0 : social.slice(seenCount).filter((m) => m.kind === 'chat' && m.from !== me).length;

  useEffect(() => {
    if (open) setSeenCount(social.length);
  }, [open, social.length]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visible.length, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!to || !targets.some((p) => p.id === to)) setTo(targets[0]?.id ?? '');
  }, [targets, to]);
  // Aperçu court du dernier message quand le panneau est fermé.
  useEffect(() => {
    const last = social.at(-1);
    if (!last || last.kind !== 'chat' || last.from === me || open || prefs.hideChat) return;
    const who = players.find((p) => p.id === last.from)?.nickname ?? '';
    setBubble({ id: last.id, text: `${who} : ${last.text ?? ''}` });
    const timer = setTimeout(() => setBubble((b) => (b?.id === last.id ? null : b)), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    if (await client.sendSocial({ kind: 'chat', text: clean })) setText('');
    setBusy(false);
    inputRef.current?.focus();
  }
  async function throwItem() {
    if (!to || busy) return;
    setBusy(true);
    await client.sendSocial({ kind: 'throw', item, to });
    setBusy(false);
  }

  if (!view) return null;
  if (!open)
    return (
      <div className="pointer-events-none fixed bottom-3 right-3 z-40 flex max-w-[min(18rem,calc(100vw-1.5rem))] flex-col items-end gap-2">
        {bubble && <p className="pointer-events-auto truncate rounded-2xl rounded-br-sm border border-gold-500/50 bg-ink-900/95 px-3 py-1.5 text-xs text-ivory-100 shadow-panel">{bubble.text}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unread > 0 ? t('soc.open.unread', { n: unread }) : t('soc.open')}
          className={`pointer-events-auto relative flex min-h-[44px] items-center gap-1.5 rounded-full border border-gold-500/60 bg-ink-900/95 px-4 text-sm font-semibold text-gold-300 shadow-panel hover:bg-ink-800 ${focus}`}
        >
          <span aria-hidden="true">💬</span>
          {t('soc.open')}
          {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-ruby-500 px-1 text-[11px] font-bold text-white">{unread}</span>}
        </button>
      </div>
    );

  return (
    <section
      role="region"
      aria-labelledby={`${id}-t`}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      className="fixed bottom-3 right-3 z-40 flex max-h-[72dvh] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-gold-500/50 bg-ink-900 shadow-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-ivory-100/10 px-3 py-2">
        <h2 id={`${id}-t`} className="font-display text-lg text-ivory-50">{t('soc.title')}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('soc.close')} className={`flex h-9 w-9 items-center justify-center rounded-full text-ivory-200 hover:bg-ivory-100/10 ${focus}`}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <p className="px-3 pt-2 text-[11px] text-ivory-300/70">{t('soc.rules')}</p>
      <ul ref={logRef} aria-label={t('soc.log')} role="log" className="scroll-thin min-h-[5rem] flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {visible.length === 0 && <li className="py-3 text-center text-xs text-ivory-300/70">{t('soc.empty')}</li>}
        {visible.map((m) => {
          const l = line(m, players, t);
          const mine = m.from === me;
          return (
            <li key={m.id} className={`flex items-start gap-2 text-sm ${mine ? 'flex-row-reverse' : ''}`}>
              {l.who && <Avatar nickname={l.who.nickname} avatar={l.who.avatar} size={22} />}
              {m.kind === 'chat' ? (
                <p className={`max-w-[80%] break-words rounded-2xl px-3 py-1.5 ${mine ? 'rounded-tr-sm bg-gold-500/20 text-ivory-50' : 'rounded-tl-sm bg-ink-700/80 text-ivory-100'}`}>
                  {!mine && <span className="mr-1.5 text-xs font-semibold text-gold-300">{l.who?.nickname}</span>}
                  {l.text}
                </p>
              ) : (
                <p className="py-1 text-xs italic text-ivory-300/85"><span aria-hidden="true">{m.item ? ITEM_EMOJI[m.item] : ''} </span>{l.text}</p>
              )}
            </li>
          );
        })}
      </ul>

      {canThrow && targets.length > 0 && (
        <fieldset className="border-t border-ivory-100/10 px-3 py-2">
          <legend className="sr-only">{t('soc.items')}</legend>
          <div role="radiogroup" aria-label={t('soc.item.choose')} className="flex flex-wrap gap-1">
            {ITEM_ORDER.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={item === k} aria-label={t(ITEM_KEY[k])} title={t(ITEM_KEY[k])} onClick={() => setItem(k)} className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xl ${focus} ${item === k ? 'border-gold-400 bg-gold-500/20' : 'border-ivory-100/10 hover:border-ivory-100/30'}`}>
                <span aria-hidden="true">{ITEM_EMOJI[k]}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`${id}-to`} className="sr-only">{t('soc.to')}</label>
            <select id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} className={`min-h-[40px] min-w-0 flex-1 rounded-lg border border-ivory-100/20 bg-ink-800 px-2 text-sm text-ivory-50 ${focus}`}>
              {targets.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
            </select>
            <button type="button" onClick={throwItem} disabled={busy || !to} className={`min-h-[40px] shrink-0 rounded-lg bg-gold-500/90 px-3 text-sm font-semibold text-ink-950 hover:bg-gold-400 disabled:opacity-50 ${focus}`}>
              {t('soc.throw')}
            </button>
          </div>
        </fieldset>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-ivory-100/10 px-3 py-2">
        <label htmlFor={`${id}-msg`} className="sr-only">{t('soc.placeholder')}</label>
        <input ref={inputRef} id={`${id}-msg`} value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX_CHARS} placeholder={t('soc.placeholder')} autoComplete="off" enterKeyHint="send" className={`min-h-[40px] min-w-0 flex-1 rounded-lg border border-ivory-100/20 bg-ink-800 px-3 text-sm text-ivory-50 placeholder:text-ivory-300/50 ${focus}`} />
        <button type="submit" disabled={busy || text.trim() === ''} className={`min-h-[40px] shrink-0 rounded-lg bg-gold-500/90 px-3 text-sm font-semibold text-ink-950 hover:bg-gold-400 disabled:opacity-50 ${focus}`}>{t('soc.send')}</button>
      </form>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ivory-100/10 px-3 py-2 text-[11px] text-ivory-300/80">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={prefs.hideChat} onChange={(e) => setPrefs({ ...prefs, hideChat: e.target.checked })} />{t('soc.hide_chat')}</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={prefs.hideItems} onChange={(e) => setPrefs({ ...prefs, hideItems: e.target.checked })} />{t('soc.hide_items')}</label>
      </div>
    </section>
  );
}
