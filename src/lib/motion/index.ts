/**
 * Motion primitives shared by the games wing.
 *
 * Three ideas, each taken from somewhere specific:
 *
 *   **Springs** instead of durations. A spring has momentum and can be
 *   interrupted mid-flight without snapping, which is why it reads as physical
 *   where an eased tween reads as choreographed. Parameters follow the usual
 *   stiffness / damping / mass triple; critically damped for anything
 *   informational, slightly under-damped for anything playful.
 *
 *   **Trauma-based shake.** Camera shake driven by a `trauma` value that decays,
 *   with displacement proportional to trauma *squared*. The square is the whole
 *   trick: it makes small events barely register and large ones unmistakable,
 *   where linear shake makes everything feel equally loud.
 *
 *   **Hit stop.** A few frames of freeze on impact. The impact-feel research
 *   identifies it, alongside audio coherence and camera control, as one of the
 *   strongest contributors to whether a hit lands — and it is nearly free.
 */

/* ── Springs ───────────────────────────────────────────────────────────── */

export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/** Settles fast without overshoot. For figures, panels, anything to be read. */
export const SPRING_CRISP: SpringConfig = { stiffness: 320, damping: 34, mass: 1 };

/** A little overshoot. For rewards and anything meant to feel pleased. */
export const SPRING_BOUNCY: SpringConfig = { stiffness: 260, damping: 16, mass: 1 };

/** Heavy and deliberate. For large surfaces that should feel weighty. */
export const SPRING_HEAVY: SpringConfig = { stiffness: 180, damping: 26, mass: 1.6 };

export interface SpringState {
  value: number;
  velocity: number;
  target: number;
}

export function spring(value: number, target = value): SpringState {
  return { value, velocity: 0, target };
}

/**
 * Advances a spring by `dt` seconds.
 *
 * Sub-stepped at a fixed 120Hz internally: a spring integrated at a variable
 * frame rate is not the same spring, and a stiff one integrated on a slow frame
 * will overshoot and oscillate for reasons that have nothing to do with its
 * parameters.
 */
export function stepSpring(state: SpringState, dt: number, config: SpringConfig): SpringState {
  const h = 1 / 120;
  let remaining = Math.min(dt, 0.1);

  while (remaining > 0) {
    const step = Math.min(h, remaining);
    remaining -= step;

    const displacement = state.value - state.target;
    const force = -config.stiffness * displacement - config.damping * state.velocity;
    const acceleration = force / config.mass;

    state.velocity += acceleration * step;
    state.value += state.velocity * step;
  }

  // Snap once the motion is below perceptual threshold, so springs do not
  // keep the render loop alive forever chasing the last thousandth.
  if (Math.abs(state.value - state.target) < 0.0005 && Math.abs(state.velocity) < 0.005) {
    state.value = state.target;
    state.velocity = 0;
  }

  return state;
}

export const springAtRest = (state: SpringState): boolean =>
  state.value === state.target && state.velocity === 0;

/* ── Screen shake ──────────────────────────────────────────────────────── */

export interface Shake {
  trauma: number;
  /** Seconds since the shake began, for the noise phase. */
  time: number;
}

export function createShake(): Shake {
  return { trauma: 0, time: 0 };
}

/** Adds trauma, clamped. Repeated small hits accumulate; one big hit dominates. */
export function addTrauma(shake: Shake, amount: number): void {
  shake.trauma = Math.min(1, shake.trauma + amount);
}

/**
 * Current offset and rotation.
 *
 * Trauma decays linearly, but displacement is trauma² — so a shake fades out
 * smoothly rather than stopping dead, and a light tap is genuinely subtle.
 * The noise is deterministic (layered sines rather than random) so the same
 * event shakes the same way twice, which stops repeated play feeling chaotic.
 */
export function shakeOffset(
  shake: Shake,
  dt: number,
  magnitude = 14,
): { x: number; y: number; rotation: number } {
  shake.time += dt;
  shake.trauma = Math.max(0, shake.trauma - dt * 1.6);

  if (shake.trauma <= 0) return { x: 0, y: 0, rotation: 0 };

  const power = shake.trauma * shake.trauma;
  const t = shake.time * 34;

  return {
    x: magnitude * power * (Math.sin(t) * 0.6 + Math.sin(t * 2.31) * 0.4),
    y: magnitude * power * (Math.sin(t * 1.37 + 1.1) * 0.6 + Math.sin(t * 2.9) * 0.4),
    rotation: magnitude * 0.06 * power * Math.sin(t * 0.83 + 2.2),
  };
}

/* ── Hit stop ──────────────────────────────────────────────────────────── */

/**
 * Freezes simulation time briefly on impact.
 *
 * Used by scaling `dt` to zero for a few frames rather than by pausing the
 * loop, so animation, audio scheduling and React state stay in step and the
 * board resumes exactly where it stopped.
 */
export class HitStop {
  private remaining = 0;

  /** Requests a freeze. Longer requests win; they do not stack. */
  request(seconds: number): void {
    this.remaining = Math.max(this.remaining, seconds);
  }

  /** Returns the time the simulation should actually advance by. */
  consume(dt: number): number {
    if (this.remaining <= 0) return dt;
    this.remaining -= dt;
    return 0;
  }

  get frozen(): boolean {
    return this.remaining > 0;
  }

  clear(): void {
    this.remaining = 0;
  }
}

/** Impact strength → freeze length. Capped so a huge hit cannot stall play. */
export function hitStopFor(impact: number): number {
  return Math.min(0.09, 0.012 + impact * 0.05);
}

/* ── Easing, for the places a spring is overkill ────────────────────────── */

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Overshoots and settles. For anything arriving that should feel pleased. */
export function easeOutBack(t: number, overshoot = 1.7): number {
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}
