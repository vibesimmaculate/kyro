"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import {
  play,
  setSoundEnabled,
  soundEnabled,
  subscribeToSound,
  unlockSound,
} from "@/lib/sound";

/**
 * Sound on or off, remembered.
 *
 * Sits in the games header where it can be found without hunting, because a
 * game that makes noise you cannot immediately silence is a game people close
 * the tab on.
 */
export function SoundToggle({ className }: { readonly className?: string }) {
  // localStorage is an external store, so it is subscribed to rather than
  // copied into state by an effect. The server snapshot is `true`, matching the
  // default, so the first paint never disagrees with itself.
  const active = useSyncExternalStore(
    subscribeToSound,
    () => soundEnabled(),
    () => true,
  );

  function toggle() {
    const next = !active;
    unlockSound();
    setSoundEnabled(next);
    if (next) play("select");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={active ? "Turn sound off" : "Turn sound on"}
      className={cn(
        "tap inline-flex items-center gap-2 rounded-[6px] px-2.5 text-small transition-colors",
        "text-night-muted hover:text-night-text",
        className,
      )}
    >
      <SpeakerIcon muted={!active} />
      <span className="hidden sm:inline">{active ? "Sound on" : "Sound off"}</span>
    </button>
  );
}

/** Drawn rather than imported: two paths, and it matches the hairline system. */
function SpeakerIcon({ muted }: { readonly muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
    >
      <path d="M3 6h2.5L9 3v10L5.5 10H3z" />
      {muted ? (
        <path d="M11.5 6.5l3 3m0-3l-3 3" />
      ) : (
        <>
          <path d="M11.5 6a2.6 2.6 0 0 1 0 4" />
          <path d="M13.2 4.4a5 5 0 0 1 0 7.2" opacity="0.6" />
        </>
      )}
    </svg>
  );
}
