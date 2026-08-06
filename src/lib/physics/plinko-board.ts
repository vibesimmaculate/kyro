import {
  collideWithPeg,
  integrate,
  speedOf,
  subSteps,
  type Body,
  type Circle,
  type ContactMaterial,
} from "./collide";

/**
 * The pin board.
 *
 * This is a real simulation — gravity, restitution, friction, spin, sub-stepped
 * collision against every peg in range. It is not a canned path played back.
 *
 * But the *outcome* is not free. The seed decides left or right at every row
 * before the ball is released, and the bucket it lands in has to match, or the
 * fairness commitment is worthless. Reconciling those two facts is the whole
 * design problem here, and there are three ways to solve it:
 *
 *   1. Fake the physics and interpolate along a canned path. Cheap, and it
 *      looks it — no ball ever grazes a peg or picks up spin.
 *   2. Run free physics and take whatever bucket falls out. Beautiful, and
 *      unprovable: the outcome would come from floating-point accumulation
 *      rather than from a committed seed.
 *   3. Run real physics, and choose the ball's *aim* rather than its path.
 *
 * This is (3), and the distinction is the whole design. At each contact the
 * board solves, in closed form, the horizontal velocity that will carry the
 * ball to a point just off-centre on the committed side of the next pin —
 * ballistically, from the current vertical speed under gravity, with drag
 * integrated out. Nothing after that is prescribed. The ball arrives off
 * centre, the contact normal therefore points sideways, and the impulse
 * formula deflects it. The bounce, the spin, the squash and the rattle are all
 * solved; only where it was aimed was decided in advance.
 *
 * Two properties fall out of this and are worth stating plainly, because both
 * are load-bearing and both are tested. Every committed path lands in its own
 * bucket, at every row count. And the ball arrives at the middle of that
 * bucket's mouth, not merely labelled with it — a payout that claims one
 * bucket while the picture shows the ball in another is the same lie as a
 * rigged board, told more quietly.
 */

export interface BoardGeometry {
  readonly rows: number;
  /** Normalised 0–1 space, so the board is resolution-independent. */
  readonly pegRadius: number;
  readonly ballRadius: number;
  readonly top: number;
  readonly bottom: number;
  /** Half-width of the widest row, as a fraction of board width. */
  readonly spread: number;
}

export const DEFAULT_GEOMETRY: BoardGeometry = {
  rows: 12,
  pegRadius: 0.011,
  ballRadius: 0.019,
  // Chosen so the pins, the release and the buckets between them fill the
  // square the board is drawn in. Leaving a third of the canvas empty made the
  // field look small and the page look unfinished.
  top: 0.06,
  bottom: 0.8,
  spread: 0.47,
};

/**
 * Geometry for a given row count.
 *
 * Pegs and ball shrink as rows are added, because the horizontal pitch shrinks
 * with them — keep the ball at its twelve-row size on a sixteen-row board and it
 * no longer fits between two pins, which turns a bounce into a wedge.
 */
export function geometryFor(rows: number): BoardGeometry {
  const scale = Math.max(0.7, Math.min(1.28, 12 / rows));
  return {
    rows,
    pegRadius: DEFAULT_GEOMETRY.pegRadius * scale,
    ballRadius: DEFAULT_GEOMETRY.ballRadius * scale,
    top: DEFAULT_GEOMETRY.top,
    bottom: DEFAULT_GEOMETRY.bottom,
    spread: DEFAULT_GEOMETRY.spread,
  };
}

/**
 * Metal pins: a crisp, lively board. Polymer would sit nearer 0.35 restitution
 * and feel noticeably deader — worth knowing, because this single number is
 * most of the board's character.
 */
export const PIN_MATERIAL: ContactMaterial = {
  restitution: 0.52,
  friction: 0.16,
};

export const GRAVITY = 8;
const DRAG = 0.35;
const SPIN_DECAY = 1.8;

