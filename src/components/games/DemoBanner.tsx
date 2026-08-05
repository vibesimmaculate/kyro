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
        "rounded-[10px] border border-night-blue/40 bg-night-blue/10 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-subhead font-medium">You are playing in demo mode.</p>
        <p className="figure-num text-small text-night-muted">
          {formatCrypto(cryptoAmount(balance, "USDT"))}{" "}
          <span className="label-mono">demo credits</span>
        </p>
      </div>

      <p className="mt-2 max-w-[68ch] text-small text-night-muted">
        No account, no deposit, and nothing here is worth anything. The maths is
        identical to the real game — same multipliers, same 1% edge — but the outcome
        is generated in your browser, so it is <em className="not-italic text-night-text">not</em>{" "}
        provably fair. That guarantee only means something when KYRO holds the seed.{" "}
        <Link
          href="/games/fairness"
          className="text-night-text underline underline-offset-4"
        >
          How fairness works
        </Link>
        .
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href="/sign-up?next=/games"
          className="tap inline-flex items-center rounded-[8px] border border-night-blue bg-night-blue px-4 text-small font-semibold text-night-sunk transition-[filter] hover:brightness-110"
        >
          Play for real
        </Link>
        <button
          type="button"
          onClick={topUp}
          className="tap inline-flex items-center rounded-[8px] border border-night-rule-strong px-4 text-small text-night-text transition-colors hover:border-night-muted"
        >
          Reset demo credits
        </button>
      </div>
    </div>
  );
}
