/**
 * The sound of the games wing.
 *
 * Synthesised at runtime from oscillators, filters and envelopes. No audio
 * files, so the first tap is never silent waiting on a download, and the whole
 * system costs a couple of kilobytes.
 *
 * Sounds are built from layered *voices* rather than single tones, because one
 * sine wave sounds like a test tone and three stacked ones sound like an
 * instrument. A win is a bass note plus a triad plus a bright transient; a bomb
 * is a noise burst plus a falling sub. That layering is most of the difference
 * between "a beep played" and "something happened".
 *
 * The rule the design follows: **sound reports what happened and never oversells
 * it.** Wins scale with what was actually won. A loss is short, low and
 * unglamorous — never dressed up as a near-win, because a losing round that
 * sounds like a winning one is the oldest trick in this industry.
 */

export type SoundName =
  | "tick"
  | "select"
  | "step"
  | "reveal"
  | "win"
  | "bigWin"
  | "jackpot"
  | "lose"
  | "cashout"
  | "drop"
  | "bounce"
  | "climb"
  | "break"
  | "whoosh"
  | "land"
  | "tension";

const STORAGE_KEY = "kyro.sound";

/**
 * Minor pentatonic, in semitones. Every note sits with every other, so a run of
 * eight rising steps resolves instead of souring — which matters when the
 * player chooses how far up the scale to climb.
 */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
const ROOT_HZ = 220;

const hz = (semitones: number): number => ROOT_HZ * Math.pow(2, semitones / 12);

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
}

let engine: Engine | undefined;
let enabled = true;
let unlocked = false;

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "on";
}

const listeners = new Set<() => void>();

export function subscribeToSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  }
  for (const listener of listeners) listener();

  if (engine) {
    const target = next ? 0.85 : 0;
    engine.master.gain.cancelScheduledValues(engine.ctx.currentTime);
    engine.master.gain.setValueAtTime(target, engine.ctx.currentTime);
  }
}

/**
 * Browsers refuse audio without a gesture, so the graph is built on the first
 * interaction. A compressor sits on the master bus: several voices firing at
 * once would otherwise clip, and clipping is the thing that makes synthesised
 * audio sound cheap.
 */
export function unlockSound(): void {
  if (typeof window === "undefined" || unlocked) return;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    const ctx = new Ctor();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 22;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;

    const master = ctx.createGain();
    master.gain.value = soundEnabled() ? 0.85 : 0;

    compressor.connect(master);
    master.connect(ctx.destination);

    engine = { ctx, master, compressor };
    enabled = soundEnabled();
    unlocked = true;
    void ctx.resume();
  } catch {
    // No audio available. Every call below becomes a no-op.
  }
}

interface Voice {
  readonly freq: number;
  readonly duration: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly delay?: number;
  readonly glideTo?: number;
  /** Low-pass cutoff. Rolling it off is what stops squares sounding harsh. */
  readonly cutoff?: number;
  /** Slight detune in cents, for thickness when two voices are stacked. */
  readonly detune?: number;
}

function voice(v: Voice): void {
  if (!engine || !enabled) return;
  const { ctx, compressor } = engine;
  const start = ctx.currentTime + (v.delay ?? 0);
  const duration = v.duration;

  const osc = ctx.createOscillator();
  osc.type = v.type ?? "sine";
  osc.frequency.setValueAtTime(v.freq, start);
  if (v.detune) osc.detune.setValueAtTime(v.detune, start);
  if (v.glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.glideTo), start + duration);
  }

  const env = ctx.createGain();
  const peak = v.gain ?? 0.2;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let node: AudioNode = osc;
  if (v.cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(v.cutoff, start);
    osc.connect(filter);
    node = filter;
  }

  node.connect(env);
  env.connect(compressor);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

