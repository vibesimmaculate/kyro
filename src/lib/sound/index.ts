/**
 * The sound of the games wing.
 *
 * Every sound here is synthesised at runtime from oscillators and envelopes —
 * there are no audio files to download, which means the first tap is never
 * silent while a sample loads, and the whole system costs about three
 * kilobytes.
 *
 * The design rule: sound reports what happened, it never oversells it. A win
 * chimes in proportion to how much you actually won. A loss is a short, low,
 * unglamorous thud — it is never dressed up as anything else, because a losing
 * round that sounds like a winning one is the oldest trick in this industry and
 * it is not one KYRO plays.
 *
 * The rising scale in `step()` is the exception worth naming: the pitch climbs
 * because the multiplier climbs. It feels good precisely because it is telling
 * the truth about the number on screen.
 */

export type SoundName =
  | "tick"
  | "select"
  | "step"
  | "reveal"
  | "win"
  | "bigWin"
  | "lose"
  | "cashout"
  | "drop"
  | "bounce"
  | "climb"
  | "break";

const STORAGE_KEY = "kyro.sound";

/**
 * A minor pentatonic scale, in semitones from the root.
 *
 * Pentatonic because every note in it sits comfortably with every other, so a
 * run of eight rising steps resolves rather than souring — which matters when
 * the player is the one choosing how far up the scale to go.
 */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
const ROOT_HZ = 220;

function semitone(steps: number): number {
  return ROOT_HZ * Math.pow(2, steps / 12);
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
}

let engine: Engine | undefined;
let enabled = true;
let unlocked = false;

/** Reads the stored preference. Defaults to on — this is a games wing. */
export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return true;
  return stored === "on";
}

/**
 * Subscribers for `useSyncExternalStore`.
 *
 * The preference lives in localStorage, which React cannot see. Exposing it as
 * a proper external store is what lets a component read it without an effect
 * that writes state on mount — the pattern the React compiler rightly rejects.
 */
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
  if (!next && engine) {
    // Silence anything mid-flight rather than letting a tail ring out.
    engine.master.gain.cancelScheduledValues(engine.ctx.currentTime);
    engine.master.gain.setValueAtTime(0, engine.ctx.currentTime);
  } else if (next && engine) {
    engine.master.gain.setValueAtTime(0.9, engine.ctx.currentTime);
  }
}

/**
 * Browsers refuse to start audio without a gesture, so the context is created
 * on the first interaction rather than at import. Calling this repeatedly is
 * free.
 */
export function unlockSound(): void {
  if (typeof window === "undefined" || unlocked) return;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = soundEnabled() ? 0.9 : 0;
    master.connect(ctx.destination);
    engine = { ctx, master };
    enabled = soundEnabled();
    unlocked = true;
    void ctx.resume();
  } catch {
    // No audio available. Every call below becomes a no-op; nothing else in
    // the product depends on sound existing.
  }
}

interface ToneOptions {
  readonly freq: number;
  readonly duration: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly delay?: number;
  /** Slide to this frequency over the note's life. */
  readonly glideTo?: number;
}

function tone({ freq, duration, type = "sine", gain = 0.2, delay = 0, glideTo }: ToneOptions): void {
  if (!engine || !enabled) return;
  const { ctx, master } = engine;
  const start = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + duration);
  }

  // A fast attack and an exponential decay: percussive, and short enough that
  // rapid play never turns into a drone.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Filtered white noise — the body of a thud, a click or a bounce. */
