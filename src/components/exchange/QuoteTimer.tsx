"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { countdownLabel, formatCountdown } from "@/lib/money/format";

/**
 * The countdown.
 *
 * A figure and a hairline that drains. Screen readers are told at thirty
 * seconds, at ten, and at expiry — not every second, which would make the page
 * unusable with a reader running.
 */

const ANNOUNCE_AT = [30, 10, 0] as const;

export interface QuoteTimerProps {
  readonly expiresAt: number;
  readonly totalMs: number;
  readonly onExpire?: () => void;
  readonly tone?: "day" | "night";
  readonly className?: string;
}

export function QuoteTimer({
  expiresAt,
  totalMs,
  onExpire,
  tone = "day",
  className,
}: QuoteTimerProps) {
  const night = tone === "night";
  // Starts at the full window rather than reading the clock during render:
  // the first real value arrives from the interval, one frame later, which is
  // imperceptible and keeps the render pure.
  const [remaining, setRemaining] = useState(totalMs);
  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef<Set<number>>(new Set());
  const firedRef = useRef(false);

  useEffect(() => {
    announcedRef.current = new Set();
    firedRef.current = false;

    const tick = () => {
      const next = Math.max(0, expiresAt - Date.now());
      setRemaining(next);

      const seconds = Math.ceil(next / 1000);
      for (const threshold of ANNOUNCE_AT) {
        if (seconds <= threshold && !announcedRef.current.has(threshold)) {
          announcedRef.current.add(threshold);
          setAnnouncement(
            threshold === 0
              ? "This quote has expired. Refresh it to see the current figures."
              : countdownLabel(next),
          );
        }
      }

      if (next === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    };

    const interval = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(interval);
  }, [expiresAt, onExpire]);

  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const expired = remaining === 0;
  const urgent = !expired && remaining <= 15_000;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "label-mono flex-none",
          expired
            ? night
              ? "text-night-amber"
              : "text-amber"
            : night
              ? "text-night-muted"
              : "text-ink-muted",
        )}
      >
        {expired ? "Quote expired" : "Quote holds"}
      </span>

      {!expired ? (
        <span
          className={cn(
            "figure-num flex-none text-small tabular-nums",
            urgent ? (night ? "text-night-amber" : "text-amber") : night ? "text-night-text" : "text-ink",
          )}
        >
          {formatCountdown(remaining)}
        </span>
      ) : null}

      {/* The drain. Width, not opacity, so it reads at a glance. */}
      <span
        aria-hidden="true"
        className={cn(
          "relative h-px flex-1 overflow-hidden",
          night ? "bg-night-rule" : "bg-rule",
        )}
      >
        <span
          className={cn(
            "absolute inset-y-0 start-0 w-full origin-left",
            expired
              ? night
                ? "bg-night-amber"
                : "bg-amber"
              : urgent
                ? night
                  ? "bg-night-amber"
                  : "bg-amber"
                : night
                  ? "bg-night-blue"
                  : "bg-blue",
          )}
          style={{ transform: `scaleX(${expired ? 1 : fraction})` }}
        />
      </span>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
