"use client";

import { cn } from "@/lib/cn";
import { amountParts } from "@/lib/money/format";
import type { Amount } from "@/lib/money/amounts";

/**
 * The figure that matters.
 *
 * Set in mono at figure size with the currency code trailing it, smaller and
 * quieter, so the eye lands on the number first. When the value changes the
 * digits lift into place over 180ms — enough to notice that something moved,
 * not enough to be a performance. Reduced motion removes it entirely.
 */

export interface AmountReadoutProps {
  readonly amount: Amount;
  readonly size?: "md" | "lg";
  readonly tone?: "day" | "night";
  readonly dimmed?: boolean;
  readonly className?: string;
  readonly prefix?: string;
}

export function AmountReadout({
  amount,
  size = "lg",
  tone = "day",
  dimmed,
  className,
  prefix,
}: AmountReadoutProps) {
  const night = tone === "night";
  const parts = amountParts(amount);

  return (
    <p
      className={cn(
        "flex flex-wrap items-baseline gap-x-2",
        dimmed && "opacity-45",
        "transition-opacity duration-[var(--duration-base)]",
        className,
      )}
    >
      <span
        // Re-keyed on the value so a change re-runs the entrance animation.
        key={parts.plain}
        className={cn(
          "figure-num min-w-0 break-all animate-[kyro-digit-in_var(--duration-base)_var(--ease-out-quiet)]",
          size === "lg" ? "text-figure" : "text-[1.375rem] leading-tight",
          night ? "text-night-text" : "text-ink",
        )}
      >
        {prefix}
        {parts.sign}
        {parts.whole}
        {parts.fraction ? (
          <>
            <span aria-hidden="true">.</span>
            <span className={night ? "text-night-text" : "text-ink"}>{parts.fraction}</span>
          </>
        ) : null}
      </span>
      {parts.code ? (
        <span
          className={cn(
            "label-mono flex-none",
            night ? "text-night-muted" : "text-ink-muted",
          )}
        >
          {parts.code}
        </span>
      ) : null}
    </p>
  );
}
