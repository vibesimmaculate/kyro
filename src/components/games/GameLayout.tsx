import type { ReactNode } from "react";

/**
 * Board left, controls right. One shape for all five games, so moving between
 * them never means learning a new layout.
 */
export function GameLayout({
  board,
  controls,
}: {
  readonly board: ReactNode;
  readonly controls: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Controls come first in the DOM on small screens: on a phone the stake
          and the button matter more than the board above them. */}
      <div className="order-2 lg:order-1 lg:col-span-7">{board}</div>
      <div className="order-1 lg:order-2 lg:col-span-5">{controls}</div>
    </div>
  );
}
