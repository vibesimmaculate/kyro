"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the person using this has asked for less motion.
 *
 * A media query is an external store, so it is subscribed to rather than copied
 * into state by an effect — the pattern the React compiler rejects, and rightly:
 * an effect that writes state on mount renders twice for no reason.
 *
 * The server snapshot is `false`, matching the default, so the first paint never
 * disagrees with itself.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function snapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** The same question outside React, for animation callbacks. */
export function prefersReducedMotion(): boolean {
  return snapshot();
}
