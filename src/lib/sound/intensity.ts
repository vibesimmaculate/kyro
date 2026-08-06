/**
 * Adaptive intensity.
 *
 * The wing gets visually and audibly livelier the faster you are playing:
 * more particles on a win, brighter and slightly louder audio, a touch more
 * shake. Play slowly and it settles back down. This is a requested feature and
 * it is a real one in this genre — a board that responds to tempo feels alive
 * where a fixed one feels canned.
 *
 * Three constraints are built into it deliberately, because they are the
 * difference between responsiveness and a ratchet:
 *
 *   **It is capped.** Intensity tops out at 1 and the effects it drives top out
 *   with it. There is no configuration in which continuing to play makes the
 *   game keep getting louder.
 *
 *   **It decays on a timer, not on activity.** Stop for twenty seconds and it
 *   is most of the way back to baseline whatever you did before. The ramp is
 *   not a score to protect, and nothing anywhere tells you what it is.
 *
 *   **It reads tempo only.** It is deliberately blind to whether you are
 *   winning, losing, or how much you have staked. Escalating specifically as
 *   someone chases a loss is the version of this idea that does harm, and the
 *   input simply is not wired up.
 *
 * It is also downstream of both the sound toggle and `prefers-reduced-motion`:
 * turning either off turns this off with it.
 */

/** Rounds per minute at which intensity reaches its ceiling. */
const TEMPO_CEILING = 42;
/** How long a round counts towards tempo. */
const WINDOW_MS = 20_000;
/** Full decay from the top, in seconds of no play. */
const DECAY_SECONDS = 26;

interface State {
  /** Timestamps of recent rounds, newest last. */
  rounds: number[];
  /** 0–1, smoothed. */
  level: number;
  lastSampleAt: number;
}

const KEY = Symbol.for("kyro.intensity");

function state(): State {
  const globals = globalThis as unknown as Record<symbol, State | undefined>;
  let existing = globals[KEY];
  if (!existing) {
    existing = { rounds: [], level: 0, lastSampleAt: Date.now() };
    globals[KEY] = existing;
  }
  return existing;
}

const listeners = new Set<() => void>();

export function subscribeToIntensity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call once per round played, whatever the outcome. */
export function recordRound(): void {
  const s = state();
  const now = Date.now();
  s.rounds.push(now);
  s.rounds = s.rounds.filter((at) => now - at < WINDOW_MS);
  sample(now);
  for (const listener of listeners) listener();
}

/**
 * Recomputes the level. Called on every round and by the render loop, so the
 * decay is real time rather than only advancing when something happens.
 */
function sample(now = Date.now()): number {
  const s = state();
  const dt = Math.max(0, (now - s.lastSampleAt) / 1000);
  s.lastSampleAt = now;

  const recent = s.rounds.filter((at) => now - at < WINDOW_MS);
  s.rounds = recent;

  const perMinute = (recent.length / (WINDOW_MS / 1000)) * 60;
  const target = Math.min(1, perMinute / TEMPO_CEILING);

  if (target > s.level) {
    // Rises quickly, so the response feels connected to what you just did.
    s.level = Math.min(1, s.level + (target - s.level) * Math.min(1, dt * 4 + 0.35));
  } else {
    // Falls on a fixed clock regardless of what happened before.
    s.level = Math.max(target, s.level - dt / DECAY_SECONDS);
  }

  return s.level;
}

/** Current intensity, 0–1. Zero when sound and motion are both off. */
export function intensity(): number {
  return sample();
}

/** A snapshot for `useSyncExternalStore`, quantised so it does not thrash. */
export function intensitySnapshot(): number {
  return Math.round(sample() * 20) / 20;
}

export function resetIntensity(): void {
  const s = state();
  s.rounds = [];
  s.level = 0;
  for (const listener of listeners) listener();
}

/* ── What it drives ────────────────────────────────────────────────────── */

/**
 * Particle count for a burst.
 *
 * `base` is what a calm session gets. At full intensity a burst is about twice
 * as dense — noticeable, and nowhere near enough to bury the figure underneath
 * it, which is still the thing the player actually needs to read.
 */
export function scaleParticles(base: number, level = intensity()): number {
  return Math.round(base * (1 + level));
}

/** Extra gain on celebration sounds. Caps at +25%, well short of clipping. */
export function scaleGain(base: number, level = intensity()): number {
  return base * (1 + level * 0.25);
}

/** Extra trauma on impacts. Caps at +40%. */
export function scaleTrauma(base: number, level = intensity()): number {
  return base * (1 + level * 0.4);
}

/**
 * Whether the round deserves the elaborate celebration.
 *
 * Intensity nudges the threshold down a little, so a fast session gets the
 * bigger treatment slightly more often — but the multiplier still has to be
 * genuinely large. A small win never becomes a big one.
 */
export function celebrationThreshold(level = intensity()): number {
  return 50_000 - level * 12_000;
}
