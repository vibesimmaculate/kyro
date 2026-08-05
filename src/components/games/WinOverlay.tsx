"use client";

import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/games/AnimatedNumber";
import { cn } from "@/lib/cn";
import { MULTIPLIER_SCALE } from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";

/**
 * The moment of winning.
 *
 * Sits over the board, states the multiplier large and the amount underneath,
 * then leaves on its own. It does not block the next round — a celebration you
 * have to dismiss stops being a reward and becomes an obstacle.
 *
 * Two deliberate restraints:
 *
 *   It only appears on an actual win. There is no version of this for a loss,
 *   and no "so close!" variant — dressing up a loss is the single most
 *   dishonest thing a game like this can do.
 *
 *   The spark count scales with the multiplier and stops at a ceiling, so a
 *   1.02× win is visibly a small event and a 200× win is visibly a large one.
 *   The celebration reports the size of the win rather than manufacturing
 *   excitement independent of it.
 */

export interface WinOverlayProps {
  /** 4-decimal multiplier. Zero or undefined means nothing is shown. */
  readonly multiplier?: number;
  readonly payout?: bigint;
  readonly asset: CryptoCode;
  /** Changes on every settled round, so repeats of the same figure re-fire. */
  readonly roundKey?: string;
  readonly className?: string;
}

export function WinOverlay({
  multiplier,
  payout,
  asset,
  roundKey,
  className,
}: WinOverlayProps) {
  // Which round has already had its celebration. Derived visibility rather than
  // a `setVisible(true)` on mount: writing state synchronously inside an effect
  // costs an extra render and the compiler is right to refuse it.
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);

  const won = Boolean(multiplier && multiplier > MULTIPLIER_SCALE && payout && payout > 0n);
  const key = roundKey ?? "";
  const visible = won && dismissed !== key;

  useEffect(() => {
    if (!visible) return;
    // Fires from a timer, not synchronously — the celebration leaves on its own
    // so it never becomes an obstacle between rounds.
    const timer = window.setTimeout(() => setDismissed(key), 2600);
    return () => window.clearTimeout(timer);
  }, [visible, key]);

  if (!visible || !multiplier || !payout) return null;

  const multiple = multiplier / MULTIPLIER_SCALE;
  const big = multiple >= 5;
  const huge = multiple >= 25;

  // Between six and twenty-eight sparks, by how much was won.
  const sparkCount = Math.min(28, 6 + Math.round(Math.log2(Math.max(1, multiple)) * 5));

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center",
        className,
      )}
    >
      {/* Sparks. Purely decorative, so hidden from assistive technology and
          removed entirely under reduced motion by the global rule. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        {Array.from({ length: sparkCount }, (_, i) => {
          // Deterministic scatter: no Math.random, and identical wins look the
          // same, which makes the effect feel designed rather than noisy.
          const angle = (i / sparkCount) * Math.PI * 2 + (i % 3) * 0.4;
          const spread = 90 + ((i * 37) % 140);
          return (
            <span
              key={i}
              className={cn(
                "absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-[1px]",
                i % 3 === 0
                  ? "bg-night-gold"
                  : i % 3 === 1
                    ? "bg-night-green"
                    : "bg-night-text",
              )}
              style={
                {
                  "--dx": `${Math.cos(angle) * spread}px`,
                  "--dy": `${Math.sin(angle) * spread + 40}px`,
                  "--spin": `${(i % 5) * 90}deg`,
                  animation: `kyro-spark ${900 + (i % 4) * 220}ms var(--ease-out-quiet) forwards`,
                  animationDelay: `${(i % 6) * 35}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      <div
        className={cn(
          "relative flex flex-col items-center rounded-[14px] px-8 py-5",
          "bg-night-sunk/85 backdrop-blur-[2px]",
          "animate-[kyro-pop_var(--duration-slow)_var(--ease-out-quiet)]",
          huge ? "glow-win" : big ? "glow-win" : "",
        )}
        style={{ boxShadow: big ? undefined : "0 0 0 1px var(--color-night-rule-strong)" }}
      >
        <span className="label-mono text-night-muted">
          {huge ? "Huge win" : big ? "Big win" : "Win"}
        </span>

        <AnimatedNumber
          value={multiple}
          suffix="×"
          durationMs={huge ? 900 : 520}
          className={cn(
            "mt-1 text-[clamp(2.5rem,9vw,4rem)] leading-none font-medium",
            huge ? "text-night-gold" : "text-night-green",
          )}
        />

        <span className="figure-num mt-2 text-[1.0625rem] text-night-text">
          {formatCrypto(cryptoAmount(payout, asset))}
        </span>
      </div>
    </div>
  );
}
