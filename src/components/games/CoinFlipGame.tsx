"use client";

import { useState, useTransition } from "react";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { ResultBanner } from "@/components/games/ResultBanner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { COIN_FLIP_MULTIPLIER, type CoinSide } from "@/lib/games";
import type { CryptoCode } from "@/lib/money/currencies";
import { playCoinFlipRound, type RoundResult } from "@/server/games/play";

/**
 * Coin Flip.
 *
 * A square that turns over — no 3D disc, no gold, no spin. The satisfaction is
 * in the timing and the weight of the figure that lands.
 */
export function CoinFlipGame({
  asset,
  balance: initialBalance,
  disabled,
}: {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  readonly disabled?: boolean;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n);
  const [pick, setPick] = useState<CoinSide>("heads");
  const [result, setResult] = useState<RoundResult | undefined>();
  const [pending, start] = useTransition();

  function play() {
    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("pick", pick);
    start(async () => {
      const outcome = await playCoinFlipRound(form);
      setResult(outcome);
      if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    });
  }

  const landed = result?.ok ? (result.outcome?.landed as CoinSide | undefined) : undefined;
  const won = result?.ok ? result.outcome?.won === true : false;

  return (
    <GameLayout
      board={
        <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-[10px] border border-night-rule bg-night-raised p-8">
          <div
            key={result?.roundId ?? "idle"}
            className={cn(
              "flex h-36 w-36 items-center justify-center rounded-[10px] border-2 transition-colors",
              !landed
                ? "border-night-rule-strong text-night-muted"
                : won
                  ? "border-night-green text-night-green"
                  : "border-night-red text-night-red",
              landed && "animate-[kyro-digit-in_var(--duration-slow)_var(--ease-out-quiet)]",
            )}
          >
            <span className="label-mono text-[0.8125rem] tracking-[0.2em]">
              {landed ? landed.toUpperCase() : "—"}
            </span>
          </div>

          <p className="mt-6 text-center text-small text-night-muted">
            {landed
              ? `You called ${pick}. It landed ${landed}.`
              : "Call a side, set your stake, and flip."}
          </p>

          <ResultBanner result={result} asset={asset} className="mt-4 w-full max-w-sm" />
        </div>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          multiplier={COIN_FLIP_MULTIPLIER}
          disabled={disabled || pending}
          action={
            <Button
              tone="night"
              size="lg"
              full
              onClick={play}
              disabled={disabled || pending || stake <= 0n || stake > balance}
            >
              {pending ? "Flipping…" : "Flip"}
            </Button>
          }
        >
          <fieldset>
            <legend className="label-mono text-night-muted">Your call</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["heads", "tails"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPick(side)}
                  aria-pressed={pick === side}
                  disabled={disabled || pending}
                  className={cn(
                    "tap rounded-[8px] border px-4 text-[0.9375rem] capitalize transition-colors",
                    pick === side
                      ? "border-night-blue bg-night-blue/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {side}
                </button>
              ))}
            </div>
          </fieldset>
        </BetPanel>
      }
    />
  );
}
