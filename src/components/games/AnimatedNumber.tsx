"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * A number that travels to its new value instead of jumping to it.
 *
 * Watching a multiplier climb is most of the pleasure in these games — the
 * figure snapping from 1.00× to 7.52× reads as a result, while the same figure
 * counting up reads as something that *happened to you*. That difference is
 * cheap to build and it is most of the feeling.
 */
export function AnimatedNumber({
  value,
  decimals = 2,
  suffix = "",
  prefix = "",
  durationMs = 420,
  className,
}: {
  readonly value: number;
  readonly decimals?: number;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly durationMs?: number;
  readonly className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const frame = useRef<number | undefined>(undefined);
  const from = useRef(value);

  useEffect(() => {
    // Nothing to animate, and nothing to write: the render below already shows
    // the final value when motion is reduced.
    if (reduced || durationMs <= 0 || value === from.current) {
      from.current = value;
      return;
    }

    const start = from.current;
    const delta = value - start;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // Ease out cubic: quick off the mark, gentle into the landing.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(start + delta * eased);

      if (progress < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        from.current = value;
        setShown(value);
      }
    };

    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      from.current = value;
    };
  }, [value, durationMs, reduced]);

  const display = reduced ? value : shown;

  return (
    <span className={cn("figure-num tabular-nums", className)}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
