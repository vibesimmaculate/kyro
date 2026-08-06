import { describe, expect, it } from "vitest";
import { collideWithPeg, integrate, speedOf, subSteps, type Body } from "@/lib/physics/collide";
import {
  buildPegs,
  bucketCentre,
  createBall,
  geometryFor,
  stepBall,
  PIN_MATERIAL,
} from "@/lib/physics/plinko-board";
import { HitStop, addTrauma, createShake, hitStopFor, shakeOffset, spring, stepSpring, SPRING_CRISP } from "@/lib/motion";
import { ParticleField } from "@/lib/particles";
import {
  MULTIPLIER_SCALE,
  PLINKO_RISKS,
  PLINKO_ROW_OPTIONS,
  plinkoMultipliers,
  plinkoPath,
  plinkoProbability,
  type PlinkoRows,
} from "@/lib/games";

const body = (over: Partial<Body> = {}): Body => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  spin: 0,
  radius: 0.02,
  ...over,
});

describe("collision", () => {
  it("ignores a body that is not touching", () => {
    const ball = body({ x: 0, y: 0, vy: 1 });
    expect(collideWithPeg(ball, { x: 1, y: 1, radius: 0.01 }, PIN_MATERIAL)).toBeUndefined();
    expect(ball.vy).toBe(1);
  });

  it("reverses the normal velocity, scaled by restitution", () => {
    // Falling straight onto a peg directly below: the normal is vertical, so
    // the outgoing speed is exactly Cr times the incoming.
    const ball = body({ x: 0, y: -0.025, vy: 1 });
    const contact = collideWithPeg(ball, { x: 0, y: 0, radius: 0.01 }, {
      restitution: 0.5,
      friction: 0,
    });

    expect(contact).toBeDefined();
    expect(ball.vy).toBeCloseTo(-0.5, 6);
    expect(contact?.impact).toBeCloseTo(1, 6);
  });

  it("never adds energy", () => {
    for (const angle of [0, 0.4, 1.1, 2.2, 3.9, 5.5]) {
      const ball = body({
        x: Math.cos(angle) * 0.025,
        y: Math.sin(angle) * 0.025,
        vx: -Math.cos(angle) * 2,
        vy: -Math.sin(angle) * 2,
      });
      const before = speedOf(ball);
      collideWithPeg(ball, { x: 0, y: 0, radius: 0.01 }, PIN_MATERIAL);
      expect(speedOf(ball)).toBeLessThanOrEqual(before + 1e-9);
    }
  });

  it("does not re-reflect a body that is already separating", () => {
    // The bug this guards: without the approach check, a ball resting against a
    // peg has its velocity flipped every frame and buzzes in place.
    const ball = body({ x: 0, y: -0.025, vy: -1 });
    const contact = collideWithPeg(ball, { x: 0, y: 0, radius: 0.01 }, PIN_MATERIAL);
    expect(contact?.impact).toBe(0);
    expect(ball.vy).toBe(-1);
  });

  it("lifts a penetrating body clear of the peg", () => {
    const ball = body({ x: 0, y: -0.02, vy: 1 });
    collideWithPeg(ball, { x: 0, y: 0, radius: 0.01 }, PIN_MATERIAL);
    expect(Math.hypot(ball.x, ball.y)).toBeCloseTo(0.03, 6);
  });

  it("converts a glancing blow into spin", () => {
    const ball = body({ x: 0.02, y: -0.022, vy: 1 });
    collideWithPeg(ball, { x: 0, y: 0, radius: 0.01 }, PIN_MATERIAL);
    expect(Math.abs(ball.spin)).toBeGreaterThan(0);
  });
});

describe("integration", () => {
  it("accelerates under gravity and slows under drag", () => {
    const ball = body();
    integrate(ball, 0.1, { gravity: 10, drag: 0, spinDecay: 0 });
    expect(ball.vy).toBeCloseTo(1, 6);

    const drifting = body({ vx: 1 });
    integrate(drifting, 0.1, { gravity: 0, drag: 1, spinDecay: 0 });
    expect(drifting.vx).toBeLessThan(1);
  });

  it("subdivides fast movement so nothing tunnels", () => {
    expect(subSteps(0, 0.016, 0.01)).toBe(1);
    // Two board-widths a second past a 0.01 peg cannot be one step.
    expect(subSteps(2, 0.016, 0.01)).toBeGreaterThan(1);
    expect(subSteps(1000, 0.016, 0.01)).toBeLessThanOrEqual(16);
  });
});

