"use client";

import type { ReactNode } from "react";
import { GameHistory, type HistoryEntry } from "@/components/games/GameHistory";
import { WinOverlay } from "@/components/games/WinOverlay";
import { cn } from "@/lib/cn";
import type { GameId } from "@/lib/games";
import type { CryptoCode } from "@/lib/money/currencies";

/**
 * The lit surface every game is played on.
 *
 * Carries three things each board would otherwise reinvent: the accent colour
 * for the game, the win celebration, and the recent-results strip. Setting
 * `--accent` here is what lets every child use `var(--accent)` without knowing
 * which game it belongs to.
 */

export interface GameBoardProps {
  /** Kept for call-site clarity; the accent itself is set by GameLayout. */
  readonly game?: GameId;
  readonly children: ReactNode;
  readonly history?: readonly HistoryEntry[];
  /** Drives the win celebration; omit for games that settle their own. */
  readonly win?: {
    readonly multiplier?: number;
    readonly payout?: bigint;
    readonly asset: CryptoCode;
    readonly roundKey?: string;
  };
  /** Shakes the board once — for a bust, and nothing else. */
  readonly shake?: boolean;
  readonly className?: string;
  readonly status?: ReactNode;
}

export function GameBoard({
  children,
  history,
  win,
  shake,
  className,
  status,
}: GameBoardProps) {
  return (
    <div>
      <div
        className={cn(
          "game-surface relative overflow-hidden rounded-[14px] p-4 sm:p-6",
          shake && "animate-[kyro-shake_var(--duration-slow)_var(--ease-out-quiet)]",
          className,
        )}
      >
        {children}
        {win ? (
          <WinOverlay
            multiplier={win.multiplier}
            payout={win.payout}
            asset={win.asset}
            roundKey={win.roundKey}
          />
        ) : null}
      </div>

      {status ? (
        <p aria-live="polite" className="mt-3 min-h-[1.5rem] text-small text-night-muted">
          {status}
        </p>
      ) : null}

      {history ? <GameHistory entries={history} className="mt-3" /> : null}
    </div>
  );
}

/** The big readout at the top of a board: multiplier, roll, whatever leads. */
export function BoardHeader({
  label,
  value,
  tone = "neutral",
  className,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly tone?: "neutral" | "win" | "lose" | "live";
  readonly className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <p className="label-mono text-night-muted">{label}</p>
      <p
        className={cn(
          "text-[1.375rem] font-medium transition-colors",
          tone === "win"
            ? "text-night-green"
            : tone === "lose"
              ? "text-night-red"
              : tone === "live"
                ? "text-[var(--accent)]"
                : "text-night-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export { type HistoryEntry };
