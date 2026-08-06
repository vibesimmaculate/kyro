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
  | "impact"
  | "tumble"
  | "dig"
  | "bomb"
  | "ratchet"
  | "chime";

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
const lift10 = (base: number): number => base * (1 + intensity() * 0.25);


/* ── What the research actually says, and what this does with it ────────── */

/**
 * Two findings shape every reward sound below, and one of them is a warning.
 *
 * **Reward is two events, not one.** Imaging work on musical pleasure
 * (Salimpoor et al., *Nature Neuroscience* 2011) found dopamine released in two
 * anatomically distinct phases: in the caudate during *anticipation*, and in
 * the nucleus accumbens at the peak itself. The build is not packaging around
 * the payoff — it is half of the reward. So every celebration here is a rise
 * and a resolution, the rise gets longer the larger the win, and the gap
 * between them is deliberate.
 *
 * **Reward is prediction.** The follow-up work (Salimpoor et al., *Trends in
 * Cognitive Sciences* 2015; Ferreri et al., *PNAS* 2019) frames musical
 * pleasure as expectation set up and then met or knowingly violated. That is
 * what a cadence is, so the wins here are cadences: a dominant that wants to
 * resolve, and a tonic that resolves it. A jackpot resolves somewhere you did
 * not expect.
 *
 * **And the warning.** The gambling-specific literature — Dixon and colleagues
 * on losses disguised as wins, in *Journal of Gambling Studies* — shows that
 * celebratory audio over a losing outcome makes players materially
 * *overestimate how often they won*. Sound is powerful enough to rewrite what
 * someone believes happened to their money. That is exactly why the losing
 * sound in this file is short, low, unresolved and never scaled by anything,
 * and why there is no near-miss cue anywhere in it. Everything below is built
 * to make a real win feel as good as it can. None of it is pointed at a loss.
 */

/**
 * How many wins in a row, for the transposition.
 *
 * A streak is a real thing that is really happening, so reflecting it is honest
 * — unlike a near-miss, which is a loss dressed as an event. Each consecutive
 * win lifts the cadence by a scale degree, which sets up a pattern the ear
 * starts predicting; the prediction is the anticipation the imaging work is
 * about. It resets on any loss and caps out, so it cannot climb forever.
 */
let streak = 0;

export function noteWin(): number {
  streak = Math.min(6, streak + 1);
  return streak;
}

export function noteLoss(): void {
  streak = 0;
}

/**
 * Scale degrees for a run of wins, in the same minor pentatonic as everything
 * else — so six wins in a row climb an octave and still resolve.
 */
const STREAK_LIFT = [0, 0, 2, 3, 5, 7, 12] as const;

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
 * A cadence: a chord that wants to resolve, and the one that resolves it.
 *
 * This is the whole "expectation then fulfilment" mechanism in two chords. The
 * dominant is deliberately unstable — it is the sound of a question — and the
 * tonic answers it. Played at a win, the resolution lands at the same instant
 * the figure does.
 *
 * `lift` transposes the pair, which is what a win streak does to it.
 */
function cadence(options: {
  readonly gain: number;
  readonly lift: number;
  readonly hold: number;
  /** Resolves somewhere unexpected. Reserved for the top of the range. */
  readonly surprise?: boolean;
}): void {
  const root = 12 + options.lift;

  // The question. A dominant seventh, short, slightly bright.
  [7, 11, 14, 17].forEach((interval, i) => {
    tone({
      freq: hz(root + interval - 12),
      duration: options.hold,
      gain: options.gain * 0.5,
      type: "sawtooth",
      voices: 3,
      spread: 12,
      delay: i * 0.008,
      attack: 0.006,
      decay: options.hold * 0.4,
      sustain: 0.5,
      release: options.hold * 0.5,
      pan: (i / 3 - 0.5) * 0.5,
      filter: { freq: 1200, to: 3600, q: 1.1 },
      sends: { reverb: 0.3, delay: 0.12 },
    });
  });

  // The answer. A surprise resolution goes to the flat submediant instead of
  // home — the harmonic shift that turns a good ending into a memorable one.
  const answer = options.surprise ? root + 8 : root;
  chord(answer, {
    duration: 1.0,
    gain: options.gain,
    delay: options.hold * 0.92,
    voices: 6,
    spread: 22,
  });
  sub({ freq: hz(answer - 24), duration: 0.8, gain: 0.3, delay: options.hold * 0.92 });
}

/**
 * The drop.
 *
 * Anticipation, a beat of nothing, then resolution — the two phases, with the
 * silence between them doing real work. The rise gets longer the bigger the
 * win, because the anticipation phase is where half the reward lives and a
 * larger prize has earned a longer wait for it.
 */
function winDrop(strength: number, lift: number): void {
  const gain = lift10(0.2) * (0.7 + strength * 0.5);
  // 420ms at the bottom of the range, 760ms at the top.
  const build = 0.42 + strength * 0.34;

  riser(build, 0.1 + strength * 0.03);

  window.setTimeout(
    () => {
      if (!isReady() || !enabled) return;
      impact(0.8 + strength * 0.3);
      cadence({ gain, lift, hold: 0.22, surprise: strength >= 0.9 });
      shimmer([0, 7, 12, 19, 24, 19, 12], gain * 0.4, 0.3);
    },
    Math.round(build * 1000),
  );
}

/**
 * Plays a sound.
 *
 * `level` scales the ones that should reflect magnitude — a win worth fifty
 * times the stake is allowed to sound bigger than one worth 1.02×. It scales
 * nothing else, so a loss cannot be made to feel like a near-miss.
 */