describe("the pin board", () => {
  it("builds a triangular grid", () => {
    const geometry = geometryFor(12);
    const pegs = buildPegs(geometry);
    // 1 + 2 + … + 12
    expect(pegs).toHaveLength(78);
    expect(pegs.filter((peg) => peg.row === 11)).toHaveLength(12);
  });

  for (const rows of PLINKO_ROW_OPTIONS) {
    it(`lands every committed path in its own bucket over ${rows} rows`, () => {
      const geometry = geometryFor(rows);
      const pegs = buildPegs(geometry);

      // This is the property the whole design rests on: the seed commits a
      // bucket before release, and the simulation must deliver the ball there
      // every time. A physics change that breaks this breaks the fairness
      // claim, not just the animation.
      const pitch = (2 * geometry.spread) / rows;

      for (let nonce = 0; nonce < 60; nonce += 1) {
        const { path, bucket } = plinkoPath("server-seed", "client-seed", nonce, rows);
        const ball = createBall({ id: `b${nonce}`, path, bucket, tint: "#fff", geometry });

        let seconds = 0;
        while (!ball.landed && seconds < 30) {
          stepBall(ball, pegs, 1 / 120, geometry);
          seconds += 1 / 120;
        }

        expect(ball.landed).toBe(true);
        expect(ball.col).toBe(bucket);
        // And it has to arrive at its own bucket's mouth, not merely be
        // labelled with it — a payout that claims one bucket while the picture
        // shows the ball in another is a rigged board told quietly. A tenth of
        // the spacing between buckets is visually dead centre.
        expect(Math.abs(ball.x - bucketCentre(bucket, rows, geometry))).toBeLessThan(pitch / 10);

        // The drop is also the game. Under a second and there is no
        // anticipation to speak of; past five and it is a chore on the
        // fiftieth round.
        expect(seconds).toBeGreaterThan(1);
        expect(seconds).toBeLessThan(5);
      }
    });
  }

  it("keeps the ball inside the board", () => {
    const geometry = geometryFor(16);
    const pegs = buildPegs(geometry);
    const { path, bucket } = plinkoPath("s", "c", 7, 16);
    const ball = createBall({ id: "x", path, bucket, tint: "#fff", geometry });

    let guard = 0;
    while (!ball.landed && guard < 4000) {
      stepBall(ball, pegs, 1 / 120, geometry);
      expect(ball.x).toBeGreaterThan(0);
      expect(ball.x).toBeLessThan(1);
      guard += 1;
    }
  });
});

describe("plinko payout tables", () => {
  for (const rows of PLINKO_ROW_OPTIONS) {
    for (const risk of PLINKO_RISKS) {
      it(`returns 99% at ${rows} rows, ${risk} risk`, () => {
        const table = plinkoMultipliers(rows, risk);
        expect(table).toHaveLength(rows + 1);

        const expected = table.reduce(
          (sum, multiplier, bucket) =>
            sum + plinkoProbability(bucket, rows as PlinkoRows) * (multiplier / MULTIPLIER_SCALE),
          0,
        );
        // Floor-rounding each multiplier to four decimals costs a hair.
        expect(expected).toBeGreaterThan(0.985);
        expect(expected).toBeLessThanOrEqual(0.99);
      });

      it(`is symmetric and bowl-shaped at ${rows} rows, ${risk} risk`, () => {
        const table = plinkoMultipliers(rows, risk);
        const middle = table[rows / 2] ?? 0;
        expect(table[0]).toBe(table[rows]);
        expect(table[0] ?? 0).toBeGreaterThan(middle);
      });
    }
  }

  it("buys variance rather than value as risk rises", () => {
    const low = plinkoMultipliers(12, "low");
    const high = plinkoMultipliers(12, "high");
    expect(high[0] ?? 0).toBeGreaterThan(low[0] ?? 0);
    expect(high[6] ?? 0).toBeLessThan(low[6] ?? 0);
  });
});

describe("motion", () => {
  it("settles a spring on its target", () => {
    const state = spring(0, 1);
    for (let i = 0; i < 200; i += 1) stepSpring(state, 1 / 60, SPRING_CRISP);
    expect(state.value).toBe(1);
    expect(state.velocity).toBe(0);
  });

  it("makes small shakes much smaller than large ones", () => {
    const small = createShake();
    const large = createShake();
    addTrauma(small, 0.25);
    addTrauma(large, 1);

    // Displacement is trauma squared, so a quarter of the trauma is a
    // sixteenth of the shake — which is the point of the curve.
    const a = shakeOffset(small, 0, 100);
    const b = shakeOffset(large, 0, 100);
    expect(Math.hypot(a.x, a.y)).toBeLessThan(Math.hypot(b.x, b.y) / 10);
  });

  it("decays trauma to nothing", () => {
    const shake = createShake();
    addTrauma(shake, 1);
    for (let i = 0; i < 120; i += 1) shakeOffset(shake, 1 / 60);
    expect(shake.trauma).toBe(0);
  });

  it("freezes time and then releases it", () => {
    const stop = new HitStop();
    stop.request(0.05);
    expect(stop.consume(0.016)).toBe(0);
    expect(stop.consume(0.016)).toBe(0);
    stop.consume(0.05);
    expect(stop.consume(0.016)).toBe(0.016);
  });

  it("caps how long a hit can stall play", () => {
    expect(hitStopFor(1000)).toBeLessThanOrEqual(0.09);
  });
});

describe("particles", () => {
  it("emits, ages and retires", () => {
    const field = new ParticleField(64);
    expect(field.activeCount).toBe(0);

    field.burst({ x: 0.5, y: 0.5, count: 20, colours: ["#fff"], life: 0.2 });
    expect(field.activeCount).toBe(20);

    field.step(1);
    expect(field.activeCount).toBe(0);
  });

  it("never exceeds its capacity", () => {
    const field = new ParticleField(16);
    field.burst({ x: 0, y: 0, count: 200, colours: ["#fff"] });
    expect(field.activeCount).toBeLessThanOrEqual(16);
  });

  it("scatters the same way twice", () => {
    const a = new ParticleField(8);
    const b = new ParticleField(8);
    a.burst({ x: 0.5, y: 0.5, count: 8, colours: ["#fff"] });
    b.burst({ x: 0.5, y: 0.5, count: 8, colours: ["#fff"] });
    a.step(0.1);
    b.step(0.1);
    expect(a.activeCount).toBe(b.activeCount);
  });
});
