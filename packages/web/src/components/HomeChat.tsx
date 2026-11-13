import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, Button, Panel, inputClass } from './ui';
import { ApiError, type PublicChatMessage } from '../lib/api';
import { useAccount, useClient } from '../lib/context';
import { errorText } from '../lib/tbText';
import { currentI18n, useI18n } from '../i18n';

const NICK_KEY = 'poker.chat.nick.v1';
const POLL_MS = 4000;
const NICK_RE = /^[\p{L}\p{N} _.'-]{1,20}$/u;
const read = (): string => {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
};
const hhmm = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Salon public de la page d'accueil : tout le monde peut lire, un joueur connecté écrit sous son pseudo, un invité
 * choisit le sien. Les messages ne sont pas conservés (les derniers seulement) ; les liens sont refusés par le serveur.
 */
export function HomeChat() {
  const { t } = useI18n();
  const client = useClient();
  const me = useAccount((s) => s.account);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [text, setText] = useState('');
  const [nick, setNick] = useState(read);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const last = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const stick = useRef(true);

  const merge = (incoming: PublicChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      return add.length ? [...cur, ...add].slice(-120) : cur;
    });
    last.current = Math.max(last.current, ...incoming.map((m) => m.id));
  };

  useEffect(() => {
    let off = false;
    const load = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await client.chatList(last.current);
        if (off) return;
        merge(r.messages);
        last.current = Math.max(last.current, r.last);
        setLoaded(true);
      } catch {
        /* serveur injoignable : on réessaie au prochain tour, sans bruit */
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [client]);

  // Reste en bas de la discussion, sauf si le lecteur est remonté lire plus haut.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const nickOk = Boolean(me) || NICK_RE.test(nick.trim());
  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !nickOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!me) {
        try {
          localStorage.setItem(NICK_KEY, nick.trim());
        } catch {
          /* ignoré */
        }
      }
      const m = await client.chatPost({ text: clean, ...(me ? {} : { nickname: nick.trim() }) });
      stick.current = true;
      merge([m]);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NETWORK' ? t('chat.offline') : errorText(currentI18n(), err, t('chat.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="overflow-hidden p-0" >
      <section aria-labelledby="home-chat-title">
        <header className="flex items-center justify-between gap-2 border-b border-ivory-100/10 px-4 py-2.5">
          <h2 id="home-chat-title" className="font-display text-lg text-ivory-50">{t('chat.title')}</h2>
          <span className="flex items-center gap-1.5 text-[11px] text-jade-300"><span className="h-1.5 w-1.5 animate-pulseRing rounded-full bg-jade-400" aria-hidden="true" />{t('chat.live')}</span>
        </header>
        <ul
          ref={list}
          role="log"
          aria-label={t('chat.log')}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="scroll-thin h-64 space-y-2 overflow-y-auto px-3 py-3"
        >
          {loaded && messages.length === 0 && <li className="py-8 text-center text-xs text-ivory-300/70">{t('chat.empty')}</li>}
          {messages.map((m) => {
            const mine = me ? m.registered && m.nickname === me.nickname : nick.trim() !== '' && !m.registered && m.nickname === nick.trim();
            return (
              <li key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar nickname={m.nickname} avatar={m.avatar} size={26} />
                <div className={`min-w-0 max-w-[82%] rounded-2xl px-3 py-1.5 text-sm ${mine ? 'rounded-tr-sm bg-gold-500/20 text-ivory-50' : 'rounded-tl-sm bg-ink-700/70 text-ivory-100'}`}>
                  <p className="flex items-baseline gap-2 text-[11px]">
                    <span className={`truncate font-semibold ${m.registered ? 'text-gold-300' : 'text-ivory-200'}`}>{m.nickname}</span>
                    <span className="shrink-0 text-ivory-300/60">{hhmm(m.at)}</span>
                  </p>
                  <p className="break-words">{m.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <form onSubmit={submit} className="space-y-2 border-t border-ivory-100/10 px-3 py-3">
          {me ? (
            <p className="text-[11px] text-ivory-300/80">{t('chat.as', { name: me.nickname })}</p>
          ) : (
            <input aria-label={t('chat.nick')} className={`${inputClass} min-h-[40px] py-1.5 text-sm`} value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder={t('chat.nick')} autoComplete="nickname" />
          )}
          <div className="flex items-center gap-2">
            <input aria-label={t('chat.placeholder')} className={`${inputClass} min-h-[40px] flex-1 py-1.5 text-sm`} value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} autoComplete="off" enterKeyHint="send" />
            <Button type="submit" disabled={busy || !nickOk || text.trim() === ''} className="min-h-[40px] px-4 py-1.5 text-sm">{t('chat.send')}</Button>
          </div>
          {error && <p role="alert" className="text-xs text-ruby-200">{error}</p>}
          <p className="text-[11px] text-ivory-300/60">{t('chat.rules')}</p>
        </form>
      </section>
    </Panel>
  );
}
