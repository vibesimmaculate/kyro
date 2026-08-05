"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import {
  DEMO_STARTING_BALANCE,
  demoBalanceSnapshot,
  resetDemoBalance,
  subscribeToDemoBalance,
} from "@/lib/games/demo";
import { play, unlockSound } from "@/lib/sound";

/**
 * The demo notice.
 *
 * Two things it must say without being asked twice: this is not real money, and
 * the outcome is not provably fair here — your own browser is generating both
 * seeds, so there is nobody to prove anything to. Demo mode is for learning the
 * game and feeling the odds, and saying so is more useful than implying a
 * guarantee that only applies once you are signed in.
 */
export function DemoBanner({ className }: { readonly className?: string }) {
  // The games write the balance as rounds settle, so it is watched as an
  // external store rather than polled — the banner updates the moment a round
  // finishes, with no timer and no effect writing state on mount.
  const balance = BigInt(
    useSyncExternalStore(
      subscribeToDemoBalance,
      demoBalanceSnapshot,
      () => DEMO_STARTING_BALANCE.toString(),
    ),
  );

  function topUp() {
    unlockSound();
    play("cashout");
    resetDemoBalance();
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border",
        "border-night-blue/35 bg-night-blue/10 px-4 py-3",
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-small">
        <span className="font-medium text-night-text">Demo mode.</span>
        <span className="text-night-muted">
          Real maths, no money — and{" "}
          <em className="not-italic text-night-text">not</em> provably fair, because your
          browser generates the seed.
        </span>
        <Link
          href="/games/fairness"
          className="text-night-muted underline underline-offset-4 hover:text-night-text"
        >
          Why
        </Link>
      </p>

      <p className="figure-num flex-none text-small text-night-text">
        {formatCrypto(cryptoAmount(balance, "USDT"))}
      </p>

      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={topUp}
          className="tap inline-flex items-center rounded-[8px] border border-night-rule-strong px-3 text-small text-night-muted transition-colors hover:border-night-muted hover:text-night-text"
        >
          Reset
        </button>
        <Link
          href="/sign-up?next=/games"
          className="tap inline-flex items-center rounded-[8px] border border-night-blue bg-night-blue px-4 text-small font-semibold text-night-sunk transition-[filter] hover:brightness-110"
        >
          Play for real
        </Link>
      </div>
    </div>
  );
}
