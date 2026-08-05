"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PLINKO_MULTIPLIERS, PLINKO_ROWS, formatMultiplier } from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { playPlinkoRound, type RoundResult } from "@/server/games/play";

/**
 * Plinko.
 *
 * The ball's path is decided by the seeds, not by physics — twelve left-or-right
 * choices, each one a bit from the round's HMAC. The animation walks that exact
 * path, so what you watch is the proof, replayed at a speed a person can read.
 *
 * Reduced motion drops the ball straight into its bucket.
 */

const STEP_MS = 110;

export function PlinkoGame({
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
  const [result, setResult] = useState<RoundResult | undefined>();
  const [step, setStep] = useState(PLINKO_ROWS);
  const [pending, start] = useTransition();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const path = result?.ok ? (result.outcome?.path as ("L" | "R")[] | undefined) : undefined;
  const bucket = result?.ok ? (result.outcome?.bucket as number | undefined) : undefined;
  const dropping = step < PLINKO_ROWS;

  function play() {
    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));

    start(async () => {
      const outcome = await playPlinkoRound(form);
      setResult(outcome);
      if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
      if (!outcome.ok) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setStep(PLINKO_ROWS);
        return;
      }

      setStep(0);
      const advance = (row: number) => {
        if (row >= PLINKO_ROWS) {
          setStep(PLINKO_ROWS);
          return;
        }
        setStep(row);
        timer.current = window.setTimeout(() => advance(row + 1), STEP_MS);
      };
      advance(0);
    });
  }

  // Position after `step` bounces: x is how far right the ball has drifted.
  const rightsSoFar = path?.slice(0, step).filter((d) => d === "R").length ?? 0;
  const ballRow = Math.min(step, PLINKO_ROWS);
  const ballX = path ? ((rightsSoFar - ballRow / 2) / (PLINKO_ROWS / 2)) * 50 + 50 : 50;
  const ballY = (ballRow / PLINKO_ROWS) * 100;

  return (
    <GameLayout
      board={
        <div className="rounded-[10px] border border-night-rule bg-night-raised p-4 sm:p-6">
          <div className="relative aspect-[4/3] w-full">
            {/* The pegs. A triangle, twelve rows deep. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {Array.from({ length: PLINKO_ROWS }, (_, row) =>
                Array.from({ length: row + 1 }, (_, peg) => {
                  const x = 50 + ((peg - row / 2) / (PLINKO_ROWS / 2)) * 50;
                  const y = ((row + 1) / PLINKO_ROWS) * 100;
                  return (
                    <circle
                      key={`${row}-${peg}`}
                      cx={x}
                      cy={y - 4}
                      r="0.7"
                      fill="var(--color-night-rule-strong)"
                    />
                  );
                }),
              )}

              {path ? (
                <circle
                  cx={ballX}
                  cy={Math.max(2, ballY - 4)}
                  r="1.8"
                  fill="var(--color-night-blue)"
                  style={{
                    transition: dropping
                      ? `cx ${STEP_MS}ms linear, cy ${STEP_MS}ms linear`
                      : undefined,
                  }}
                />
              ) : null}
            </svg>
          </div>

          {/* The buckets, with their real multipliers. */}
          <ol className="mt-3 grid grid-cols-13 gap-[2px]" style={{ gridTemplateColumns: `repeat(${PLINKO_ROWS + 1}, minmax(0, 1fr))` }}>
            {PLINKO_MULTIPLIERS.map((multiplier, index) => {
              const landed = !dropping && bucket === index;
              return (
                <li
                  key={index}
                  className={cn(
                    "rounded-[3px] border py-1.5 text-center transition-colors duration-[var(--duration-base)]",
                    landed
                      ? "border-night-blue bg-night-blue/25 text-night-text"
                      : multiplier >= 20_000
                        ? "border-night-rule bg-night-sunk text-night-muted"
                        : "border-night-rule bg-night-sunk text-night-muted",
                  )}
                >
                  <span className="figure-num text-[0.625rem] leading-none">
                    {(multiplier / 10_000).toFixed(multiplier >= 100_000 ? 0 : 1)}
                  </span>
                </li>
              );
            })}
          </ol>

          <p aria-live="polite" className="mt-4 min-h-[2.5rem] text-small text-night-muted">
            {result && !result.ok ? (
              <span className="text-night-amber">{result.error}</span>
            ) : !dropping && bucket !== undefined ? (
              <>
                Bucket {bucket + 1} of 13 —{" "}
                {formatMultiplier(PLINKO_MULTIPLIERS[bucket] ?? 0)}, paying{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                </span>
                .
              </>
            ) : dropping ? (
              "Falling…"
            ) : (
              "Drop a ball. Twelve bounces, thirteen places to land — the middle is likely and cheap, the edges are rare and not."
            )}
          </p>
        </div>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          disabled={disabled || pending || dropping}
          action={
            <Button
              tone="night"
              size="lg"
              full
              onClick={play}
              disabled={disabled || pending || dropping || stake <= 0n || stake > balance}
            >
              {pending || dropping ? "Falling…" : "Drop"}
            </Button>
          }
        >
          <div className="border-t border-night-rule pt-4">
            <p className="label-mono text-night-muted">The spread</p>
            <p className="mt-2 text-small text-night-muted">
              The centre bucket comes up about 23 times in 100; each edge about once in
              4 096. The multipliers are derived from exactly those odds — they are not
              chosen numbers.
            </p>
          </div>
        </BetPanel>
      }
    />
  );
}