/**
 * How far off-centre the ball aims at each pin, as a fraction of the distance
 * at which the two just touch.
 *
 * This one number decides how the board *feels*, and it is not obvious why.
 * A ball that strikes a pin near its centre meets a nearly vertical contact
 * normal, and the impulse then cancels almost all of its downward speed — it
 * has to fall from rest again at every row, and twelve rows take the better
 * part of twenty seconds. Aim it near the edge instead and the contact is
 * glancing: the normal is mostly horizontal, so the bounce converts downward
 * momentum into sideways travel and the ball keeps falling.
 *
 * Too near the edge and the overlap gets thinner than a sub-step of travel, at
 * which point contacts start being missed altogether. 0.82 sits in the band
 * where the deflection is decisive and the overlap is still comfortably deeper
 * than the solver's own resolution.
 */
const LATERAL = 0.82;

const contactSpan = (geometry: BoardGeometry): number =>
  geometry.pegRadius + geometry.ballRadius;

/**
 * Clear space between the last pin row and the mouth of the buckets.
 *
 * It exists so the ball has somewhere to settle. A ball clipped sideways by the
 * last pin needs room to come back over its bucket, and with the pins ending
 * flush against the buckets there is none — it lands visibly between two of
 * them while the payout claims one.
 */
const BUCKET_DEPTH = 0.15;

/**
 * The residual correction between bounces. Deliberately tiny — the aim is
 * solved at each contact, so this only has to cancel accumulated error, and a
 * larger value would start to read as a ball on a wire.
 */
const STEER = 3;

export interface Peg extends Circle {
  readonly row: number;
  readonly col: number;
}

export function buildPegs(geometry: BoardGeometry = DEFAULT_GEOMETRY): Peg[] {
  const pegs: Peg[] = [];
  const { rows, top, bottom, spread, pegRadius } = geometry;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      // A triangular grid, each row offset half a step from the one above, so
      // every peg presents a clean left/right decision to the ball above it.
      const offset = (col - row / 2) / (rows / 2);
      pegs.push({
        row,
        col,
        x: 0.5 + offset * spread,
        y: top + ((row + 1) / (rows + 1)) * (bottom - top),
        radius: pegRadius,
      });
    }
  }

  return pegs;
}

export function pegAt(
  row: number,
  col: number,
  geometry: BoardGeometry = DEFAULT_GEOMETRY,
): { x: number; y: number } {
  const offset = (col - row / 2) / (geometry.rows / 2);
  return {
    x: 0.5 + offset * geometry.spread,
    y: geometry.top + ((row + 1) / (geometry.rows + 1)) * (geometry.bottom - geometry.top),
  };
}

export interface Ball extends Body {
  readonly id: string;
  /** The committed left/right decision for each row. */
  readonly path: readonly ("L" | "R")[];
  /** Which row the ball is currently falling towards. */
  row: number;
  /** Column it will occupy once it has cleared `row`. */
  col: number;
  /** 0–1, how squashed the ball is right now. Decays after each contact. */
  squash: number;
  /** Set once the ball has passed the last row. */
  landed: boolean;
  readonly bucket: number;
  readonly tint: string;
  /**
   * How far off-centre this particular ball aims, as a multiple of `LATERAL`.
   *
   * Balls released together used to aim at exactly the same point beside
   * exactly the same pin, so they converged, overlapped, got pushed apart by
   * the renderer, and converged again — a pair could orbit each other all the
   * way down without either making progress. Giving each ball its own line
   * means two of them are never solving the same problem.
   */
  readonly bias: number;
}

export interface PegStrike {
  readonly row: number;
  readonly col: number;
  readonly impact: number;
  readonly x: number;
  readonly y: number;
}

export function createBall(options: {
  id: string;
  path: readonly ("L" | "R")[];
  bucket: number;
  tint: string;
  /** Tiny lateral offset so simultaneous balls do not overlap perfectly. */
  jitter?: number;
  /** 0, 1, 2… — which of the simultaneous balls this is. */
  lane?: number;
  geometry?: BoardGeometry;
}): Ball {
  const geometry = options.geometry ?? DEFAULT_GEOMETRY;
  const ball: Ball = {
    id: options.id,
    path: options.path,
    bucket: options.bucket,
    tint: options.tint,
    // Spread across roughly ±15%, cycling, so five balls take five lines.
    bias: 1 + (((options.lane ?? 0) % 5) - 2) * 0.075,
    x: 0.5 + (options.jitter ?? 0),
    y: geometry.top - 0.05,
    vx: 0,
    vy: 0,
    spin: 0,
    radius: geometry.ballRadius,
    row: 0,
    col: 0,
    squash: 0,
    landed: false,
  };

  launch(ball, geometry);
  return ball;
}

