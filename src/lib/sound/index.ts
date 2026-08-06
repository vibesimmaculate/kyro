/**
 * The sound of the games wing.
 *
 * Synthesised at runtime on the engine in `./engine` — no audio files, so the
 * first tap is never silent waiting on a download and the whole system is a few
 * kilobytes rather than a few megabytes. It is also the only way these sounds
 * can be *parameterised by the round*: a win worth two times the stake and one
 * worth two hundred are the same event with different numbers, and a sampled
 * jingle cannot tell you which one just happened.
 *
 * Every sound here is layered. The industry writing on this is unanimous and
 * matches what your ears already know: a win is not a jingle, it is a sub you
 * feel, a chord you hear, a transient that makes it land and a shimmer that
 * makes it linger. Four voices with four envelopes, not one sample.
 *
 * The rule the design follows, and the reason some of it is deliberately
 * restrained: **sound reports what happened and never oversells it.** Wins
 * scale with what was actually won. A loss is short, low and unglamorous —
 * never dressed up as a near-win, never given a rising tone, never made louder
 * the longer you play. A losing round that sounds like a winning one is the
 * oldest trick in this industry and the one thing this file will not do.
 */

import {
  audioChain,
  buildChain,
  duckFor,
  isReady,
  noise,
  silence,
  sub,
  tone,
} from "./engine";
import { nowMs } from "@/lib/clock";
import { intensity } from "./intensity";

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
  | "tension"
  | "riser"
  | "impact";

const STORAGE_KEY = "kyro.sound";

/**
 * Minor pentatonic. Every note sits with every other, so a run of eight rising
 * steps resolves instead of souring — which matters when the player chooses how
 * far up the scale to climb.
 */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
const ROOT_HZ = 220;

const hz = (semitones: number): number => ROOT_HZ * Math.pow(2, semitones / 12);

/** Minor triad, minor seventh, and the ninth on top. Rich without being sweet. */
const CHORD = [0, 3, 7, 10, 14];

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

  const chain = audioChain();
  if (chain) {
    const target = next ? 0.62 : 0;
    chain.master.gain.cancelScheduledValues(chain.ctx.currentTime);
    chain.master.gain.setValueAtTime(target, chain.ctx.currentTime);
    if (!next) silence();
  }
}

/** Browsers refuse audio without a gesture, so the graph is built on first tap. */
export function unlockSound(): void {
  if (typeof window === "undefined" || unlocked) return;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    const ctx = new Ctor();
    buildChain(ctx, soundEnabled() ? 0.62 : 0);
    enabled = soundEnabled();
    unlocked = true;
    void ctx.resume();
  } catch {
    // No audio available on this device. Every call below becomes a no-op.
  }
}

/* ── Variation, and the reason for it ───────────────────────────────────── */

/**
 * Every repeated sound gets a different pitch, length and level.
 *
 * This is the single biggest thing that was wrong. A twelve-row Plinko board
 * with five balls fires roughly eighty pin strikes in three seconds, and every
 * one of them was the same click at the same pitch — which is precisely the
 * recipe for listener fatigue that the game-audio literature warns about. The
 * standard answer is a pool of variations plus per-trigger jitter, and that is
 * what this is: a cheap deterministic sequence driving small offsets in pitch,
 * gain and decay, so no two hits are ever quite the same.
 *
 * Deterministic rather than random, for the same reason as everything else
 * here: `Math.random` is banned repo-wide so nothing near an outcome reaches
 * for it out of habit.
 */
let variationState = 0x2545f491;

function vary(): number {
  variationState = (variationState * 1664525 + 1013904223) >>> 0;
  return variationState / 0x80000000 - 1;
}

/**
 * How much to duck a sound that keeps firing.
 *
 * Rapid repeats of the same sound fall away rather than piling up. Ten pins in
 * a row would otherwise be ten hits at full level stacked into a buzz; this
 * makes a burst read as a burst — the first is loud, the rest fill in behind
 * it — and recovers within about half a second of quiet.
 */
const lastPlayed = new Map<SoundName, { at: number; runs: number }>();

function fatigue(name: SoundName, at: number): number {
  const previous = lastPlayed.get(name);
  const runs = previous && at - previous.at < 220 ? Math.min(9, previous.runs + 1) : 0;
  lastPlayed.set(name, { at, runs });
  return 1 / (1 + runs * 0.28);
}

/** Adaptive intensity touches the celebrations and nothing else. */
const lift = (base: number): number => base * (1 + intensity() * 0.25);

/* ── The pieces the big moments are built from ──────────────────────────── */

