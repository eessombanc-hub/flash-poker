import { RateLimiter } from './rateLimiter';
import { ServerError } from './errors';

export interface PublicChatMessage {
  id: number;
  at: number;
  nickname: string;
  avatar: string | null;
  /** Joueur inscrit (pseudo garanti : un invité ne peut pas l'emprunter). */
  registered: boolean;
  text: string;
}

/** Message tel que le voit l'équipe de modération : avec le compte de l'auteur, jamais diffusé aux joueurs. */
export interface StaffChatMessage extends PublicChatMessage {
  authorId: string | null;
}

const publicOf = ({ authorId: _a, ...m }: StaffChatMessage): PublicChatMessage => m;

/** Les liens sont refusés : un chat ouvert à tous ne doit pas servir de panneau d'affichage. */
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:com|fr|net|org|io|ru|xyz|me|co|info|biz|ly|gg|tv|app)\b)/i;

/**
 * Salon de discussion public de la page d'accueil. Les messages ne sont jamais conservés au-delà de la mémoire du
 * serveur (derniers messages seulement) : rien n'est archivé ni rattaché à une partie. Débit limité par auteur, doublons
 * refusés, liens refusés.
 */
export class PublicChat {
  private messages: StaffChatMessage[] = [];
  private seq = 0;
  private readonly burst: RateLimiter;
  private readonly lastText = new Map<string, { text: string; at: number }>();

  constructor(private readonly now: () => number, private readonly keep = 80) {
    this.burst = new RateLimiter(4, 10_000, now);
  }

  post(author: { key: string; nickname: string; avatar: string | null; registered: boolean; userId?: string | null }, text: string): PublicChatMessage {
    if (LINK.test(text)) throw new ServerError('BAD_REQUEST', 'Les liens ne sont pas autorisés dans le chat');
    if (!this.burst.hit(author.key)) throw new ServerError('RATE_LIMITED', 'Trop de messages, ralentissez');
    const t = this.now();
    const prev = this.lastText.get(author.key);
    if (prev && prev.text.toLowerCase() === text.toLowerCase() && t - prev.at < 30_000) throw new ServerError('RATE_LIMITED', 'Message déjà envoyé à l’instant');
    this.lastText.set(author.key, { text, at: t });
    if (this.lastText.size > 2_000) for (const [k, v] of this.lastText) if (t - v.at > 60_000) this.lastText.delete(k);
    const m: StaffChatMessage = { id: ++this.seq, at: t, nickname: author.nickname, avatar: author.avatar, registered: author.registered, text, authorId: author.userId ?? null };
    this.messages.push(m);
    if (this.messages.length > this.keep) this.messages.splice(0, this.messages.length - this.keep);
    return publicOf(m);
  }

  /** Messages en mémoire, du plus récent au plus ancien, avec l'auteur (réservé à la modération). */
  forStaff(): StaffChatMessage[] {
    return [...this.messages].reverse();
  }

  /** Retire un message (modération). Vrai s'il existait encore. */
  remove(id: number): boolean {
    const i = this.messages.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.messages.splice(i, 1);
    return true;
  }

  /** Messages postérieurs à `since` (0 = les derniers, pour la première ouverture). */
  since(since: number): { messages: PublicChatMessage[]; last: number } {
    const list = since > 0 ? this.messages.filter((m) => m.id > since) : this.messages.slice(-40);
    return { messages: list.map(publicOf), last: this.seq };
  }
}