/**
 * Where the ball is currently trying to arrive.
 *
 * Not the pin's centre — a point just to one side of it, on the side the seed
 * chose. Arriving off-centre is what makes the contact normal point sideways,
 * and the sideways normal is what deflects the ball. So the commitment is
 * expressed as an aim, and the deflection that follows is solved, not scripted.
 */
function aimFor(ball: Ball, geometry: BoardGeometry): number {
  if (ball.row >= geometry.rows) {
    return bucketCentre(ball.bucket, geometry.rows, geometry);
  }
  const peg = pegAt(ball.row, ball.col, geometry);
  const lateral = LATERAL * ball.bias;
  return peg.x + ((ball.path[ball.row] ?? "L") === "R" ? lateral : -lateral) * contactSpan(geometry);
}

/** How far the ball still has to fall before it reaches its aim. */
function dropFor(ball: Ball, geometry: BoardGeometry): number {
  const targetY =
    ball.row >= geometry.rows
      ? geometry.bottom + BUCKET_DEPTH
      : pegAt(ball.row, ball.col, geometry).y;
  return Math.max(0.01, targetY - ball.y);
}

/**
 * Sets the horizontal velocity that will carry the ball to its aim.
 *
 * Solved ballistically rather than nudged: the fall time comes from the current
 * vertical speed under gravity, and drag is integrated out exactly — over a
 * fall of `t`, horizontal reach is `vx · (1 − e^(−D·t)) / D`, not `vx · t`.
 * Treating drag as negligible is what produces a board that mostly works and
 * occasionally puts the ball one bucket over, which is not a defect this game
 * is allowed to have.
 */
function launch(ball: Ball, geometry: BoardGeometry): void {
  const distance = dropFor(ball, geometry);
  const discriminant = ball.vy * ball.vy + 2 * GRAVITY * distance;
  const time = Math.max(0.008, (Math.sqrt(Math.max(0, discriminant)) - ball.vy) / GRAVITY);
  const reach = (1 - Math.exp(-DRAG * time)) / DRAG;

  const required = (aimFor(ball, geometry) - ball.x) / Math.max(1e-4, reach);
  // A ceiling, so a ball that somehow ends up far off course crawls back over
  // a couple of rows instead of darting across the board. It is lifted below
  // the last row, where a correction has one frame to happen in and there is
  // no longer any pin geometry for the eye to judge the motion against.
  const limit = geometry.spread * (ball.row >= geometry.rows ? 14 : 3);
  ball.vx = Math.max(-limit, Math.min(limit, required));
}

/**
 * Re-solves the aim after something outside the simulation moved the ball.
 *
 * Exists for one caller: the renderer pushes overlapping balls apart so five
 * released together do not travel as one blob. That nudge is not part of the
 * solved trajectory, so the trajectory has to be solved again from where the
 * ball now is — otherwise a cosmetic fix quietly becomes a wrong bucket.
 */
export function reaim(ball: Ball, geometry: BoardGeometry = DEFAULT_GEOMETRY): void {
  if (!ball.landed) launch(ball, geometry);
}

/** Commits the row the seed chose and re-aims at the next pin. */
function advance(ball: Ball, geometry: BoardGeometry): void {
  const direction = ball.path[ball.row] ?? "L";
  ball.col = direction === "R" ? ball.col + 1 : ball.col;
  ball.row += 1;
  launch(ball, geometry);
}

/**
 * Advances one ball by `dt` seconds, resolving every peg it touches.
 *
 * Returns the strikes that happened this step so the caller can spark, sound
 * and shake in exact sync with the simulation — the timing coherence between
 * what is seen and what is heard is, by the impact-feel literature, one of the
 * few things that reliably separates a hit that lands from one that does not.
 */
