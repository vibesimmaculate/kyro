"use client";

import { cn } from "@/lib/cn";
import { formatMultiplier } from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import type { RoundResult } from "@/server/games/play";

/**
 * What just happened.
 *
 * Announced politely so a screen reader hears the result without the page
 * having to be re-read, and coloured only as reinforcement — the words carry
 * the meaning on their own.
 */
export function ResultBanner({
  result,
  asset,
  className,
}: {
  readonly result: RoundResult | undefined;
  readonly asset: CryptoCode;
  readonly className?: string;
}) {
  if (!result) {
    return (
      <p aria-live="polite" className={cn("min-h-[2.75rem]", className)}>
        <span className="sr-only">No round played yet.</span>
      </p>
    );
  }

  if (!result.ok) {
    return (
      <p
        aria-live="polite"
        className={cn(
          "min-h-[2.75rem] rounded-[8px] border border-night-amber/40 bg-night-amber/10 px-3 py-2 text-small",
          className,
        )}
      >
        {result.error}
      </p>
    );
  }

  const payout = BigInt(result.payout ?? "0");
  const won = payout > 0n;

  return (
    <p
      key={result.roundId}
      aria-live="polite"
      className={cn(
        "flex min-h-[2.75rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-[8px] border px-3 py-2",
        "animate-[kyro-digit-in_var(--duration-base)_var(--ease-out-quiet)]",
        won
          ? "border-night-green/40 bg-night-green/10"
          : "border-night-rule bg-night-sunk",
        className,
      )}
    >
      <span className={cn("text-small font-medium", won ? "text-night-green" : "text-night-muted")}>
        {won ? "Won" : "Lost"}
      </span>
      {won ? (
        <>
          <span className="figure-num text-[1.0625rem]">
            {formatCrypto(cryptoAmount(payout, asset))}
          </span>
          <span className="label-mono text-night-muted">
            {formatMultiplier(result.multiplier ?? 0)}
          </span>
        </>
      ) : null}
    </p>
  );
}
