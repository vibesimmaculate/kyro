"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { PLINKO_MULTIPLIERS, PLINKO_ROWS, formatMultiplier } from "@/lib/games";
import { demoPlinko } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { playPlinkoRound, type RoundResult } from "@/server/games/play";

/**
 * Plinko.
 *
 * The ball is drawn on a canvas and falls with gravity, squashing on each peg
 * and deflecting off it. The path is not simulated, though — it is *steered*.
 * The seed decides left or right on every row before the ball is released, and
 * the animation walks that decision. Free physics would be prettier in theory
 * and unprovable in practice; this way the drop you watch is the drop the
 * commitment hash already promised.
 *
 * The fall takes about a second and a half. That wait is the game: an instant
 * result is just a number appearing, and nobody wants to watch a number appear.
 */

const ROW_MS = 105;

interface Ball {
  x: number;
  y: number;
  vy: number;
  row: number;
  squash: number;
}

interface PegHit {
  row: number;
  col: number;
  at: number;
}

export function PlinkoGame({
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
  const [result, setResult] = useState<RoundResult | undefined>();
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [dropping, setDropping] = useState(false);
  const [landedBucket, setLandedBucket] = useState<number | undefined>();
  const [pending, start] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const ballRef = useRef<Ball | undefined>(undefined);
  const hitsRef = useRef<PegHit[]>([]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  /** Peg positions in normalised 0–1 space, so the canvas can be any size. */
  function pegPosition(row: number, col: number): { x: number; y: number } {
    const spread = (col - row / 2) / (PLINKO_ROWS / 2);
    return { x: 0.5 + spread * 0.47, y: 0.05 + ((row + 1) / (PLINKO_ROWS + 1)) * 0.92 };
  }

  function draw(now: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // ── Pegs ────────────────────────────────────────────────────────────
    for (let row = 0; row < PLINKO_ROWS; row += 1) {
      for (let col = 0; col <= row; col += 1) {
        const { x, y } = pegPosition(row, col);
        const hit = hitsRef.current.find((h) => h.row === row && h.col === col);
        // A struck peg flares briefly, so the path stays legible after the
        // fact rather than only while it is happening.
        const age = hit ? (now - hit.at) / 280 : 1;
        const lit = age < 1;

        ctx.beginPath();
        ctx.arc(x * width, y * height, lit ? 5 - age * 2 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = lit ? `rgba(169,123,255,${1 - age})` : "rgba(140,150,170,0.4)";
        ctx.fill();
      }
    }

    // ── Ball ────────────────────────────────────────────────────────────
    const ball = ballRef.current;
    if (ball) {
      const px = ball.x * width;
      const py = ball.y * height;
      const squash = 1 + ball.squash * 0.45;

      for (let i = 3; i > 0; i -= 1) {
        ctx.beginPath();
        ctx.arc(px, py - i * 7, 7 - i * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(169,123,255,${0.09 * (4 - i)})`;
        ctx.fill();
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1 / squash, squash);
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
      gradient.addColorStop(0, "#e9dcff");
      gradient.addColorStop(1, "#a97bff");
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    }
  }

  function release(path: readonly ("L" | "R")[], onDone: () => void) {
    hitsRef.current = [];

    const reduced = prefersReducedMotion();
    if (reduced) {
      // No animation at all: the result is simply stated.
      onDone();
      return;
    }

    ballRef.current = { x: 0.5, y: 0.02, vy: 0, row: 0, squash: 0 };
    setDropping(true);

    let last = performance.now();
    let rowStartedAt = last;
    let col = 0;

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;

      const ball = ballRef.current;
      if (!ball) return;

      if (ball.row < PLINKO_ROWS) {
        const from = ball.row === 0 ? { x: 0.5, y: 0.02 } : pegPosition(ball.row - 1, col);
        const nextCol = (path[ball.row] ?? "L") === "R" ? col + 1 : col;
        const to = pegPosition(ball.row, nextCol);

        const progress = Math.min(1, (now - rowStartedAt) / ROW_MS);
        // Horizontal travel eases out; vertical accelerates, so it reads as
        // falling rather than sliding along a wire.
        ball.x = from.x + (to.x - from.x) * (1 - Math.pow(1 - progress, 2));
        ball.y = from.y + (to.y - from.y) * (progress * progress * 0.7 + progress * 0.3);
        ball.squash = Math.max(0, 1 - Math.abs(progress - 1) * 6);

        if (progress >= 1) {
          hitsRef.current.push({ row: ball.row, col: nextCol, at: now });
          playSound("bounce", ball.row / PLINKO_ROWS);
          col = nextCol;
          ball.row += 1;
          rowStartedAt = now;
          ball.squash = 1;
        }
      } else {
        // Past the last peg: fall freely into the bucket.
        ball.vy += dt * 1.6;
        ball.y += ball.vy * dt * 3;
        ball.squash = Math.max(0, ball.squash - dt * 4);

        if (ball.y >= 0.97) {
          ballRef.current = undefined;
          draw(now);
          setDropping(false);
          onDone();
          return;
        }
      }

      draw(now);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  }

  function land(outcome: RoundResult) {
    if (!outcome.ok) return;
    const bucket = outcome.outcome?.bucket as number;
    const multiplier = outcome.multiplier ?? 0;

    setLandedBucket(bucket);
    setHistory((h) => pushHistory(h, { id: outcome.roundId ?? String(Date.now()), multiplier }));

    // Above 1.00× is a profit and gets the celebration. Anything at or below
    // it returned no more than the stake, whatever it paid out.
    if (multiplier > 10_000) {
      celebrate(multiplier);
    } else {
      feedback("land", 0, 12);
      playSound("lose");
    }
  }

  function begin(outcome: RoundResult) {
    setResult(outcome);
    setLandedBucket(undefined);
    if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    if (!outcome.ok) return;

    release((outcome.outcome?.path as ("L" | "R")[]) ?? [], () => land(outcome));
  }

  function dropBall() {
    unlockSound();
    playSound("drop");

    if (demo) {
      begin(demoPlinko(stake));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    start(async () => {
      begin(await playPlinkoRound(form));
    });
  }

  const busy = pending || dropping;

  return (
    <GameLayout
      game="plinko"
      board={
        <GameBoard
          game="plinko"
          history={history}
          win={
            landedBucket !== undefined && result?.ok
              ? {
                  multiplier: result.multiplier,
                  payout: BigInt(result.payout ?? "0"),
                  asset,
                  roundKey: result.roundId,
                }
              : undefined
          }
          status={
            result && !result.ok ? (
              <span className="text-night-amber">{result.error}</span>
            ) : landedBucket !== undefined && result?.ok ? (
              <>
                Bucket {landedBucket + 1} of 13 —{" "}
                {formatMultiplier(PLINKO_MULTIPLIERS[landedBucket] ?? 0)}, paying{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(BigInt(result.payout ?? "0"), asset))}
                </span>
                .
              </>
            ) : dropping ? (
              "Falling…"
            ) : (
              "Drop a ball. The middle is likely and cheap; the edges are rare and not."
            )
          }
        >
          <canvas
            ref={canvasRef}
            className="block aspect-[5/4] w-full"
            role="img"
            aria-label="Plinko board"
          />

          <ol
            className="mt-2 grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${PLINKO_ROWS + 1}, minmax(0, 1fr))` }}
          >
            {PLINKO_MULTIPLIERS.map((multiplier, index) => {
              const landed = landedBucket === index;
              const rich = multiplier >= 30_000;
              return (
                <li
                  key={index}
                  className={cn(
                    "rounded-[4px] border py-1.5 text-center transition-all duration-[var(--duration-base)]",
                    landed
                      ? "glow-accent -translate-y-1 border-[var(--accent)] bg-[var(--accent)]/30 text-night-text"
                      : rich
                        ? "border-night-gold/35 bg-night-gold/10 text-night-gold"
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
        </GameBoard>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          disabled={busy}
          demo={demo}
          summary={
            <p className="border-t border-night-rule pt-4 text-micro text-night-muted">
              The centre bucket comes up about 23 times in 100; each edge about once in
              4 096. The multipliers are computed from exactly those odds.
            </p>
          }
          action={
            <PlayButton onClick={dropBall} disabled={busy || stake <= 0n || stake > balance}>
              {busy ? "Falling…" : "Drop"}
            </PlayButton>
          }
        />
      }
    />
  );
}