/** Filtered noise — the body of a thud, a click, a whoosh or an explosion. */
function noise(options: {
  duration: number;
  gain?: number;
  cutoff?: number;
  sweepTo?: number;
  delay?: number;
  type?: BiquadFilterType;
}): void {
  if (!engine || !enabled) return;
  const { ctx, compressor } = engine;
  const start = ctx.currentTime + (options.delay ?? 0);
  const frames = Math.max(1, Math.floor(ctx.sampleRate * options.duration));

  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // A deterministic hash rather than Math.random, which is banned repo-wide so
  // nothing anywhere near an outcome reaches for it out of habit.
  for (let i = 0; i < frames; i += 1) {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    data[i] = (x - Math.floor(x)) * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = options.type ?? "lowpass";
  filter.frequency.setValueAtTime(options.cutoff ?? 1400, start);
  if (options.sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, options.sweepTo),
      start + options.duration,
    );
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(options.gain ?? 0.1, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(compressor);
  source.start(start);
  source.stop(start + options.duration);
}

/**
 * Plays a sound.
 *
 * `intensity` scales the ones that should reflect magnitude — a win worth
 * fifty times the stake is allowed to sound bigger than one worth 1.02×. It
 * scales nothing else, so a loss cannot be made to feel like a near-miss.
 */
export function play(name: SoundName, intensity = 0): void {
  if (!engine || !enabled) return;
  const strength = Math.min(1, Math.max(0, intensity));

  switch (name) {
    case "tick":
      voice({ freq: 1200, duration: 0.025, type: "square", gain: 0.035, cutoff: 3000 });
      break;

    case "select":
      voice({ freq: 520, duration: 0.07, type: "triangle", gain: 0.11 });
      voice({ freq: 1040, duration: 0.05, type: "sine", gain: 0.05, delay: 0.012 });
      break;

    case "step": {
      // The rising scale: the note climbs because the multiplier climbs.
      const index = Math.min(SCALE.length - 1, Math.max(0, Math.round(intensity)));
      const note = hz((SCALE[index] ?? 0) + 12);
      voice({ freq: note, duration: 0.22, type: "triangle", gain: 0.15, cutoff: 5200 });
      voice({ freq: note * 2, duration: 0.14, type: "sine", gain: 0.07, delay: 0.008 });
      voice({ freq: note / 2, duration: 0.26, type: "sine", gain: 0.09 });
      noise({ duration: 0.03, gain: 0.05, cutoff: 5000 });
      break;
    }

    case "reveal":
      voice({ freq: 700, duration: 0.1, type: "triangle", gain: 0.11, cutoff: 4000 });
      noise({ duration: 0.045, gain: 0.06, cutoff: 2600 });
      break;

    case "whoosh":
      // Air moving: a noise sweep, no pitch. Used as the coin leaves the hand.
      noise({ duration: 0.34, gain: 0.09, cutoff: 400, sweepTo: 3600, type: "bandpass" });
      break;

    case "land":
      voice({ freq: 150, duration: 0.14, type: "sine", gain: 0.16, glideTo: 90 });
      noise({ duration: 0.06, gain: 0.08, cutoff: 1200 });
      break;

    case "tension":
      // A held low note under an in-progress round. Quiet enough to sit behind.
      voice({ freq: 70, duration: 0.5, type: "sine", gain: 0.05 });
      break;

    case "win": {
      // Bass, triad, transient. Brighter and louder the more was actually won.
      const gain = 0.14 + strength * 0.09;
      const root = hz(12);
      voice({ freq: root / 2, duration: 0.45, type: "sine", gain: gain * 0.9 });
      voice({ freq: root, duration: 0.4, type: "triangle", gain, cutoff: 6000 });
      voice({ freq: root * 1.26, duration: 0.4, type: "triangle", gain: gain * 0.8, delay: 0.045 });
      voice({ freq: root * 1.5, duration: 0.45, type: "sine", gain: gain * 0.75, delay: 0.09 });
      noise({ duration: 0.05, gain: 0.06, cutoff: 7000 });
      break;
    }

    case "bigWin": {
      // A rising arpeggio over a sustained bass. Rare on purpose — a sound that
      // plays constantly stops meaning anything.
      voice({ freq: hz(0), duration: 0.9, type: "sine", gain: 0.13 });
      [0, 4, 7, 12, 16, 19, 24].forEach((step, i) => {
        voice({
          freq: hz(step + 12),
          duration: 0.34,
          type: "triangle",
          gain: 0.15,
          delay: i * 0.062,
          cutoff: 7000,
        });
        voice({
          freq: hz(step + 24),
          duration: 0.2,
          type: "sine",
          gain: 0.06,
          delay: i * 0.062 + 0.01,
        });
      });
      break;
    }

    case "jackpot": {
      // Reserved for the very top of the range. Two octaves of arpeggio and a
      // long tail, so it is unmistakably different from an ordinary big win.
      voice({ freq: hz(-12), duration: 1.6, type: "sine", gain: 0.14 });
      [0, 4, 7, 12, 16, 19, 24, 28, 31, 36].forEach((step, i) => {
        voice({
          freq: hz(step + 12),
          duration: 0.5,
          type: "triangle",
          gain: 0.15,
          delay: i * 0.055,
          cutoff: 9000,
        });
      });
      noise({ duration: 0.5, gain: 0.05, cutoff: 900, sweepTo: 9000, type: "bandpass", delay: 0.1 });
      break;
    }

    case "lose":
      // Short, low, over quickly. No sting that invites another go.
      voice({ freq: 190, duration: 0.24, type: "sine", gain: 0.13, glideTo: 84 });
      noise({ duration: 0.14, gain: 0.06, cutoff: 520 });
      break;

    case "cashout":
      // Two clean notes resolving upward: the sound of stopping deliberately,
      // which is the decision most worth rewarding.
      voice({ freq: hz(12), duration: 0.2, type: "triangle", gain: 0.16, cutoff: 6000 });
      voice({ freq: hz(19), duration: 0.34, type: "triangle", gain: 0.15, delay: 0.095 });
      voice({ freq: hz(24), duration: 0.4, type: "sine", gain: 0.1, delay: 0.17 });
      break;

    case "drop":
      voice({ freq: 460, duration: 0.1, type: "sine", gain: 0.1, glideTo: 260 });
      noise({ duration: 0.05, gain: 0.05, cutoff: 2400 });
      break;

    case "bounce": {
      // Pitch drifts down with depth, so twelve pegs are twelve distinct taps
      // rather than one sound repeated.
      const depth = strength;
      voice({
        freq: 1500 - depth * 620,
        duration: 0.035,
        type: "triangle",
        gain: 0.07,
        cutoff: 6000,
      });
      noise({ duration: 0.02, gain: 0.04, cutoff: 3400 - depth * 1400 });
      break;
    }

    case "climb":
      // The continuous rise under Crash. Deliberately thin — it plays many
      // times a second and must never become a siren.
      voice({
        freq: 260 + strength * 1150,
        duration: 0.07,
        type: "sawtooth",
        gain: 0.028,
        cutoff: 2400,
      });
      break;

    case "break":
      // A real bust: noise burst, falling sub, no melody.
      noise({ duration: 0.4, gain: 0.15, cutoff: 3200, sweepTo: 200 });
      voice({ freq: 220, duration: 0.5, type: "sawtooth", gain: 0.14, glideTo: 45, cutoff: 1400 });
      voice({ freq: 62, duration: 0.6, type: "sine", gain: 0.16 });
      break;
  }
}

/** A short haptic tap. Works for someone playing with the sound off. */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!enabled) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Blocked by the platform. Nothing to recover from.
  }
}

export function feedback(name: SoundName, intensity = 0, vibration: number | number[] = 8): void {
  play(name, intensity);
  haptic(vibration);
}

/**
 * Picks the right celebration for a multiplier, so no single call site has to
 * decide what counts as big. 4-decimal multiplier in, sound out.
 */
export function celebrate(multiplier: number, vibration: number | number[] = [12, 26, 12]): void {
  if (multiplier >= 250_000) feedback("jackpot", 1, [20, 40, 20, 40, 40]);
  else if (multiplier >= 50_000) feedback("bigWin", Math.min(1, multiplier / 250_000), vibration);
  else feedback("win", Math.min(1, multiplier / 60_000), vibration);
}
