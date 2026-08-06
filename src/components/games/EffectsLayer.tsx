"use client";

import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import { addTrauma, createShake, shakeOffset } from "@/lib/motion";
import { ParticleField, type BurstOptions } from "@/lib/particles";
import { intensity, scaleParticles, scaleTrauma } from "@/lib/sound/intensity";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Particles and shake, over any board.
 *
 * Wraps its children, overlays a canvas, and applies shake to the wrapper — so
 * a caller gets both by rendering one element and holding one ref. Everything
 * runs outside React: the loop writes to the canvas and to `style.transform`
 * directly. Sixty state updates a second would re-render the board sixty times
 * a second to move it four pixels, which is not a trade worth making.
 *
 * The loop is demand-driven. It starts when something is fired and stops the
 * moment the last particle dies and the shake settles, so an idle board costs
 * nothing.
 */

export interface EffectsHandle {
  /** Coordinates are 0–1 across the wrapper. */
  burst(options: BurstOptions): void;
  /** 0–1. Scaled by intensity and squared on the way out, so small is small. */
  shake(amount: number): void;
  clear(): void;
}

export function EffectsLayer({
  ref,
  children,
  className,
  magnitude = 12,
  capacity = 500,
}: {
  readonly ref?: Ref<EffectsHandle>;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Peak shake displacement in pixels. */
  readonly magnitude?: number;
  readonly capacity?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<ParticleField | undefined>(undefined);
  const shakeRef = useRef(createShake());
  const frameRef = useRef<number | undefined>(undefined);
  const lastRef = useRef(0);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => {
      function field(): ParticleField {
        fieldRef.current ??= new ParticleField(capacity);
        return fieldRef.current;
      }

      function frame(now: number) {
        frameRef.current = undefined;

        const dt = Math.min(0.05, Math.max(0, (now - lastRef.current) / 1000));
        lastRef.current = now;

        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        const particles = fieldRef.current;
        if (!wrap || !canvas || !particles) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Match the backing store to the CSS box, once per resize rather than
        // per frame — reassigning width clears the canvas and costs a realloc.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const backingWidth = Math.round(width * dpr);
        const backingHeight = Math.round(height * dpr);
        if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
          canvas.width = backingWidth;
          canvas.height = backingHeight;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        particles.step(dt);
        // Additive blending: overlapping sparks build towards white instead of
        // muddying, which is what makes a dense burst read as light.
        ctx.globalCompositeOperation = "lighter";
        particles.draw(ctx, width, height);
        ctx.globalCompositeOperation = "source-over";

        const offset = shakeOffset(shakeRef.current, dt, magnitude);
        wrap.style.transform =
          offset.x === 0 && offset.y === 0
            ? ""
            : `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0) rotate(${offset.rotation.toFixed(3)}deg)`;

        if (particles.activeCount > 0 || shakeRef.current.trauma > 0) {
          frameRef.current = requestAnimationFrame(frame);
        } else {
          wrap.style.transform = "";
        }
      }

      function wake() {
        if (frameRef.current !== undefined) return;
        lastRef.current = performance.now();
        frameRef.current = requestAnimationFrame(frame);
      }

      return {
        burst(options: BurstOptions) {
          if (prefersReducedMotion()) return;
          const level = intensity();
          field().burst({ ...options, count: scaleParticles(options.count, level) });
          wake();
        },
        shake(amount: number) {
          if (prefersReducedMotion()) return;
          addTrauma(shakeRef.current, Math.min(1, scaleTrauma(amount, intensity())));
          wake();
        },
        clear() {
          fieldRef.current?.clear();
          shakeRef.current.trauma = 0;
          if (wrapRef.current) wrapRef.current.style.transform = "";
        },
      };
    },
    [capacity, magnitude],
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)} style={{ willChange: "transform" }}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />
    </div>
  );
}
