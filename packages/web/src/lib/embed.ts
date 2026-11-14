/** Cadre intégré de la vue mosaïque : l'application tourne dans un <iframe> et n'affiche qu'une seule table. */
export type Pane = { kind: 'poker'; slot: number } | { kind: 'blackjack' } | { kind: 'tableau'; code: string };

/** Paramètre `pane` de l'adresse : `poker:2`, `blackjack` ou `tableau:CODE`. Ignoré hors d'un cadre. */
export function parsePane(search: string, inFrame: boolean): Pane | null {
  if (!inFrame) return null;
  const v = new URLSearchParams(search).get('pane');
  if (!v) return null;
  const [kind, arg = ''] = v.split(':');
  if (kind === 'poker' && /^[0-3]$/.test(arg)) return { kind: 'poker', slot: Number(arg) };
  if (kind === 'blackjack') return { kind: 'blackjack' };
  if (kind === 'tableau' && /^[A-Za-z0-9-]{3,24}$/.test(arg)) return { kind: 'tableau', code: arg };
  return null;
}

export function currentPane(): Pane | null {
  try {
    return parsePane(window.location.search, window.self !== window.top);
  } catch {
    return parsePane(window.location.search, true);
  }
}

/** Adresse du cadre d'une table. */
export function paneUrl(p: Pane): string {
  const v = p.kind === 'poker' ? `poker:${p.slot}` : p.kind === 'tableau' ? `tableau:${p.code}` : 'blackjack';
  return `${window.location.pathname}?pane=${encodeURIComponent(v)}`;
}

export type PaneMessage = { type: 'mosaic:focus' } | { type: 'mosaic:gone' };
export function tellParent(msg: PaneMessage & { pane: string }): void {
  try {
    window.parent.postMessage(msg, window.location.origin);
  } catch {
    /* ignoré */
  }
}
