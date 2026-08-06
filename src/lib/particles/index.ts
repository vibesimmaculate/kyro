/**
 * A canvas particle system.
 *
 * The previous version scattered DOM elements with CSS animations, which caps
 * out around thirty before the compositor notices. This runs hundreds on one
 * canvas with real velocity, gravity, drag and fade, which is what lets a large
 * win look genuinely different from a small one rather than merely louder.
 *
 * Particles are pooled. Allocating in the middle of a burst is how a
 * celebration ends up stuttering at exactly the moment it should feel best.
 */

export type ParticleShape = "spark" | "dot" | "shard" | "ring";

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  colour: string;
  shape: ParticleShape;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly colours: readonly string[];
  readonly speed?: number;
  readonly spread?: number;
  /** Radians. Defaults to a full circle. */
  readonly direction?: number;
  readonly arc?: number;
  readonly gravity?: number;
  readonly drag?: number;
  readonly life?: number;
  readonly size?: number;
  readonly shape?: ParticleShape;
}

export class ParticleField {
  private readonly pool: Particle[] = [];
  private cursor = 0;
  /** Deterministic scatter: identical bursts look identical. */
  private seed = 1;

  constructor(private readonly capacity = 600) {
    for (let i = 0; i < capacity; i += 1) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        rotation: 0,
        spin: 0,
        colour: "#fff",
        shape: "spark",
        gravity: 0,
        drag: 0,
      });
    }
  }

  /**
   * A cheap deterministic sequence. `Math.random` is banned repo-wide so that
   * nothing anywhere near an outcome reaches for it out of habit, and the
   * determinism is a genuine feature here: the same win scatters the same way.
   */
  private next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private take(): Particle {
    // Oldest-first reuse. Under pressure the newest burst wins, which is the
    // right trade: the thing that just happened matters more than the tail of
    // the thing before it.
    for (let i = 0; i < this.capacity; i += 1) {
      const index = (this.cursor + i) % this.capacity;
      const particle = this.pool[index];
      if (particle && !particle.active) {
        this.cursor = (index + 1) % this.capacity;
        return particle;
      }
    }
    const fallback = this.pool[this.cursor] as Particle;
    this.cursor = (this.cursor + 1) % this.capacity;
    return fallback;
  }

  burst(options: BurstOptions): void {
    const {
      x,
      y,
      count,
      colours,
      speed = 0.9,
      spread = 0.5,
      direction = -Math.PI / 2,
      arc = Math.PI * 2,
      gravity = 1.8,
      drag = 1.1,
      life = 0.8,
      size = 3,
      shape = "spark",
    } = options;

    for (let i = 0; i < count; i += 1) {
      const particle = this.take();
      const angle = direction + (this.next() - 0.5) * arc;
      const velocity = speed * (0.55 + this.next() * 0.9);

      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity * (1 + (this.next() - 0.5) * spread);
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = life * (0.7 + this.next() * 0.7);
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + this.next() * 0.9);
      particle.rotation = this.next() * Math.PI * 2;
      particle.spin = (this.next() - 0.5) * 14;
      particle.colour = colours[Math.floor(this.next() * colours.length)] ?? "#fff";
      particle.shape = shape;
      particle.gravity = gravity;
      particle.drag = drag;
    }
  }

  step(dt: number): void {
    for (const particle of this.pool) {
      if (!particle.active) continue;

      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      particle.vy += particle.gravity * dt;
      const damping = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= damping;
      particle.vy *= damping;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
    }
  }

  /** Draws into a canvas whose coordinates are 0–1 in both axes. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const particle of this.pool) {
      if (!particle.active) continue;

      const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      const px = particle.x * width;
      const py = particle.y * height;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.colour;
      ctx.strokeStyle = particle.colour;
      ctx.translate(px, py);
      ctx.rotate(particle.rotation);

      switch (particle.shape) {
        case "dot":
          ctx.beginPath();
          ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "shard":
          ctx.fillRect(-particle.size * 0.35, -particle.size, particle.size * 0.7, particle.size * 2);
          break;
        case "ring":
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, particle.size * (1 + (1 - alpha) * 3), 0, Math.PI * 2);
          ctx.stroke();
          break;
        default:
          // A spark is a short streak along its own direction of travel, which
          // reads as motion where a dot reads as confetti.
          ctx.fillRect(-particle.size * 1.6, -particle.size * 0.28, particle.size * 3.2, particle.size * 0.56);
      }

      ctx.restore();
    }
  }

  get activeCount(): number {
    return this.pool.reduce((total, particle) => total + (particle.active ? 1 : 0), 0);
  }

  clear(): void {
    for (const particle of this.pool) particle.active = false;
  }
}

/** Palettes, so bursts stay on-brand rather than becoming a rainbow. */
export const PALETTE = {
  gold: ["#ffc94a", "#ffe9a8", "#ff9f1c"],
  green: ["#2fd48b", "#7cf0be", "#d7fff0"],
  red: ["#ff5c5c", "#ff9b8a", "#ffd6cf"],
  violet: ["#a97bff", "#d7c2ff", "#f0e8ff"],
  cyan: ["#3fd9e8", "#a5f3fb", "#e3fbff"],
  ember: ["#ff8a3d", "#ffc07a", "#fff0dd"],
} as const;