export function stepBall(
  ball: Ball,
  pegs: readonly Peg[],
  dt: number,
  geometry: BoardGeometry = DEFAULT_GEOMETRY,
): PegStrike[] {
  if (ball.landed) return [];

  const strikes: PegStrike[] = [];
  const steps = subSteps(speedOf(ball), dt, geometry.pegRadius);
  const h = dt / steps;

  for (let step = 0; step < steps; step += 1) {
    // A weak continuous pull, only to mop up what drag eats out of the launch
    // solved at the last contact. It is far too soft to fly the ball anywhere
    // on its own — the aim is set at the bounce, where a deflection belongs.
    //
    // It also has to stay weak. It is a spring with no damping term, so a
    // stiff one does not converge on the aim, it orbits it: raising this to
    // steer the ball into its bucket produced a ball that sailed straight past
    // and landed a bucket and a half wide. Convergence is the launch solver's
    // job, and it does it in closed form.
    ball.vx += (aimFor(ball, geometry) - ball.x) * STEER * h;

    integrate(ball, h, { gravity: GRAVITY, drag: DRAG, spinDecay: SPIN_DECAY });

    // ── Contacts ───────────────────────────────────────────────────────
    // Only pegs near the ball's current row can matter, so the sweep is two
    // rows wide rather than the whole board.
    for (const peg of pegs) {
      if (Math.abs(peg.row - ball.row) > 1) continue;

      const contact = collideWithPeg(ball, peg, PIN_MATERIAL);
      if (!contact || contact.impact <= 0) continue;

      strikes.push({
        row: peg.row,
        col: peg.col,
        impact: contact.impact,
        x: ball.x,
        y: ball.y,
      });

      ball.squash = Math.min(1, contact.impact * 1.4);

      // Only the pin the ball was actually falling towards advances it. A
      // clip off a neighbour is a real bounce and sounds like one, but it
      // does not count as clearing a row — it just needs re-aiming, because
      // the impulse it delivered was not part of the solved trajectory.
      if (peg.row === ball.row && peg.col === ball.col) {
        advance(ball, geometry);
      } else if (peg.row === ball.row || ball.row >= geometry.rows) {
        launch(ball, geometry);
      }
      // A clip off a pin in a row already cleared gets no correction, unless
      // the ball is already past the last row and heading for a bucket. Above
      // that point, re-aiming fights the ball's own escape from a resting
      // contact and glues it to the shoulder of the pin it was trying to
      // leave; below it there is no time left to recover any other way.
    }

    ball.squash = Math.max(0, ball.squash - h * 5);

    // Safety net: if the ball has fallen clear of its current row without ever
    // registering a contact, commit that row anyway. Dropping a row here would
    // land the ball in a bucket the seed did not choose, which is the one
    // failure this board is not allowed to have.
    if (ball.row < geometry.rows) {
      const rowY = pegAt(ball.row, ball.col, geometry).y;
      if (ball.y > rowY + geometry.pegRadius + geometry.ballRadius) {
        advance(ball, geometry);
      }
    }

    // Walls, so a ball can never escape the board.
    const limit = 0.5 + geometry.spread + 0.04;
    if (ball.x < 1 - limit) {
      ball.x = 1 - limit;
      ball.vx = Math.abs(ball.vx) * 0.4;
    } else if (ball.x > limit) {
      ball.x = limit;
      ball.vx = -Math.abs(ball.vx) * 0.4;
    }

    if (ball.y >= geometry.bottom + BUCKET_DEPTH) {
      ball.landed = true;
      break;
    }
  }

  return strikes;
}

/**
 * Where the ball should sit once it has landed, so it can settle into its
 * bucket rather than stopping in mid-air.
 */
/** The y at which a ball is considered to have arrived. */
export const landingY = (geometry: BoardGeometry = DEFAULT_GEOMETRY): number =>
  geometry.bottom + BUCKET_DEPTH;

export function bucketCentre(
  bucket: number,
  rows: number,
  geometry: BoardGeometry = DEFAULT_GEOMETRY,
): number {
  const offset = (bucket - rows / 2) / (rows / 2);
  return 0.5 + offset * geometry.spread;
}