/**
 * A riser.
 *
 * Noise climbing through a filter while a tone climbs underneath it. This is
 * the single most effective anticipation device in game audio: it does not tell
 * you anything, it just makes the next half-second feel inevitable.
 */
function riser(duration: number, gain = 0.1): void {
  noise({
    duration,
    gain,
    attack: duration * 0.7,
    decay: 0.01,
    sustain: 1,
    release: 0.04,
    filter: { type: "bandpass", freq: 320, to: 8200, q: 1.6 },
    sends: { reverb: 0.4 },
  });
  tone({
    freq: hz(-12),
    glideTo: hz(12),
    duration,
    gain: gain * 0.5,
    type: "sawtooth",
    attack: duration * 0.8,
    decay: 0.01,
    sustain: 1,
    release: 0.05,
    filter: { freq: 400, to: 4200, q: 4 },
    sends: { reverb: 0.3 },
  });
}

/**
 * An impact.
 *
 * Sub drop, noise body, and a duck. The three-part structure is the whole of
 * why a hit reads as physical: you feel the low end, you hear the air, and
 * everything else gets out of the way to make room for it.
 */
function impact(strength = 1): void {
  sub({ freq: 110 * (0.8 + strength * 0.4), glideTo: 34, duration: 0.55, gain: 0.42 * strength });
  noise({
    duration: 0.3,
    gain: 0.16 * strength,
    attack: 0.001,
    decay: 0.09,
    sustain: 0.16,
    release: 0.2,
    filter: { freq: 5200, to: 420 },
    sends: { reverb: 0.35 },
  });
  duckFor(0.5 * strength, 0.34);
}

/** A chord, voiced across the stereo field so it opens up rather than stacks. */
function chord(
  root: number,
  options: {
    readonly duration: number;
    readonly gain: number;
    readonly delay?: number;
    readonly type?: OscillatorType;
    readonly voices?: number;
    readonly spread?: number;
  },
): void {
  CHORD.forEach((interval, i) => {
    tone({
      freq: hz(root + interval),
      duration: options.duration,
      gain: options.gain * (i === 0 ? 1 : 0.62),
      delay: (options.delay ?? 0) + i * 0.012,
      type: options.type ?? "sawtooth",
      voices: options.voices ?? 5,
      spread: options.spread ?? 18,
      attack: 0.008,
      decay: options.duration * 0.3,
      sustain: 0.4,
      release: options.duration * 0.6,
      pan: (i / (CHORD.length - 1) - 0.5) * 0.6,
      filter: { freq: 900, to: 5200, q: 1.1 },
      sends: { reverb: 0.45, delay: 0.2 },
    });
  });
}

/** A shimmer: high plucks walking across the field, on the delay. */
function shimmer(steps: readonly number[], gain: number, offset = 0): void {
  steps.forEach((step, i) => {
    tone({
      freq: hz(step + 24),
      duration: 0.34,
      gain,
      delay: offset + i * 0.058,
      type: "triangle",
      attack: 0.002,
      decay: 0.1,
      sustain: 0.18,
      release: 0.22,
      pan: ((i / Math.max(1, steps.length - 1)) * 2 - 1) * 0.72,
      filter: { freq: 8000 },
      sends: { reverb: 0.55, delay: 0.4 },
    });
  });
}

/**
 * The drop.
 *
 * Riser, then a beat of nothing, then everything at once. The pause is not an
 * oversight — a drop with no gap before it is just a loud noise, and the beat
 * of silence is what the ear reads as the moment of impact.
 */
function winDrop(strength: number): void {
  const gain = lift(0.2) * (0.7 + strength * 0.5);

  riser(0.52, 0.11);

  window.setTimeout(() => {
    if (!isReady() || !enabled) return;
    impact(0.8 + strength * 0.3);
    chord(12, { duration: 1.1, gain, voices: 7, spread: 26 });
    sub({ freq: 55, duration: 0.9, gain: 0.3, delay: 0.02 });
    shimmer([0, 7, 12, 19, 24, 19, 12], gain * 0.4, 0.16);
  }, 520);
}

/**
 * Plays a sound.
 *
 * `level` scales the ones that should reflect magnitude — a win worth fifty
 * times the stake is allowed to sound bigger than one worth 1.02×. It scales
 * nothing else, so a loss cannot be made to feel like a near-miss.
 */
