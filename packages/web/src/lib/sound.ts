/**
 * Sons synthétisés (Web Audio API, aucun fichier externe) : froissement de cartes, jetons et cloches, plutôt que de
 * simples bips ; plus la vibration mobile. Silencieux si le réglage « Sons » est désactivé, si l'appareil ne supporte pas l'API, ou si `prefers-reduced-motion` est
 * actif pour la vibration.
 */
let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/**
 * Chaîne audio commune : compresseur doux (pas de saturation quand plusieurs sons se chevauchent), filtre passe-bas
 * qui adoucit les aigus, et un petit écho diffus qui donne de l'espace aux notes (effet de salle feutrée).
 */
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7500;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.11;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    const input = ctx.createGain();
    input.connect(dry).connect(lp);
    input.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(lp);
    lp.connect(comp).connect(ctx.destination);
    bus = input;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Note de cloche/marimba : fondamentale + partiels légèrement inharmoniques, attaque douce, chute naturelle. */
function bell(freq: number, duration = 0.5, gain = 0.1, delay = 0, brightness = 1): void {
  const c = audioCtx();
  if (!c || !bus) return;
  const t0 = c.currentTime + delay;
  const master = c.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  master.connect(bus);
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.01, 0.38 * brightness, 0.55],
    [3.98, 0.16 * brightness, 0.3],
    [5.4, 0.07 * brightness, 0.18],
  ];
  for (const [ratio, level, decay] of partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.setValueAtTime(level, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * decay);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }
}

/** Salve de bruit filtré : froissement/claquement de carte, jeton posé sur le feutre. */
function noise(duration: number, freq: number, q = 1, gain = 0.1, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
  const c = audioCtx();
  if (!c || !bus) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f).connect(g).connect(bus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + duration + 0.02);
}

/** Pulsation sourde (bois/feutre) : sinus dont la hauteur chute très vite. */
function thump(from: number, to: number, duration: number, gain = 0.14, delay = 0): void {
  const c = audioCtx();
  if (!c || !bus) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(bus);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Clic de jeton : claquement sec + résonance brève de la céramique. */
function chip(delay = 0, gain = 0.09, pitch = 1): void {
  noise(0.03, 3800 * pitch, 2.5, gain, delay, 'highpass');
  bell(1850 * pitch, 0.14, gain * 0.55, delay, 0.4);
  thump(220, 150, 0.05, gain * 0.7, delay);
}

export const Sound = {
  /** Sélection d'une carte : petit tapotement de carte sur le feutre. */
  select: () => {
    thump(260, 160, 0.06, 0.09);
    noise(0.04, 2400, 1.2, 0.05);
  },
  /** Une carte se retourne : glissement de papier puis claquement. */
  flip: () => {
    noise(0.11, 1500, 0.8, 0.07, 0, 'bandpass', 5200);
    noise(0.035, 3200, 1.5, 0.08, 0.1);
    thump(190, 120, 0.06, 0.06, 0.1);
  },
  /** Validation d'un choix : deux jetons qui se posent. */
  confirm: () => {
    chip(0, 0.08, 1);
    chip(0.07, 0.09, 1.12);
    bell(784, 0.35, 0.05, 0.05, 0.7);
  },
  /** C'est maintenant au joueur d'agir : deux notes de marimba, montantes et douces. */
  yourTurn: () => {
    bell(659, 0.55, 0.11, 0);
    bell(988, 0.8, 0.11, 0.13);
  },
  /** Manche ou partie gagnée : arpège de cloches, puis cascade de jetons. */
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.9, 0.1, i * 0.1));
    bell(1318.5, 1.3, 0.08, 0.42, 0.8);
    [0.5, 0.56, 0.61, 0.67, 0.72].forEach((d, i) => chip(d, 0.05, 0.9 + (i % 3) * 0.12));
  },
  /** Refus, erreur : coup sourd et bref, sans stridence. */
  error: () => {
    thump(170, 85, 0.16, 0.16);
    noise(0.05, 500, 1, 0.05, 0, 'lowpass');
  },
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
