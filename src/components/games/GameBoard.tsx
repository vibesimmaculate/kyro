"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { EffectsLayer, type EffectsHandle } from "@/components/games/EffectsLayer";
import { GameHistory, type HistoryEntry } from "@/components/games/GameHistory";
import { WinOverlay } from "@/components/games/WinOverlay";
import { cn } from "@/lib/cn";
import { MULTIPLIER_SCALE, type GameId } from "@/lib/games";
import type { CryptoCode } from "@/lib/money/currencies";
import { PALETTE } from "@/lib/particles";

/**
 * The lit surface every game is played on.
 *
 * Carries four things each board would otherwise reinvent: the accent colour
 * for the game, the win celebration, the recent-results strip, and the physical
 * response to a result — particles and shake. Setting `--accent` here is what
 * lets every child use `var(--accent)` without knowing which game it belongs to.
 *
 * Putting the effects here rather than in each game is deliberate. Six boards
 * each deciding how hard to shake is six boards that disagree, and a wing where
 * a 2× on one game feels bigger than a 40× on another is a wing that has
 * stopped telling the truth about what just happened.
 */

/** Scales every response. A 200× is the top of the range worth reacting to. */
const CEILING = 2_000_000;

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
  const effectsRef = useRef<EffectsHandle | null>(null);

  // Keyed on the round, so re-rendering for any other reason cannot replay a
  // celebration that already happened.
  const roundKey = win?.roundKey;
  const multiplier = win?.multiplier ?? 0;

  useEffect(() => {
    if (!roundKey || multiplier <= MULTIPLIER_SCALE) return;

    const strength = Math.min(1, multiplier / CEILING);
    const big = multiplier >= 50_000;

    effectsRef.current?.shake(0.2 + strength * 0.5);
    effectsRef.current?.burst({
      x: 0.5,
      y: 0.62,
      count: big ? 54 : 26,
      colours: big ? PALETTE.gold : PALETTE.green,
      speed: 0.8 + strength * 1.1,
      life: 1.1,
      size: big ? 3.4 : 2.6,
      arc: Math.PI * 1.3,
      direction: -Math.PI / 2,
      gravity: 1.5,
    });
    // A second, slower ring of embers behind the first. One burst reads as a
    // pop; two at different speeds read as an event with a tail.
    if (big) {
      effectsRef.current?.burst({
        x: 0.5,
        y: 0.62,
        count: 22,
        colours: PALETTE.ember,
        speed: 0.4,
        life: 1.7,
        size: 2.2,
        shape: "dot",
        arc: Math.PI * 2,
        gravity: 0.7,
      });
    }
  }, [roundKey, multiplier]);

  useEffect(() => {
    if (!shake) return;
    effectsRef.current?.shake(0.62);
    effectsRef.current?.burst({
      x: 0.5,
      y: 0.5,
      count: 26,
      colours: PALETTE.red,
      speed: 1.1,
      life: 0.6,
      size: 2.4,
      arc: Math.PI * 2,
      gravity: 2.4,
      drag: 2,
    });
  }, [shake]);

  return (
    <div>
      <EffectsLayer
        ref={effectsRef}
        magnitude={11}
        className={cn(
          "game-surface overflow-hidden rounded-[14px] p-4 sm:p-6",
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
      </EffectsLayer>

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
