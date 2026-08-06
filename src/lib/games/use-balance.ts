"use client";

import { useState, useSyncExternalStore } from "react";
import { demoBalanceSnapshot, subscribeToDemoBalance } from "@/lib/games/demo";

/**
 * The balance a game panel shows, from whichever source is actually the record.
 *
 * In demo mode that is the localStorage store, not React state. Every game used
 * to seed a local `useState` from a server prop and then adjust it as rounds
 * settled, which is right for real money — the server has already told you the
 * figure — and wrong for demo, where the same store is being read by the banner
 * at the top of the page. The two drifted apart within a few rounds and the page
 * ended up showing a player two different balances at once.
 *
 * So in demo the store wins and updates are ignored, because the store has
 * already applied them. In real mode nothing changes.
 */
export function useGameBalance(
  initial: bigint,
  demo: boolean | undefined,
): readonly [bigint, (next: bigint) => void] {
  const [local, setLocal] = useState(initial);
  const stored = useSyncExternalStore(
    subscribeToDemoBalance,
    demoBalanceSnapshot,
    // On the server there is no store, so render the figure that was passed in.
    () => initial.toString(),
  );

  if (demo) return [BigInt(stored), () => {}] as const;
  return [local, setLocal] as const;
}
