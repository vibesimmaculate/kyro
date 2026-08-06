"use client";

import { cn } from "@/lib/cn";
import { MULTIPLIER_SCALE } from "@/lib/games";

/**
 * The last handful of results, newest first.
 *
 * Every casino of this kind carries one, and for once the reason is honest
 * rather than manipulative: it lets a player check that the game is behaving
 * the way the stated odds say it should. A run of losses on a 1-in-2 game looks
 * alarming in isolation and completely ordinary in a strip of fifteen.
 *
 * What it deliberately does not do is imply a pattern. There is no "hot" or
 * "cold" marker, no streak pickup point, no trend arrow — each round is independent
 * and suggesting otherwise would be inventing a signal that does not exist.
 */

export interface HistoryEntry {
  readonly id: string;
  /** 4-decimal multiplier. Zero is a loss. */
  readonly multiplier: number;
}

export function GameHistory({
  entries,
  className,
  emptyLabel = "Your results appear here",
}: {
  readonly entries: readonly HistoryEntry[];
  readonly className?: string;
  readonly emptyLabel?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="label-mono flex-none text-night-muted">Recent</span>

      <ol
        aria-label="Recent results, newest first"
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.length === 0 ? (
          <li className="text-micro text-night-muted">{emptyLabel}</li>
        ) : (
          entries.map((entry) => {
            const multiple = entry.multiplier / MULTIPLIER_SCALE;
            const nothing = entry.multiplier <= 0;
            // Anything under 1.00× returned less than the stake. Colouring a
            // 0.70× green because it paid *something* would be dressing up a
            // loss, which is the one thing this interface will not do.
            const profit = entry.multiplier > MULTIPLIER_SCALE;
            const big = multiple >= 5;

            return (
              <li
                key={entry.id}
                className={cn(
                  "figure-num flex-none rounded-[5px] border px-2 py-1 text-micro tabular-nums",
                  "animate-[kyro-slide-in_var(--duration-base)_var(--ease-out-quiet)]",
                  nothing
                    ? "border-night-rule bg-night-sunk text-night-muted"
                    : !profit
                      ? "border-night-rule-strong bg-night-sunk text-night-muted"
                      : big
                        ? "border-night-gold/50 bg-night-gold/15 text-night-gold"
                        : "border-night-green/40 bg-night-green/12 text-night-green",
                )}
              >
                {nothing ? "—" : `${multiple.toFixed(2)}×`}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}

/** Keeps the newest `limit` entries, newest first. */
export function pushHistory(
  entries: readonly HistoryEntry[],
  entry: HistoryEntry,
  limit = 15,
): HistoryEntry[] {
  return [entry, ...entries].slice(0, limit);
}
