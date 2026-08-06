import { cn } from "@/lib/cn";
import type { GameId } from "@/lib/games";

/**
 * A mark for each game.
 *
 * Drawn on one 24-unit grid with one stroke weight, so seven of them in a row
 * read as a set rather than as seven pieces of clip art. Each one is the
 * game's own geometry — the pin triangle, the tower's floors, the curve, the
 * wheel's spokes — because a game about a falling ball should be identified by
 * a falling ball and not by a generic chip icon.
 *
 * No gradients, no rounded-corner blobs, no icon-in-a-circle. The colour comes
 * from `--accent`, which the layout has already set to whichever game is being
 * drawn, so the mark cannot disagree with the board it belongs to.
 */

export function GameMark({
  game,
  className,
  strokeWidth = 1.8,
}: {
  readonly game: GameId;
  readonly className?: string;
  readonly strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("block", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MARKS[game]}
    </svg>
  );
}

const MARKS: Record<GameId, React.ReactNode> = {
  // Three floors, the middle one open: the choice you make on every one.
  tower: (
    <>
      <rect x="4" y="16.5" width="16" height="4" rx="1" />
      <rect x="6" y="10.5" width="12" height="4" rx="1" />
      <rect x="8" y="4.5" width="8" height="4" rx="1" />
      <circle cx="12" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),

  // A coin caught on edge, mid-turn.
  "coin-flip": (
    <>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="3.1" ry="8" />
    </>
  ),

  // A die, with the pips of a three.
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.4" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),

  // A field of tiles with one already turned over.
  mines: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect
        x="13.5"
        y="13.5"
        width="7"
        height="7"
        rx="1.6"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),

  // The curve, and the point it stops at.
  crash: (
    <>
      <path d="M3.5 19.5C8 19.5 13.5 16 17.5 6" />
      <circle cx="18.4" cy="5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M3.5 19.5h17" opacity="0.35" />
    </>
  ),

  // The pin triangle, and the ball above it.
  plinko: (
    <>
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="15" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16" cy="15" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="4" cy="19.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="20" cy="19.5" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),

  // Spokes and the marker they pass under.
  wheel: (
    <>
      <circle cx="12" cy="13.5" r="7.6" />
      <path d="M12 5.9v15.2M4.4 13.5h15.2M6.6 8.1l10.8 10.8M17.4 8.1 6.6 18.9" opacity="0.5" />
      <path d="M12 1.6 14 5H10z" fill="currentColor" stroke="none" />
    </>
  ),
};
