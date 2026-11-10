/** Signalement des erreurs du navigateur au serveur (journal, sans donnée personnelle). */
export function reportError(baseUrl: string, message: string, stack = '', where = '', sent: Set<string> = new Set()): boolean {
  const key = `${message}|${where}`;
  if (sent.has(key) || sent.size >= 5) return false;
  sent.add(key);
  try {
    void fetch(`${baseUrl}/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, stack, where }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* réseau ou navigateur sans fetch : rien à faire */
  }
  return true;
}

export function installErrorReporting(baseUrl: string, target: Pick<Window, 'addEventListener' | 'location'> = window): void {
  const sent = new Set<string>();
  const where = (): string => `${target.location.pathname}${target.location.hash}`;
  target.addEventListener('error', (e) => {
    const ev = e as ErrorEvent;
    reportError(baseUrl, ev.message || 'Erreur', ev.error instanceof Error ? (ev.error.stack ?? '') : '', where(), sent);
  });
  target.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason as unknown;
    reportError(baseUrl, r instanceof Error ? r.message : String(r), r instanceof Error ? (r.stack ?? '') : '', where(), sent);
  });
}
