import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A horizontally scrolling region that a keyboard can actually reach.
 *
 * A `div` with `overflow-x: auto` is scrollable by mouse and touch and by
 * nothing else — a keyboard user simply cannot see the right-hand half of a
 * wide table. Making it focusable gives them the arrow keys, and the region
 * role plus a name means a screen reader announces what they have landed in
 * rather than an anonymous group.
 *
 * Only needed where the content has no focusable children of its own; a list of
 * links scrolls perfectly well by tabbing through them.
 */
export interface ScrollAreaProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function ScrollArea({ label, children, className }: ScrollAreaProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "overflow-x-auto",
        // The focus ring has to be visible on the container itself, since that
        // is now a tab stop in its own right.
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
        className,
      )}
    >
      {children}
    </div>
  );
}
