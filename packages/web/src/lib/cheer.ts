/**
 * « Ohhh… yeahhh ! » : voix de synthèse par formants (aucun enregistrement, aucun fichier). Une source glottale
 * (dent de scie + souffle) traverse trois résonances dont les fréquences glissent d'une voyelle à l'autre.
 */
type Pt = [t: number, v: number];

function ramp(p: AudioParam, pts: Pt[], t0: number): void {
  p.setValueAtTime(pts[0]![1], t0 + pts[0]![0]);
  for (const [t, v] of pts.slice(1)) p.linearRampToValueAtTime(v, t0 + t);
}

export function renderCheer(c: BaseAudioContext, out: AudioNode, t0: number, noise: AudioBuffer): number {
  const DUR = 1.95;
  // Hauteur : « ohhh » qui monte puis retombe, courte respiration, « yeahhh » plus haut qui s'envole puis fléchit.
  const pitch: Pt[] = [[0, 135], [0.1, 152], [0.3, 168], [0.42, 156], [0.5, 160], [0.62, 192], [0.85, 238], [1.15, 282], [1.5, 262], [1.8, 214], [DUR, 176]];
  const f1: Pt[] = [[0, 390], [0.1, 470], [0.38, 440], [0.48, 320], [0.56, 300], [0.66, 600], [0.85, 800], [1.6, 780], [DUR, 680]];
  const f2: Pt[] = [[0, 780], [0.1, 880], [0.38, 830], [0.48, 1600], [0.56, 2250], [0.66, 1950], [0.85, 1700], [1.6, 1650], [DUR, 1500]];
  const f3: Pt[] = [[0, 2450], [0.48, 2500], [0.56, 3050], [0.85, 2750], [DUR, 2600]];
  const amp: Pt[] = [[0, 0], [0.05, 0.75], [0.3, 0.85], [0.42, 0.3], [0.5, 0.1], [0.56, 1.0], [0.8, 1.6], [1.4, 1.35], [DUR, 0]];

  const src = c.createOscillator();
  src.type = 'sawtooth';
  ramp(src.frequency, pitch, t0);
  const src2 = c.createOscillator();
  src2.type = 'sawtooth';
  src2.detune.value = 14;
  ramp(src2.frequency, pitch, t0);
  const vib = c.createOscillator(); // vibrato qui s'installe sur les voyelles tenues
  vib.frequency.value = 5.4;
  const vibDepth = c.createGain();
  ramp(vibDepth.gain, [[0, 0], [0.2, 0], [0.35, 2], [0.5, 0], [0.9, 2], [1.2, 9], [DUR, 6]], t0);
  vib.connect(vibDepth).connect(src.frequency);
  vibDepth.connect(src2.frequency);

  const breath = c.createBufferSource();
  breath.buffer = noise;
  breath.loop = true;
  const breathGain = c.createGain();
  breathGain.gain.value = 0.18;

  const voice = c.createGain();
  src.connect(voice);
  src2.connect(voice);
  breath.connect(breathGain).connect(voice);

  const master = c.createGain();
  ramp(master.gain, amp.map(([t, v]) => [t, v * 0.27] as Pt), t0);
  const bands: [Pt[], number, number][] = [[f1, 7, 1], [f2, 9, 0.95], [f3, 12, 0.5]];
  for (const [freqs, q, level] of bands) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    ramp(bp.frequency, freqs, t0);
    const g = c.createGain();
    g.gain.value = level * 3.2;
    voice.connect(bp).connect(g).connect(master);
  }
  // Un peu de grain dans le grave (poitrine) pour une voix moins nasale.
  const chest = c.createBiquadFilter();
  chest.type = 'lowpass';
  chest.frequency.value = 520;
  const chestGain = c.createGain();
  chestGain.gain.value = 0.35;
  voice.connect(chest).connect(chestGain).connect(master);
  master.connect(out);

  src.start(t0);
  src2.start(t0);
  vib.start(t0);
  breath.start(t0);
  for (const n of [src, src2, vib, breath]) n.stop(t0 + DUR + 0.05);
  return DUR;
}
