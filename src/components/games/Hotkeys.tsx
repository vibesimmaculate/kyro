"use client";

import { useEffect } from "react";

/**
 * Keyboard play.
 *
 * The single biggest difference between a game you try and a game you *play* is
 * whether your hand has to keep travelling to the mouse. Space to go again,
 * arrows to size the bet — that is how a hundred rounds happen instead of five,
 * and it is standard on every crypto casino worth the comparison.
 *
 * It is also, less obviously, an accessibility win: every one of these actions
 * already has a button, and this gives the same actions a second route that
 * never requires pointing at anything.
 *
 * Two rules keep it out of the way. Nothing fires while focus is in a text
 * field, so typing a stake is never hijacked. And nothing fires while a
 * modifier is held, so browser and OS shortcuts keep working.
 */

export interface HotkeyMap {
  /** Space and Enter. The primary action of the board. */
  readonly go?: () => void;
  /** Escape, or the secondary action — cashing out, taking the money. */
  readonly out?: () => void;
  readonly double?: () => void;
  readonly half?: () => void;
  readonly disabled?: boolean;
}

export function Hotkeys({ go, out, double, half, disabled }: HotkeyMap) {
  useEffect(() => {
    if (disabled) return;

    function handle(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      switch (event.key) {
        case " ":
        case "Enter":
          if (!go) return;
          // Space would otherwise scroll the page out from under the board.
          event.preventDefault();
          go();
          break;
        case "Escape":
          if (!out) return;
          event.preventDefault();
          out();
          break;
        case "ArrowUp":
          if (!double) return;
          event.preventDefault();
          double();
          break;
        case "ArrowDown":
          if (!half) return;
          event.preventDefault();
          half();
          break;
        default:
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [go, out, double, half, disabled]);

  return null;
}

/** The legend, so the shortcuts are discoverable rather than folklore. */
export function HotkeyLegend({
  primary,
  secondary,
}: {
  readonly primary: string;
  readonly secondary?: string;
}) {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-night-muted">
      <li className="flex items-center gap-1.5">
        <Key>Space</Key> {primary}
      </li>
      {secondary ? (
        <li className="flex items-center gap-1.5">
          <Key>Esc</Key> {secondary}
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <Key>↑</Key>
        <Key>↓</Key> stake
      </li>
    </ul>
  );
}

function Key({ children }: { readonly children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-night-rule-strong bg-night-sunk px-1.5 py-0.5 font-mono text-[0.625rem] text-night-text">
      {children}
    </kbd>
  );
}
