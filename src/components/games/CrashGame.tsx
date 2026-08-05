"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MULTIPLIER_SCALE, formatMultiplier } from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { playCrashRound, type RoundResult } from "@/server/games/play";

/**
 * Crash.
 *
 * The outcome is decided the instant the stake is taken — this is a curve
 * replaying a settled result, not a live race, and the copy says so. What the
 * animation adds is legibility: watching the number climb and stop is a far
 * clearer account of what happened than being handed the final figure.
 *
 * Under reduced motion the curve does not animate at all. The multiplier steps
 * straight to its final value and the reading is identical.
 */

const CLIMB_MS = 2_400;

export function CrashGame({
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
  const [target, setTarget] = useState("2.00");
  const [result, setResult] = useState<RoundResult | undefined>();
  const [displayed, setDisplayed] = useState(MULTIPLIER_SCALE);
  const [running, setRunning] = useState(false);
  const [pending, start] = useTransition();
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const crashAt = result?.ok ? (result.outcome?.crashPoint as number | undefined) : undefined;
  const survived = result?.ok ? result.outcome?.survived === true : false;
  const targetScaled = Math.round(Number(target || "1") * MULTIPLIER_SCALE);

  function animateTo(finalValue: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayed(finalValue);
      setRunning(false);
      return;
    }

    const startedAt = performance.now();
    setRunning(true);

    const step = (now: number) => {
      const elapsed = now - startedAt;
      // Eases out so the last stretch before the break is the slow one, which
      // is where the decision would have lived.
      const progress = Math.min(1, elapsed / CLIMB_MS);
      const eased = 1 - Math.pow(1 - progress, 2.4);
      setDisplayed(MULTIPLIER_SCALE + (finalValue - MULTIPLIER_SCALE) * eased);

      if (progress < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        setDisplayed(finalValue);
        setRunning(false);
      }
    };

    frame.current = requestAnimationFrame(step);
  }

  function play() {
    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("target", target);
    setResult(undefined);
    setDisplayed(MULTIPLIER_SCALE);

    start(async () => {
      const outcome = await playCrashRound(form);
      setResult(outcome);
      if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
      if (outcome.ok) {
        const point = outcome.outcome?.crashPoint as number;
        const stopAt = outcome.outcome?.survived ? targetScaled : point;
        animateTo(stopAt);
      }
    });
  }

  const shown = Math.round(displayed);
  const finished = Boolean(result?.ok) && !running;

  // The curve, drawn as a path whose height tracks the same eased progress.
  const progress =
    crashAt && crashAt > MULTIPLIER_SCALE
      ? Math.min(1, (displayed - MULTIPLIER_SCALE) / Math.max(1, crashAt - MULTIPLIER_SCALE))
      : 0;

  return (
    <GameLayout
      board={
        <div className="relative overflow-hidden rounded-[10px] border border-night-rule bg-night-raised p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-mono text-night-muted">Multiplier</p>
            <p className="label-mono text-night-muted">
              Auto cash-out {Number(target || "1").toFixed(2)}×
            </p>
          </div>

          <div className="relative mt-6 h-48">
            <svg
              viewBox="0 0 400 180"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <line x1="0" y1="179" x2="400" y2="179" stroke="var(--color-night-rule)" strokeWidth="1" />
              <line x1="1" y1="0" x2="1" y2="180" stroke="var(--color-night-rule)" strokeWidth="1" />

              {/* Where the auto cash-out sits, so the target is a place on the
                  chart rather than a number to hold in your head. */}
              {crashAt ? (
                <line
                  x1="0"
                  y1={180 - Math.min(1, (targetScaled - MULTIPLIER_SCALE) / Math.max(1, crashAt - MULTIPLIER_SCALE)) * 170}
                  x2="400"
                  y2={180 - Math.min(1, (targetScaled - MULTIPLIER_SCALE) / Math.max(1, crashAt - MULTIPLIER_SCALE)) * 170}
                  stroke="var(--color-night-blue)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  opacity="0.6"
                />
              ) : null}

              <path
                d={`M 0 180 ${Array.from({ length: 41 }, (_, i) => {
                  const t = (i / 40) * progress;
                  const x = t * 400;
                  const y = 180 - Math.pow(t, 1.7) * 170;
                  return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(" ")}`}
                fill="none"
                stroke={
                  finished && !survived ? "var(--color-night-red)" : "var(--color-night-green)"
                }
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p
                className={cn(
                  "figure-num text-[clamp(2.5rem,10vw,4rem)] leading-none tabular-nums transition-colors",
                  !result
                    ? "text-night-muted"
                    : finished && !survived
                      ? "text-night-red"
                      : "text-night-green",
                )}
              >
                {(shown / MULTIPLIER_SCALE).toFixed(2)}×
              </p>
            </div>
          </div>

          <p aria-live="polite" className="mt-4 min-h-[2.5rem] text-small text-night-muted">
            {result && !result.ok ? (
              <span className="text-night-amber">{result.error}</span>
            ) : finished && crashAt ? (
              survived ? (
                <>
                  Cashed out at {Number(target).toFixed(2)}× before it broke at{" "}
                  {formatMultiplier(crashAt)}. You won{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                  </span>
                  .
                </>
              ) : (
                <>Broke at {formatMultiplier(crashAt)} — before your {Number(target).toFixed(2)}×.</>
              )
            ) : running ? (
              "Climbing…"
            ) : (
              "Set a target, place your stake. The outcome is fixed the moment you do — the curve replays it."
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
          multiplier={targetScaled}
          disabled={disabled || pending || running}
          action={
            <Button
              tone="night"
              size="lg"
              full
              onClick={play}
              disabled={disabled || pending || running || stake <= 0n || stake > balance}
            >
              {pending || running ? "Running…" : "Place bet"}
            </Button>
          }
        >
          <div>
            <label htmlFor="target" className="label-mono block text-night-muted">
              Cash out at
            </label>
            <p className="mt-1.5 text-small text-night-muted">
              KYRO takes you out automatically at this multiplier — no reflexes involved,
              and no advantage to anyone with a faster connection.
            </p>
            <div className="mt-2 flex items-stretch gap-2">
              <input
                id="target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                onBlur={() => {
                  const parsed = Number(target);
                  const safe = Number.isFinite(parsed) ? Math.min(1000, Math.max(1.01, parsed)) : 2;
                  setTarget(safe.toFixed(2));
                }}
                inputMode="decimal"
                disabled={disabled || pending || running}
                className={cn(
                  "figure-num min-h-11 min-w-0 flex-1 rounded-[8px] border border-night-rule-strong",
                  "bg-night-sunk px-3 text-[1.0625rem] outline-none transition-colors focus:border-night-blue",
                )}
              />
              <span className="label-mono flex flex-none items-center rounded-[8px] border border-night-rule bg-night-sunk px-3 text-night-muted">
                ×
              </span>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2">
              {["1.50", "2.00", "5.00", "10.00"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTarget(preset)}
                  disabled={disabled || pending || running}
                  className={cn(
                    "tap rounded-[6px] border text-small transition-colors",
                    target === preset
                      ? "border-night-blue bg-night-blue/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {Number(preset).toFixed(preset === "10.00" ? 0 : 1)}×
                </button>
              ))}
            </div>

            <p className="mt-4 border-t border-night-rule pt-3 text-micro text-night-muted">
              One round in a hundred breaks instantly at 1.00×. Every target returns the same
              99% over time — no multiplier is a better bet than another.
            </p>
          </div>
        </BetPanel>
      }
    />
  );
}
