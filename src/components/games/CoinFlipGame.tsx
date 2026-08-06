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
 * The coin actually turns: six full rotations end over end, rising and falling
 * through the toss, decelerating into the landing. Both faces exist in the DOM
 * throughout, back to back, so the far side genuinely passes on every rotation
 * rather than a label swapping at the halfway point.
 *
 * The result exists the moment the stake is taken. The toss is there because a
 * coin flip that resolves instantly is not a coin flip, it is a database read.
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

  // Both faces are always drawn, so all the toss needs to know is which one
  // has to be looking at you when it stops. Before the result exists that is
  // the side you called, which is also the one the idle coin shows.
  const landsOn: CoinSide = landed ?? pick;

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
          <div className="flex min-h-[21rem] items-center justify-center py-8 [perspective:1100px]">
            <div
              key={result?.roundId ?? "idle"}
              className="relative h-44 w-44 [transform-style:preserve-3d] motion-reduce:!animate-none"
              style={
                spinning
                  ? {
                      // The half-turn that decides which face ends up looking
                      // at you. Same keyframes either way.
                      ["--land" as string]: landsOn === "tails" ? "180deg" : "0deg",
                      animation: `kyro-coin-toss ${SPIN_MS}ms cubic-bezier(0.16,0.72,0.24,1) forwards`,
                    }
                  : {
                      transform:
                        landsOn === "tails" ? "rotateX(180deg)" : "rotateX(0deg)",
                      animation: settled
                        ? undefined
                        : "kyro-coin-idle 6s ease-in-out infinite",
                    }
              }
            >
              <CoinFace side="heads" tone={settled ? (won ? "win" : "lose") : "idle"} />
              <CoinFace side="tails" tone={settled ? (won ? "win" : "lose") : "idle"} />
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

/**
 * One face of the coin.
 *
 * Both faces exist in the DOM at all times, back to back, with the tails face
 * turned a half-turn on X and `backface-visibility` hiding whichever is facing
 * away. That is what makes the flip a flip rather than a spinning card that
 * swaps its label at the halfway point — you see the far side pass, which is
 * the whole reason a coin toss is watchable.
 *
 * The metal is three layers: a conic gradient for the brushed circumference, a
 * radial one for the dome, and an inset ring for the milled edge. On the paper
 * side of this product that would be three gradients too many; in the games
 * register a coin is a material, and a flat disc with a word on it was reading
 * as a placeholder.
 */
function CoinFace({
  side,
  tone,
}: {
  readonly side: CoinSide;
  readonly tone: "idle" | "win" | "lose";
}) {
  const gold = side === "heads";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0 grid place-items-center rounded-full [backface-visibility:hidden]",
        side === "tails" && "[transform:rotateX(180deg)]",
      )}
      style={{
        background: gold
          ? "conic-gradient(from 210deg, #7a5a1c, #f2d488, #b98c2a, #ffeab8, #8a641f, #e8c876, #7a5a1c)"
          : "conic-gradient(from 210deg, #3a4250, #aeb8c6, #58616f, #dfe6ef, #454e5c, #9aa4b2, #3a4250)",
        // The result glow is composed into this rather than applied as a
        // class: a `glow-*` utility sets box-shadow, and so does the metal, so
        // whichever lost the cascade simply vanished.
        boxShadow: [
          gold
            ? "inset 0 0 0 6px rgba(255,235,180,0.16)"
            : "inset 0 0 0 6px rgba(226,236,248,0.14)",
          "inset 0 6px 18px rgba(0,0,0,0.5)",
          "0 18px 40px -18px rgba(0,0,0,0.9)",
          tone === "win"
            ? "0 0 0 3px var(--color-night-green), 0 0 46px -4px var(--color-night-green)"
            : tone === "lose"
              ? "0 0 0 3px var(--color-night-red), 0 0 38px -6px var(--color-night-red)"
              : "0 0 0 1px rgba(255,255,255,0.06)",
        ].join(", "),
      }}
    >
      {/* The dome: a highlight up and to the left, which is the only cue that
          says "this is a solid object" rather than "this is a filled circle". */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0.06) 42%, rgba(0,0,0,0.34) 78%)",
        }}
      />

      {/* The milled edge. */}
      <span
        className="absolute inset-[9px] rounded-full border"
        style={{ borderColor: gold ? "rgba(60,42,10,0.5)" : "rgba(20,26,34,0.5)" }}
      />

      <span className="relative grid place-items-center gap-3.5">
        {gold ? (
          <span
            className="block h-7 w-7 rotate-45 rounded-[3px]"
            style={{ background: "#2c1f06", boxShadow: "inset 0 2px 4px rgba(255,240,200,0.35)" }}
          />
        ) : (
          <span
            className="block h-7 w-7 rounded-full border-[5px]"
            style={{ borderColor: "#161b23", boxShadow: "inset 0 2px 4px rgba(230,240,255,0.3)" }}
          />
        )}
        <span
          className="label-mono text-[0.6875rem] tracking-[0.22em]"
          style={{ color: gold ? "#3a2a08" : "#171c24" }}
        >
          {side === "heads" ? "HEADS" : "TAILS"}
        </span>
      </span>
    </div>
  );
}
