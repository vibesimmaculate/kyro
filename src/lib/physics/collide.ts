/**
 * Rigid-body collision, restricted to what a pin board actually needs: a small
 * circle striking a much larger, immovable one.
 *
 * The response is the standard impulse formulation for a collision against an
 * object of effectively infinite mass:
 *
 *     n̂  = (ball − peg) / ‖ball − peg‖
 *     vₙ = n̂ · v
 *     Δv = −(1 + Cᵣ) · vₙ · n̂
 *
 * where Cᵣ is the coefficient of restitution: 1 is a perfectly elastic bounce,
 * 0 is a ball that stops dead. Real pin boards sit around 0.4–0.6 depending on
 * whether the pins are metal or polymer — metal pins give a crisper, livelier
 * board, polymer absorbs energy and quietens it.
 *
 * Two details matter as much as the formula:
 *
 *   The impulse is applied only when the ball is *approaching* (vₙ < 0).
 *   Without that check a ball resting against a peg jitters, because every
 *   frame re-reflects a velocity that is already pointing away.
 *
 *   Penetration is resolved positionally as well as by velocity. Fixing only
 *   the velocity leaves the ball overlapping the peg on the next frame, which
 *   re-triggers the collision and produces a buzzing, sticky contact.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians per second. Carried so contacts can impart spin. */
  spin: number;
  readonly radius: number;
}

export interface ContactMaterial {
  /** Coefficient of restitution, 0–1. */
  readonly restitution: number;
  /** Tangential friction, 0–1. Higher scrubs off sideways speed and adds spin. */
  readonly friction: number;
}

export interface Contact {
  /** Unit normal, from the peg towards the ball. */
  readonly nx: number;
  readonly ny: number;
  /** How deeply the two overlapped before resolution. */
  readonly depth: number;
  /** Closing speed along the normal. Useful for scaling impact effects. */
  readonly impact: number;
}

const EPSILON = 1e-6;

/**
 * Below this closing speed a contact is a rest, not a bounce.
 *
 * Without it, a body settling on the shoulder of a peg never settles: gravity
 * adds a sliver of downward speed each frame, restitution reflects it, and the
 * body chatters in place indefinitely instead of sliding off. Real balls stop
 * bouncing at low speed for the same reason — the energy goes into deformation
 * and sound rather than back into the ball — so zeroing the normal velocity
 * here is both the numerically stable answer and the physical one.
 *
 * In world units per second, where the board is one unit across.
 */
const RESTING_SPEED = 0.08;

/**
 * Resolves a contact between a moving body and a fixed circle.
 *
 * Mutates the body and returns the contact, or `undefined` if they were not
 * actually touching.
 */
export function collideWithPeg(
  body: Body,
  peg: Circle,
  material: ContactMaterial,
): Contact | undefined {
  const dx = body.x - peg.x;
  const dy = body.y - peg.y;
  const distanceSquared = dx * dx + dy * dy;
  const minimum = body.radius + peg.radius;

  if (distanceSquared >= minimum * minimum) return undefined;

  const distance = Math.sqrt(distanceSquared);

  // Dead centre: the normal is undefined, so push straight up rather than
  // dividing by zero. Only reachable if a ball spawns exactly on a peg.
  const nx = distance > EPSILON ? dx / distance : 0;
  const ny = distance > EPSILON ? dy / distance : -1;

  const depth = minimum - distance;

  // ── Positional correction ────────────────────────────────────────────
  // Lift the ball out of the peg before touching the velocity, so the next
  // frame starts from a legal configuration.
  body.x += nx * depth;
  body.y += ny * depth;

  const normalSpeed = body.vx * nx + body.vy * ny;

  // Already separating: nothing to resolve.
  if (normalSpeed >= 0) return { nx, ny, depth, impact: 0 };

  // ── Normal impulse ───────────────────────────────────────────────────
  const restitution = -normalSpeed < RESTING_SPEED ? 0 : material.restitution;
  const impulse = -(1 + restitution) * normalSpeed;
  body.vx += impulse * nx;
  body.vy += impulse * ny;

  // ── Tangential friction ──────────────────────────────────────────────
  // The tangent is the normal rotated a quarter turn. Scrubbing the
  // tangential component is what converts a glancing blow into spin, and it
  // is the reason a real ball walks around a peg instead of reflecting off it
  // like light off a mirror.
  const tx = -ny;
  const ty = nx;
  const tangentSpeed = body.vx * tx + body.vy * ty;
  const scrub = tangentSpeed * material.friction;

  body.vx -= scrub * tx;
  body.vy -= scrub * ty;

  // The scrubbed momentum has to go somewhere; it becomes rotation.
  body.spin += scrub / Math.max(EPSILON, body.radius);

  return { nx, ny, depth, impact: -normalSpeed };
}

/**
 * Advances a body under gravity and drag.
 *
 * Semi-implicit Euler: velocity is integrated first, then position from the
 * *new* velocity. It costs nothing over explicit Euler and is far better
 * behaved under the repeated impulses a pin board delivers — explicit Euler
 * quietly injects energy on every bounce and the board slowly comes alive.
 */
export function integrate(
  body: Body,
  dt: number,
  options: { readonly gravity: number; readonly drag: number; readonly spinDecay: number },
): void {
  body.vy += options.gravity * dt;

  const damping = Math.max(0, 1 - options.drag * dt);
  body.vx *= damping;
  body.vy *= damping;

  body.x += body.vx * dt;
  body.y += body.vy * dt;

  body.spin *= Math.max(0, 1 - options.spinDecay * dt);
}

/**
 * The largest step that keeps a body from tunnelling through a peg.
 *
 * A ball moving faster than its own diameter per frame can pass straight
 * through a peg without ever overlapping it. Rather than sweep the collision,
 * the step is subdivided until movement per sub-step is smaller than the
 * smallest radius in play — cheaper to reason about, and exact enough for a
 * board this size.
 */
export function subSteps(speed: number, dt: number, smallestRadius: number): number {
  if (speed <= 0) return 1;
  const travel = speed * dt;
  return Math.max(1, Math.min(16, Math.ceil(travel / (smallestRadius * 0.5))));
}

export function speedOf(body: Body): number {
  return Math.hypot(body.vx, body.vy);
}