function noise(duration: number, gain = 0.12, frequency = 1400, delay = 0): void {
  if (!engine || !enabled) return;
  const { ctx, master } = engine;
  const start = ctx.currentTime + delay;

  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Deterministic-enough noise without Math.random, which is banned repo-wide
    // so that nothing anywhere near an outcome can reach for it by habit.
    data[i] = Math.sin(i * 12.9898) * 43758.5453 % 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(frequency, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(master);
  source.start(start);
  source.stop(start + duration);
}

/**
 * Plays a sound.
 *
 * `intensity` scales the ones that should reflect magnitude — a win worth
 * twenty times the stake is allowed to sound bigger than one worth 1.02×,
 * and nothing else is.
 */
export function play(name: SoundName, intensity = 0): void {
  if (!engine || !enabled) return;

  switch (name) {
    case "tick":
      tone({ freq: 880, duration: 0.03, type: "square", gain: 0.05 });
      break;

    case "select":
      tone({ freq: 660, duration: 0.06, type: "triangle", gain: 0.1 });
      break;

    case "step": {
      // The rising scale. `intensity` is the step index, so the pitch climbs
      // with the multiplier it is reporting.
      const index = Math.min(SCALE.length - 1, Math.max(0, Math.round(intensity)));
      const note = semitone(SCALE[index] ?? 0);
      tone({ freq: note * 2, duration: 0.16, type: "triangle", gain: 0.16 });
      tone({ freq: note * 4, duration: 0.1, type: "sine", gain: 0.05, delay: 0.01 });
      noise(0.03, 0.04, 3000);
      break;
    }

    case "reveal":
      tone({ freq: 520, duration: 0.08, type: "triangle", gain: 0.1 });
      noise(0.04, 0.05, 2200);
      break;

    case "win": {
      // A major triad. Louder and brighter the more was actually won, capped
      // so a huge multiplier cannot become painful.
      const scaled = Math.min(1, Math.max(0, intensity));
      const gain = 0.14 + scaled * 0.1;
      const root = semitone(12);
      tone({ freq: root, duration: 0.35, type: "triangle", gain });
      tone({ freq: root * 1.25, duration: 0.35, type: "triangle", gain: gain * 0.8, delay: 0.05 });
      tone({ freq: root * 1.5, duration: 0.4, type: "sine", gain: gain * 0.7, delay: 0.1 });
      break;
    }

    case "bigWin": {
      // An arpeggio, reserved for genuinely large multiples. It is a rare
      // sound on purpose: something that plays constantly stops meaning
      // anything.
      const notes = [0, 4, 7, 12, 16, 19];
      notes.forEach((step, i) => {
        tone({
          freq: semitone(step + 12),
          duration: 0.3,
          type: "triangle",
          gain: 0.16,
          delay: i * 0.07,
        });
      });
      break;
    }

    case "lose":
      // Short, low, and over quickly. No drama, no sting that invites another go.
      tone({ freq: 180, duration: 0.22, type: "sine", gain: 0.14, glideTo: 90 });
      noise(0.12, 0.07, 500);
      break;

    case "cashout": {
      // Two clean notes resolving upward: the sound of stopping deliberately,
      // which is the decision the game most wants to reward.
      tone({ freq: semitone(12), duration: 0.18, type: "triangle", gain: 0.17 });
      tone({ freq: semitone(19), duration: 0.3, type: "triangle", gain: 0.15, delay: 0.09 });
      break;
    }

    case "drop":
      tone({ freq: 420, duration: 0.09, type: "sine", gain: 0.1, glideTo: 300 });
      break;

    case "bounce": {
      // Pitch drifts slightly with depth so twelve bounces do not sound like
      // one sound repeated twelve times.
      const depth = Math.min(1, Math.max(0, intensity));
      noise(0.025, 0.05, 1800 - depth * 700);
      tone({ freq: 900 - depth * 260, duration: 0.03, type: "square", gain: 0.04 });
      break;
    }

    case "climb": {
      // Crash's continuous rise, called on a timer while the curve runs.
      const t = Math.min(1, Math.max(0, intensity));
      tone({ freq: 300 + t * 900, duration: 0.06, type: "sawtooth", gain: 0.04 });
      break;
    }

    case "break":
      tone({ freq: 240, duration: 0.4, type: "sawtooth", gain: 0.16, glideTo: 60 });
      noise(0.25, 0.12, 900);
      break;
  }
}

/**
 * A short haptic tap on devices that support it.
 *
 * Kept alongside sound because it serves the same purpose — confirming that a
 * tap registered — and because it works for someone playing with the sound off.
 */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!enabled) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Blocked by the platform. Nothing to recover from.
  }
}

/** Convenience for the common case: a sound and a tap together. */
export function feedback(name: SoundName, intensity = 0, vibration: number | number[] = 8): void {
  play(name, intensity);
  haptic(vibration);
}
