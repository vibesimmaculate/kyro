"use client";

import { useMemo, useState, useTransition } from "react";
import * as Slider from "@radix-ui/react-slider";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { ResultBanner } from "@/components/games/ResultBanner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { DICE_MAX_CHANCE, DICE_MIN_CHANCE, diceMultiplier, formatMultiplier } from "@/lib/games";
import type { CryptoCode } from "@/lib/money/currencies";
import { playDiceRound, type RoundResult } from "@/server/games/play";
import { demoDice } from "@/lib/games/demo";
import { feedback, play as playSound, unlockSound } from "@/lib/sound";

/**
 * Dice.
 *
 * One slider that moves three numbers at once — win chance, target and payout.
 * Seeing them move together is the whole lesson of the game: the odds and the
 * price of those odds are the same fact stated twice.
 */
export function DiceGame({
  asset,
  balance: initialBalance,
  demo,
}: {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  readonly demo?: boolean;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n);
  const [chance, setChance] = useState(50);
  const [direction, setDirection] = useState<"under" | "over">("under");
  const [result, setResult] = useState<RoundResult | undefined>();
  const [pending, start] = useTransition();

  const multiplier = useMemo(() => diceMultiplier(chance), [chance]);
  const target = direction === "under" ? chance : 100 - chance;

  function announce(outcome: RoundResult) {
    setResult(outcome);
    if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    if (!outcome.ok) return;
    if (BigInt(outcome.payout ?? "0") > 0n) {
      // Longer odds sound bigger, because they are.
      feedback("win", Math.min(1, (multiplier - 10_000) / 100_000), [10, 30, 10]);
    } else {
      feedback("lose", 0, 18);
    }
  }

  function rollDice() {
    unlockSound();
    playSound("tick");

    if (demo) {
      announce(demoDice(stake, chance, direction));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("chance", String(chance));
    form.set("direction", direction);
    start(async () => {
      announce(await playDiceRound(form));
    });
  }

  const roll = result?.ok ? (result.outcome?.roll as number | undefined) : undefined;
  const won = result?.ok ? result.outcome?.won === true : false;

  return (
    <GameLayout
      board={
        <div className="flex min-h-[24rem] flex-col justify-center rounded-[10px] border border-night-rule bg-night-raised p-6 sm:p-8">
          <p className="label-mono text-center text-night-muted">Roll</p>
          <p
            key={result?.roundId ?? "idle"}
            className={cn(
              "figure-num mt-2 text-center text-[clamp(3rem,12vw,4.5rem)] leading-none tabular-nums",
              roll === undefined
                ? "text-night-muted"
                : won
                  ? "text-night-green"
                  : "text-night-red",
              roll !== undefined &&
                "animate-[kyro-digit-in_var(--duration-slow)_var(--ease-out-quiet)]",
            )}
          >
            {roll === undefined ? "00.00" : roll.toFixed(2)}
          </p>

          {/* The number line: where the win band sits, and where the roll fell. */}
          <div className="relative mt-10 h-2 rounded-full bg-night-sunk">
            <div
              className="absolute inset-y-0 rounded-full bg-night-green/40"
              style={
                direction === "under"
                  ? { left: 0, width: `${target}%` }
                  : { left: `${target}%`, right: 0 }
              }
            />
            {roll !== undefined ? (
              <span
                className={cn(
                  "absolute -top-2 h-6 w-0.5 -translate-x-1/2 transition-[left] duration-[var(--duration-slow)]",
                  won ? "bg-night-green" : "bg-night-red",
                )}
                style={{ left: `${roll}%` }}
              />
            ) : null}
          </div>

          <div className="mt-2 flex justify-between text-micro text-night-muted">
            <span className="figure-num">0</span>
            <span className="figure-num">
              {direction === "under" ? "Win below" : "Win above"} {target.toFixed(2)}
            </span>
            <span className="figure-num">100</span>
          </div>

          <ResultBanner result={result} asset={asset} className="mt-6" />
        </div>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          multiplier={multiplier}
          disabled={pending}
          demo={demo}
          action={
            <Button
              tone="night"
              size="lg"
              full
              onClick={rollDice}
              disabled={pending || stake <= 0n || stake > balance}
            >
              {pending ? "Rolling…" : "Roll"}
            </Button>
          }
        >
          <div>
            <div className="grid grid-cols-2 gap-2">
              {(["under", "over"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setDirection(option);
                    unlockSound();
                    playSound("select");
                  }}
                  aria-pressed={direction === option}
                  disabled={pending}
                  className={cn(
                    "tap rounded-[8px] border px-3 text-[0.9375rem] capitalize transition-colors",
                    direction === option
                      ? "border-night-blue bg-night-blue/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  Roll {option}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="chance" className="label-mono text-night-muted">
                  Win chance
                </label>
                <span className="figure-num text-small">{chance}%</span>
              </div>

              <Slider.Root
                id="chance"
                value={[chance]}
                onValueChange={([next]) => {
                  setChance(next ?? 50);
                  playSound("tick");
                }}
                min={DICE_MIN_CHANCE}
                max={DICE_MAX_CHANCE}
                step={1}
                disabled={pending}
                className="relative mt-3 flex h-6 w-full touch-none items-center select-none"
              >
                <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-night-sunk">
                  <Slider.Range className="absolute h-full rounded-full bg-night-blue" />
                </Slider.Track>
                {/* The thumb carries role="slider", so the accessible name must
                    live here — on the Root it names a group nobody focuses. */}
                <Slider.Thumb
                  aria-label="Win chance"
                  className={cn(
                    "block h-6 w-6 rounded-full border-2 border-night-blue bg-night-raised",
                    "transition-transform duration-[var(--duration-fast)] hover:scale-105 active:scale-95",
                  )}
                />
              </Slider.Root>

              <dl className="mt-4 space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <dt className="flex-none text-small text-night-muted">Payout</dt>
                  <span aria-hidden="true" className="leader-night" />
                  <dd className="figure-num flex-none text-small">
                    {formatMultiplier(multiplier)}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="flex-none text-small text-night-muted">
                    Wins when the roll is {direction}
                  </dt>
                  <span aria-hidden="true" className="leader-night" />
                  <dd className="figure-num flex-none text-small">{target.toFixed(2)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </BetPanel>
      }
    />
  );
}
