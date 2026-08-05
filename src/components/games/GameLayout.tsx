import type { CSSProperties, ReactNode } from "react";
import type { GameId } from "@/lib/games";

/**
 * Board left, controls right. One shape for all six games, so moving between
 * them never means learning a new layout.
 *
 * The accent is set here rather than on the board, because the bet panel needs
 * it too — the primary button, the selected chips and the focus ring all read
 * from `var(--accent)`, and scoping it to the board alone left the most
 * important control on the page with no colour at all.
 */

const ACCENT: Record<GameId, string> = {
  tower: "var(--accent-tower)",
  "coin-flip": "var(--accent-coin-flip)",
  dice: "var(--accent-dice)",
  mines: "var(--accent-mines)",
  crash: "var(--accent-crash)",
  plinko: "var(--accent-plinko)",
};

export function GameLayout({
  game,
  board,
  controls,
}: {
  readonly game: GameId;
  readonly board: ReactNode;
  readonly controls: ReactNode;
}) {
  return (
    <div
      className="grid gap-5 lg:grid-cols-12"
      style={{ "--accent": ACCENT[game] } as CSSProperties}
    >
      {/* Controls come first in the DOM on small screens: on a phone the stake
          and the button matter more than the board above them. */}
      <div className="order-2 lg:order-1 lg:col-span-7">{board}</div>
      <div className="order-1 lg:order-2 lg:col-span-5">{controls}</div>
    </div>
  );
}
