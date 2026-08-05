"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import * as Slider from "@radix-ui/react-slider";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { DICE_MAX_CHANCE, DICE_MIN_CHANCE, diceMultiplier, formatMultiplier } from "@/lib/games";
import { demoDice } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { playDiceRound, type RoundResult } from "@/server/games/play";

/**
 * Dice.
 *
 * One slider that moves three numbers at once — win chance, target and payout.
 * Seeing them move together is the whole lesson of the game: the odds and the
 * price of those odds are the same fact stated twice.
 *
 * The roll scrambles for six hundred milliseconds before settling on its
 * answer. The number is decided before the first frame; the scramble exists
 * because a figure that simply appears carries no weight.
 */

const ROLL_MS = 620;

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
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [rolling, setRolling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [scramble, setScramble] = useState(0);
  const [pending, start] = useTransition();
  const frameRef = useRef<number | undefined>(undefined);

  const multiplier = useMemo(() => diceMultiplier(chance), [chance]);
  const target = direction === "under" ? chance : 100 - chance;

  function settle(outcome: RoundResult) {
    setRolling(false);
    setSettled(true);
    if (!outcome.ok) return;

    const won = outcome.outcome?.won === true;
    setHistory((h) =>
      pushHistory(h, {
        id: outcome.roundId ?? String(Date.now()),
        multiplier: won ? (outcome.multiplier ?? 0) : 0,
      }),
    );

    if (won) celebrate(outcome.multiplier ?? 0);
    else feedback("lose", 0, 18);
  }

  function roll(outcome: RoundResult) {
    setResult(outcome);
    if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    if (!outcome.ok) {
      setSettled(true);
      return;
    }

    const reduced = prefersReducedMotion();
    if (reduced) {
      settle(outcome);
      return;
    }

    setRolling(true);
    const startedAt = performance.now();
    const final = (outcome.outcome?.roll as number) ?? 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ROLL_MS);
      // The scramble slows and tightens around the real answer rather than
      // stopping dead, so the last few frames read as the die settling.
      const spread = (1 - progress) * 48;
      const wobble = Math.sin(now / 22) * spread;
      setScramble(Math.max(0, Math.min(99.99, final + wobble)));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setScramble(final);
        settle(outcome);
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }

  function rollDice() {
    unlockSound();
    playSound("tick");
    setSettled(false);
    setResult(undefined);

    if (demo) {
      roll(demoDice(stake, chance, direction));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("chance", String(chance));
    form.set("direction", direction);
    start(async () => {
      roll(await playDiceRound(form));
    });
  }

  const finalRoll = settled && result?.ok ? (result.outcome?.roll as number | undefined) : undefined;
  const shown = rolling ? scramble : finalRoll;
  const won = settled && result?.ok ? result.outcome?.won === true : false;
  const busy = pending || rolling;

  return (
    <GameLayout
      game="dice"
      board={
        <GameBoard
          game="dice"
          history={history}
          win={
            settled && won
              ? {
                  multiplier: result?.multiplier,
                  payout: BigInt(result?.payout ?? "0"),
                  asset,
                  roundKey: result?.roundId,
                }
              : undefined
          }
          status={
            result && !result.ok ? (
              <span className="text-night-amber">{result.error}</span>
            ) : settled && finalRoll !== undefined ? (
              won ? (
                <>
                  {finalRoll.toFixed(2)} is {direction} {target.toFixed(2)} —{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                  </span>
                  .
                </>
              ) : (
                <>
                  {finalRoll.toFixed(2)} is not {direction} {target.toFixed(2)}.
                </>
              )
            ) : rolling ? (
              "Rolling…"
            ) : (
              "Set your odds. The payout moves with them."
            )
          }
        >
          <div className="flex min-h-[19rem] flex-col justify-center py-2">
            <p className="label-mono text-center text-night-muted">Roll</p>
            <p
              className={cn(
                "figure-num mt-2 text-center text-[clamp(3rem,13vw,5rem)] leading-none tabular-nums transition-colors",
                shown === undefined
                  ? "text-night-muted"
                  : rolling
                    ? "text-night-text"
                    : won
                      ? "text-night-green"
                      : "text-night-red",
              )}
            >
              {(shown ?? 0).toFixed(2)}
            </p>

            {/* The number line: the winning band, and where the roll fell. */}
            <div className="relative mt-10 h-3 rounded-full bg-night-sunk">
              <div
                className={cn(
                  "absolute inset-y-0 rounded-full transition-all duration-[var(--duration-base)]",
                  "bg-night-green/45",
                )}
                style={
                  direction === "under"
                    ? { left: 0, width: `${target}%` }
                    : { left: `${target}%`, right: 0 }
                }
              />

              {shown !== undefined ? (
                <span
                  className={cn(
                    "absolute -top-2.5 h-8 w-1 -translate-x-1/2 rounded-full transition-colors",
                    rolling ? "bg-night-text" : won ? "bg-night-green" : "bg-night-red",
                  )}
                  style={{ left: `${shown}%` }}
                />
              ) : null}
            </div>

            <div className="mt-3 flex justify-between text-micro text-night-muted">
              <span className="figure-num">0</span>
              <span className="figure-num">
                {direction === "under" ? "Win below" : "Win above"} {target.toFixed(2)}
              </span>
              <span className="figure-num">100</span>
            </div>
          </div>
        </GameBoard>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          multiplier={multiplier}
          disabled={busy}
          demo={demo}
          summary={
            <dl className="space-y-1.5 border-t border-night-rule pt-4">
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">Win chance</dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">{chance}%</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">Wins when {direction}</dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">{target.toFixed(2)}</dd>
              </div>
            </dl>
          }
          action={
            <PlayButton onClick={rollDice} disabled={busy || stake <= 0n || stake > balance}>
              {busy ? "Rolling…" : "Roll"}
            </PlayButton>
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
                  disabled={busy}
                  className={cn(
                    "tap flex min-h-12 items-center justify-center rounded-[9px] border",
                    "text-[0.9375rem] capitalize transition-all active:translate-y-px",
                    direction === option
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  Roll {option}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label-mono text-night-muted">Win chance</span>
                <span className="figure-num text-small">
                  {chance}% · {formatMultiplier(multiplier)}
                </span>
              </div>

              <Slider.Root
                value={[chance]}
                onValueChange={([next]) => {
                  setChance(next ?? 50);
                  playSound("tick");
                }}
                min={DICE_MIN_CHANCE}
                max={DICE_MAX_CHANCE}
                step={1}
                disabled={busy}
                className="relative mt-3 flex h-7 w-full touch-none items-center select-none"
              >
                <Slider.Track className="relative h-2 w-full grow rounded-full bg-night-sunk">
                  <Slider.Range className="absolute h-full rounded-full bg-[var(--accent)]" />
                </Slider.Track>
                {/* The thumb carries role="slider", so the accessible name must
                    live here — on the Root it names a group nobody focuses. */}
                <Slider.Thumb
                  aria-label="Win chance"
                  className={cn(
                    "block h-7 w-7 rounded-full border-2 border-[var(--accent)] bg-night-raised",
                    "shadow-[0_2px_10px_-2px_var(--accent)] transition-transform",
                    "duration-[var(--duration-fast)] hover:scale-105 active:scale-95",
                  )}
                />
              </Slider.Root>
            </div>
          </div>
        </BetPanel>
      }
    />
  );
}