export function play(name: SoundName, level = 0, pan = 0): void {
  if (!isReady() || !enabled) return;
  const strength = Math.min(1, Math.max(0, level));

  switch (name) {
    case "tick":
      tone({
        freq: 900 * (1 + vary() * 0.07),
        duration: 0.026,
        type: "triangle",
        gain: 0.032 * fatigue("tick", nowMs()),
        attack: 0.001,
        release: 0.018,
        filter: { freq: 1900, q: 1.1 },
        pan,
      });
      break;

    case "select":
      tone({
        freq: 560,
        duration: 0.08,
        type: "triangle",
        gain: 0.13,
        attack: 0.002,
        release: 0.05,
        sends: { reverb: 0.2 },
      });
      tone({ freq: 1120, duration: 0.06, gain: 0.06, delay: 0.014, attack: 0.001 });
      break;

    case "step": {
      // The ladder. The note climbs because the multiplier climbs, and the
      // pentatonic guarantees eight of them in a row still resolve.
      const index = Math.min(SCALE.length - 1, Math.max(0, Math.round(level)));
      const note = hz((SCALE[index] ?? 0) + 12);
      tone({
        freq: note,
        duration: 0.3,
        type: "triangle",
        gain: 0.17,
        voices: 3,
        spread: 9,
        attack: 0.004,
        decay: 0.1,
        sustain: 0.32,
        release: 0.2,
        filter: { freq: 2600, to: 5600, q: 1.4 },
        sends: { reverb: 0.35, delay: 0.18 },
      });
      tone({ freq: note * 2, duration: 0.16, gain: 0.06, delay: 0.008, sends: { reverb: 0.4 } });
      sub({ freq: note / 4, duration: 0.22, gain: 0.16 });
      noise({
        duration: 0.035,
        gain: 0.05,
        attack: 0.001,
        release: 0.03,
        filter: { freq: 6400 },
      });
      break;
    }

    case "reveal":
      tone({
        freq: 760,
        duration: 0.12,
        type: "triangle",
        gain: 0.13,
        attack: 0.002,
        release: 0.08,
        filter: { freq: 4400 },
        sends: { reverb: 0.3 },
      });
      noise({
        duration: 0.05,
        gain: 0.07,
        attack: 0.001,
        release: 0.04,
        filter: { freq: 3000, to: 1200 },
      });
      break;

    case "whoosh":
      noise({
        duration: 0.38,
        gain: 0.11,
        attack: 0.16,
        decay: 0.04,
        sustain: 0.6,
        release: 0.16,
        filter: { type: "bandpass", freq: 380, to: 4200, q: 1.2 },
        sends: { reverb: 0.4 },
      });
      break;

    case "land":
      sub({ freq: 150, glideTo: 62, duration: 0.24, gain: 0.3 });
      noise({
        duration: 0.09,
        gain: 0.1,
        attack: 0.001,
        release: 0.07,
        filter: { freq: 1600, to: 300 },
        pan,
        sends: { reverb: 0.25 },
      });
      break;

    case "tension":
      // A held low note under an in-progress round. Quiet enough to sit behind.
      tone({
        freq: 73,
        duration: 0.6,
        type: "sawtooth",
        gain: 0.07,
        voices: 3,
        spread: 8,
        attack: 0.2,
        sustain: 0.7,
        release: 0.3,
        filter: { freq: 260, q: 3 },
        sends: { reverb: 0.3 },
      });
      break;

    case "riser":
      riser(0.6 + strength * 0.5, 0.1);
      break;

    case "impact":
      impact(0.6 + strength * 0.6);
      break;

    case "win": {
      // Sub, chord, transient, air. Brighter and louder the more was won.
      const gain = lift(0.17 + strength * 0.08);
      impact(0.45 + strength * 0.25);
      chord(12, { duration: 0.7, gain, voices: 5, spread: 16 });
      shimmer([12, 19, 24], gain * 0.34, 0.1);
      break;
    }

    case "bigWin":
      // The drop. Rare on purpose — a sound that plays constantly stops
      // meaning anything, and this one has to still mean something on the
      // fiftieth round.
      winDrop(strength);
      break;

    case "jackpot":
      // The top of the range, and audibly a different category rather than a
      // longer version of the same thing: the drop, then a second one an
      // octave up while the first is still ringing.
      winDrop(1);
      window.setTimeout(() => {
        if (!isReady() || !enabled) return;
        impact(1);
        chord(24, { duration: 1.5, gain: lift(0.16), voices: 7, spread: 30 });
        shimmer([0, 7, 12, 19, 24, 31, 36], lift(0.1), 0);
        noise({
          duration: 1.1,
          gain: 0.06,
          attack: 0.02,
          decay: 0.3,
          sustain: 0.3,
          release: 0.7,
          filter: { type: "bandpass", freq: 1200, to: 9000, q: 0.9 },
          sends: { reverb: 0.7 },
        });
      }, 1180);
      break;

    case "lose":
      // Short, low, over quickly. No sting that invites another go, no rising
      // tone, no shimmer. It is allowed to be dull.
      tone({
        freq: 190,
        glideTo: 78,
        duration: 0.28,
        type: "sine",
        gain: 0.15,
        attack: 0.004,
        decay: 0.1,
        sustain: 0.3,
        release: 0.16,
        sends: { reverb: 0.15 },
      });
      noise({
        duration: 0.16,
        gain: 0.06,
        attack: 0.002,
        release: 0.12,
        filter: { freq: 620, to: 220 },
      });
      break;

    case "cashout": {
      // Three notes resolving upward: the sound of stopping deliberately,
      // which is the decision most worth rewarding.
      const gain = 0.19;
      [12, 19, 24].forEach((step, i) => {
        tone({
          freq: hz(step),
          duration: 0.38,
          type: "triangle",
          gain,
          voices: 3,
          spread: 10,
          delay: i * 0.085,
          attack: 0.004,
          decay: 0.1,
          sustain: 0.4,
          release: 0.26,
          filter: { freq: 3200, to: 6400 },
          sends: { reverb: 0.45, delay: 0.25 },
        });
      });
      sub({ freq: hz(0) / 2, duration: 0.5, gain: 0.24 });
      break;
    }

    case "drop":
      tone({
        freq: 520,
        glideTo: 240,
        duration: 0.14,
        type: "triangle",
        gain: 0.12,
        attack: 0.002,
        release: 0.1,
        pan,
      });
      noise({
        duration: 0.06,
        gain: 0.06,
        attack: 0.001,
        release: 0.05,
        filter: { freq: 2800, to: 900 },
      });
      break;

    case "bounce": {
      // A wooden tap, not a glassy click. Pitch falls with depth so the drop
      // has a direction, each strike is detuned a little so no two are the
      // same, and a run of them fades rather than stacking.
      const depth = strength;
      const wobble = vary();
      const level = fatigue("bounce", nowMs()) * 0.9;

      tone({
        freq: (860 - depth * 340) * (1 + wobble * 0.09),
        duration: 0.045 + wobble * 0.008,
        type: "triangle",
        gain: 0.05 * level,
        attack: 0.001,
        decay: 0.016,
        sustain: 0.12,
        release: 0.03,
        filter: { freq: 2400 - depth * 700, q: 1.4 },
        pan,
        sends: { reverb: 0.22 },
      });
      noise({
        duration: 0.016,
        gain: 0.02 * level,
        attack: 0.001,
        release: 0.014,
        filter: { freq: 1500 - depth * 400, q: 1.1 },
        pan,
      });
      break;
    }

    case "climb":
      // The rise under Crash. A sawtooth retriggering four times a second is a
      // siren, which is exactly what it had become — this is a soft sine an
      // octave lower, quiet, short, and detuned a little each time so a long
      // round does not settle into a drone.
      tone({
        freq: (150 + strength * 620) * (1 + vary() * 0.05),
        duration: 0.13,
        type: "sine",
        gain: 0.022 + strength * 0.012,
        attack: 0.02,
        decay: 0.04,
        sustain: 0.5,
        release: 0.07,
        filter: { freq: 1400 + strength * 1200 },
        pan,
        sends: { reverb: 0.22 },
      });
      break;

    case "break":
      // A real bust. Noise burst, falling sub, no melody, no resolution.
      noise({
        duration: 0.5,
        gain: 0.2,
        attack: 0.001,
        decay: 0.14,
        sustain: 0.22,
        release: 0.34,
        filter: { freq: 4200, to: 160 },
        sends: { reverb: 0.4 },
      });
      tone({
        freq: 240,
        glideTo: 38,
        duration: 0.6,
        type: "sawtooth",
        gain: 0.17,
        voices: 3,
        spread: 14,
        attack: 0.002,
        decay: 0.16,
        sustain: 0.3,
        release: 0.4,
        filter: { freq: 1600, to: 200 },
      });
      sub({ freq: 68, glideTo: 30, duration: 0.7, gain: 0.32 });
      duckFor(0.45, 0.4);
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

export function feedback(
  name: SoundName,
  level = 0,
  vibration: number | number[] = 8,
  pan = 0,
): void {
  play(name, level, pan);
  haptic(vibration);
}

/**
 * Picks the right celebration for a multiplier, so no call site has to decide
 * what counts as big. A four-decimal multiplier in, a sound out.
 */
export function celebrate(multiplier: number, vibration: number | number[] = [12, 26, 12]): void {
  if (multiplier >= 250_000) feedback("jackpot", 1, [20, 40, 20, 40, 60]);
  else if (multiplier >= 50_000) feedback("bigWin", Math.min(1, multiplier / 250_000), vibration);
  else feedback("win", Math.min(1, multiplier / 60_000), vibration);
}
