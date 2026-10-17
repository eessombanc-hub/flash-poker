/**
 * Sons courts synthétisés (Web Audio API, aucun fichier externe) et vibration mobile. Silencieux par défaut si
 * le réglage « Sons » est désactivé, si l'appareil ne supporte pas l'API, ou si `prefers-reduced-motion` est
 * actif pour la vibration.
 */
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Une note brève : fréquence en Hz, durée en secondes, volume 0-1. */
function tone(freq: number, duration: number, gain = 0.12, delay = 0): void {
  const c = audioCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + delay;
  vol.gain.setValueAtTime(0, t0);
  vol.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(vol).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const Sound = {
  /** Sélection d'une carte. */
  select: () => tone(720, 0.05, 0.08),
  /** Une carte se retourne (6-1, Le 10, résultats). */
  flip: () => {
    tone(300, 0.07, 0.1);
    tone(500, 0.09, 0.08, 0.03);
  },
  /** Validation d'un choix. */
  confirm: () => {
    tone(520, 0.08, 0.1);
    tone(660, 0.12, 0.1, 0.06);
  },
  /** C'est maintenant au joueur d'agir. */
  yourTurn: () => {
    tone(660, 0.1, 0.11);
    tone(880, 0.16, 0.11, 0.09);
  },
  /** Manche ou partie gagnée. */
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 0.1, i * 0.08));
  },
  /** Refus, erreur. */
  error: () => tone(180, 0.14, 0.09),
};

/** Vibration mobile (ignorée si l'appareil ne le supporte pas). */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignoré (permissions, contexte non sécurisé…) */
    }
  }
}

export type SoundApi = { play: (name: keyof typeof Sound) => void; buzz: (pattern: number | number[]) => void; enabled: boolean };

/** À utiliser dans les composants : respecte le réglage « Sons » (Options), silencieux sinon. */
export function useSound(enabled: boolean): SoundApi {
  return {
    enabled,
    play: (name) => {
      if (enabled) Sound[name]();
    },
    buzz: (pattern) => {
      if (enabled) vibrate(pattern);
    },
  };
}
