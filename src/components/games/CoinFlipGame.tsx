"use client";

import { useState, useTransition } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { COIN_FLIP_MULTIPLIER, type CoinSide } from "@/lib/games";
import { demoCoinFlip } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { useGameBalance } from "@/lib/games/use-balance";
import { playCoinFlipRound, type RoundResult } from "@/server/games/play";

/**
 * Coin Flip.
 *
 * The coin actually turns — five full rotations on the Y axis, rising and
 * falling as it goes, decelerating into the landing. The result exists the
 * moment the stake is taken; the spin is there because a coin that resolves
 * instantly is not a coin flip, it is a database read.
 *
 * Nine hundred milliseconds: long enough to be a moment, short enough to do
 * fifty times.
 */

const SPIN_MS = 900;

export function CoinFlipGame({
  asset,
  balance: initialBalance,
  demo,
}: {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  readonly demo?: boolean;
}) {
  const [balance, setBalance] = useGameBalance(initialBalance, demo);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n);
  const [pick, setPick] = useState<CoinSide>("heads");
  const [result, setResult] = useState<RoundResult | undefined>();
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [settled, setSettled] = useState(false);
  const [pending, start] = useTransition();

  function land(outcome: RoundResult) {
    setSettled(true);
    setSpinning(false);
    if (!outcome.ok) return;

    const multiplier = outcome.multiplier ?? 0;
    setHistory((h) =>
      pushHistory(h, { id: outcome.roundId ?? String(Date.now()), multiplier }),
    );

    // Won or lost, and nothing in between: a losing round is never dressed up.
    if (BigInt(outcome.payout ?? "0") > 0n) celebrate(multiplier);
    else feedback("lose", 0, 18);
  }

  function spin(outcome: RoundResult) {
    setResult(outcome);
    if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    if (!outcome.ok) {
      setSettled(true);
      setSpinning(false);
      return;
    }

    const reduced = prefersReducedMotion();
    if (reduced) {
      land(outcome);
      return;
    }

    setSpinning(true);
    playSound("whoosh");
    window.setTimeout(() => land(outcome), SPIN_MS);
  }

  function flip() {
    unlockSound();
    recordRound();
    playSound("tick");
    setSettled(false);
    setResult(undefined);

    if (demo) {
      spin(demoCoinFlip(stake, pick));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("pick", pick);
    start(async () => {
      spin(await playCoinFlipRound(form));
    });
  }

  const landed = settled && result?.ok ? (result.outcome?.landed as CoinSide | undefined) : undefined;
  const won = settled && result?.ok ? result.outcome?.won === true : false;
  const busy = pending || spinning;

  // Mid-spin the coin shows the side it will land on, so the last half-turn
  // reads as the coin settling rather than as a value swapping in.
  const face = landed ?? (spinning ? pick : undefined);

  return (
    <GameLayout
      game="coin-flip"
      board={
        <GameBoard
          game="coin-flip"
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
            ) : settled && landed ? (
              won ? (
                <>
                  You called {pick} and it landed {landed} —{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                  </span>
                  .
                </>
              ) : (
                <>
                  You called {pick}. It landed {landed}.
                </>
              )
            ) : spinning ? (
              "In the air…"
            ) : (
              "Call a side, set your stake, and flip."
            )
          }
        >
          <div className="flex min-h-[19rem] items-center justify-center py-6 [perspective:900px]">
            <div
              key={result?.roundId ?? "idle"}
              className={cn(
                "relative flex h-40 w-40 items-center justify-center rounded-full border-[3px]",
                "[transform-style:preserve-3d] transition-colors duration-[var(--duration-slow)]",
                !settled
                  ? "border-night-rule-strong bg-night-lifted text-night-muted"
                  : won
                    ? "glow-win border-night-green bg-night-green/15 text-night-green"
                    : "glow-lose border-night-red bg-night-red/12 text-night-red",
              )}
              style={
                spinning
                  ? { animation: `kyro-coin-spin ${SPIN_MS}ms cubic-bezier(0.2,0.7,0.3,1)` }
                  : settled
                    ? { animation: "kyro-pop var(--duration-slow) var(--ease-out-quiet)" }
                    : undefined
              }
            >
              {/* A rim, so the disc has thickness rather than being a circle. */}
              <span
                aria-hidden="true"
                className="absolute inset-[7px] rounded-full border border-current opacity-30"
              />
              <span className="label-mono text-[0.8125rem] tracking-[0.2em]">
                {face ? face.toUpperCase() : "—"}
              </span>
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
          multiplier={COIN_FLIP_MULTIPLIER}
          disabled={busy}
          demo={demo}
          summary={
            <p className="border-t border-night-rule pt-4 text-micro text-night-muted">
              A fair coin would pay 2.00×. KYRO pays 1.98× — the stated 1% edge, and the
              whole of it.
            </p>
          }
          action={
            <PlayButton onClick={flip} disabled={busy || stake <= 0n || stake > balance}>
              {busy ? "Flipping…" : "Flip"}
            </PlayButton>
          }
        >
          <fieldset>
            <legend className="label-mono text-night-muted">Your call</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["heads", "tails"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    setPick(side);
                    unlockSound();
                    playSound("select");
                  }}
                  aria-pressed={pick === side}
                  disabled={busy}
                  className={cn(
                    "tap flex min-h-12 items-center justify-center rounded-[9px] border",
                    "text-[0.9375rem] capitalize transition-all active:translate-y-px",
                    pick === side
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
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