export function play(name: SoundName, level = 0, pan = 0): void {
  // The streak resets on any losing sound, wherever it was played from — a
  // run of wins that survives a loss would be a lie the audio was telling.
  if (name === "lose" || name === "break") streak = 0;
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
      // A short cadence: the question and its answer, a beat apart. Each win in
      // a row lifts it a scale degree, so a run of them climbs.
      const gain = lift10(0.17 + strength * 0.08);
      impact(0.45 + strength * 0.25);
      cadence({ gain, lift: STREAK_LIFT[streak] ?? 0, hold: 0.16 });
      shimmer([12, 19, 24], gain * 0.34, 0.22);
      break;
    }

    case "bigWin":
      // The drop. Rare on purpose — a sound that plays constantly stops
      // meaning anything, and this one has to still mean something on the
      // fiftieth round.
      winDrop(strength, STREAK_LIFT[streak] ?? 0);
      break;

    case "jackpot":
      // The top of the range, and audibly a different category rather than a
      // longer version of the same thing: the drop, then a second one an
      // octave up while the first is still ringing.
      winDrop(1, STREAK_LIFT[streak] ?? 0);
      window.setTimeout(() => {
        if (!isReady() || !enabled) return;
        impact(1);
        chord(24, { duration: 1.5, gain: lift10(0.16), voices: 7, spread: 30 });
        shimmer([0, 7, 12, 19, 24, 31, 36], lift10(0.1), 0);
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


    case "tumble": {
      // Dice. Three irregular knocks in quick succession — a cube landing on
      // its corners, not a single generic click.
      for (let i = 0; i < 3; i += 1) {
        const wobble = vary();
        tone({
          freq: (300 + i * 60) * (1 + wobble * 0.14),
          duration: 0.05,
          type: "triangle",
          gain: 0.06 - i * 0.01,
          delay: i * 0.055 + Math.abs(wobble) * 0.02,
          attack: 0.001,
          decay: 0.02,
          sustain: 0.1,
          release: 0.03,
          filter: { freq: 1100, q: 1.2 },
          pan: wobble * 0.4,
          sends: { reverb: 0.2 },
        });
        noise({
          duration: 0.03,
          gain: 0.03,
          delay: i * 0.055,
          attack: 0.001,
          release: 0.024,
          filter: { freq: 900, to: 400 },
        });
      }
      break;
    }

    case "dig":
      // Mines, on a safe tile. Soft, granular, and over immediately — it has
      // to be repeatable twenty times without wearing.
      noise({
        duration: 0.06,
        gain: 0.05 * fatigue("dig", nowMs()),
        attack: 0.002,
        decay: 0.02,
        sustain: 0.2,
        release: 0.04,
        filter: { type: "bandpass", freq: 700 * (1 + vary() * 0.2), q: 0.9 },
        pan,
      });
      tone({
        freq: 220 * (1 + vary() * 0.1),
        duration: 0.07,
        type: "sine",
        gain: 0.05,
        attack: 0.002,
        release: 0.05,
      });
      break;

    case "bomb":
      // Mines, on a mine. A real explosion: crack, body, and a sub that
      // arrives underneath a moment later.
      noise({
        duration: 0.09,
        gain: 0.16,
        attack: 0.001,
        decay: 0.03,
        sustain: 0.3,
        release: 0.06,
        filter: { freq: 6000, to: 1800 },
      });
      noise({
        duration: 0.7,
        gain: 0.14,
        attack: 0.004,
        decay: 0.2,
        sustain: 0.25,
        release: 0.45,
        filter: { freq: 1600, to: 120 },
        sends: { reverb: 0.5 },
      });
      sub({ freq: 90, glideTo: 28, duration: 0.8, gain: 0.4, delay: 0.02 });
      duckFor(0.55, 0.45);
      break;

    case "ratchet": {
      // The wheel's ticker: a stiff sprung reed, not a click. Pitch rises very
      // slightly as the wheel slows, which is the cue that it is about to stop.
      const wobble = vary();
      tone({
        freq: (1180 + strength * 260) * (1 + wobble * 0.05),
        duration: 0.03,
        type: "square",
        gain: 0.035 * fatigue("ratchet", nowMs()),
        attack: 0.0008,
        decay: 0.008,
        sustain: 0.1,
        release: 0.018,
        filter: { freq: 2600, q: 3.2 },
        pan: 0.2 + wobble * 0.2,
      });
      break;
    }

    case "chime":
      // Tower, clearing a floor. A struck bar with a long tail, so a climb of
      // eight of them turns into a phrase rather than eight events.
      tone({
        freq: hz((SCALE[Math.min(SCALE.length - 1, Math.round(level))] ?? 0) + 24),
        duration: 0.7,
        type: "sine",
        gain: 0.1,
        attack: 0.002,
        decay: 0.22,
        sustain: 0.22,
        release: 0.45,
        sends: { reverb: 0.55, delay: 0.3 },
      });
      tone({
        freq: hz((SCALE[Math.min(SCALE.length - 1, Math.round(level))] ?? 0) + 36),
        duration: 0.35,
        type: "sine",
        gain: 0.035,
        delay: 0.01,
        sends: { reverb: 0.6 },
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
  noteWin();
  if (multiplier >= 250_000) feedback("jackpot", 1, [20, 40, 20, 40, 60]);
  else if (multiplier >= 50_000) feedback("bigWin", Math.min(1, multiplier / 250_000), vibration);
  else feedback("win", Math.min(1, multiplier / 60_000), vibration);
}
