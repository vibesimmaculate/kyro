"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { MULTIPLIER_SCALE, formatMultiplier } from "@/lib/games";
import { demoCrash } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { playCrashRound, type RoundResult } from "@/server/games/play";

/**
 * Crash.
 *
 * The outcome is settled the instant the stake is taken — this is a curve
 * replaying a decided result, not a live race, and the copy says so rather than
 * implying you are competing with anyone.
 *
 * What the animation buys is legibility and nerve. Watching the number climb
 * towards your target, and seeing how far past it the curve went, is a far
 * clearer account of the round than being handed the final figure. The curve is
 * drawn on canvas at frame rate with a filled gradient beneath it, the head of
 * the line glows, and a bust shakes the board.
 */

/** Long enough to build tension, short enough to play repeatedly. */
const BASE_MS = 2600;

export function CrashGame({
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
  const [target, setTarget] = useState("2.00");
  const [result, setResult] = useState<RoundResult | undefined>();
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [displayed, setDisplayed] = useState(MULTIPLIER_SCALE);
  const [running, setRunning] = useState(false);
  const [busted, setBusted] = useState(false);
  const [settled, setSettled] = useState(false);
  const [pending, start] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const targetScaled = Math.round(Number(target || "1") * MULTIPLIER_SCALE);
  const crashAt = result?.ok ? (result.outcome?.crashPoint as number | undefined) : undefined;
  const survived = result?.ok ? result.outcome?.survived === true : false;

  /**
   * Draws the curve up to `progress` of the way to `peak`.
   *
   * The vertical scale is fixed to the round's own peak, so a 1.2× round and a
   * 40× round both fill the frame — otherwise small rounds would be a flat line
   * along the bottom and unreadable.
   */
  function draw(progress: number, peak: number, broke: boolean, live = true) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = 10;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    ctx.strokeStyle = "rgba(140,150,170,0.1)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const y = pad + (innerH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    // The player's auto cash-out, as a place on the chart. Drawn only while
    // the round runs: once it has settled the line sits exactly on the head of
    // the curve and says nothing the figure below does not already say.
    const span = Math.max(1, peak - MULTIPLIER_SCALE);
    const targetFrac = (targetScaled - MULTIPLIER_SCALE) / span;
    if (live && targetFrac > 0 && targetFrac < 0.999) {
      const y = pad + innerH * (1 - Math.pow(targetFrac, 1 / 1.75));
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(91,135,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
      ctx.restore();
    }

    const colour = broke ? "#ff5c5c" : "#2fd48b";
    const points: Array<[number, number]> = [];
    const steps = 72;
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * progress;
      points.push([pad + innerW * t, pad + innerH * (1 - Math.pow(t, 1.75))]);
    }

    const first = points[0];
    const head = points[points.length - 1];
    if (!first || !head || points.length < 2) return;

    const gradient = ctx.createLinearGradient(0, pad, 0, h - pad);
    gradient.addColorStop(0, broke ? "rgba(255,92,92,0.3)" : "rgba(47,212,139,0.3)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    ctx.moveTo(first[0], h - pad);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(head[0], h - pad);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = colour;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(head[0], head[1], 11, 0, Math.PI * 2);
    ctx.fillStyle = broke ? "rgba(255,92,92,0.22)" : "rgba(47,212,139,0.22)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(head[0], head[1], 5, 0, Math.PI * 2);
    ctx.fillStyle = broke ? "#ff8a8a" : "#7cf0be";
    ctx.fill();
  }

  function animate(finalValue: number, broke: boolean, onSettled: () => void) {
    const reduced = prefersReducedMotion();
    if (reduced) {
      setDisplayed(finalValue);
      draw(1, finalValue, broke, false);
      setRunning(false);
      onSettled();
      return;
    }

    // Higher multipliers run a little longer, so a 40× round feels like a climb
    // rather than the same 2.6 seconds with bigger numbers on it.
    const multiple = finalValue / MULTIPLIER_SCALE;
    const duration = BASE_MS * Math.min(2, 0.7 + Math.log10(Math.max(1.1, multiple)) * 0.9);

    let lastTone = 0;
    const startedAt = performance.now();
    setRunning(true);

    const step = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / duration);
      // Eases out, so the last stretch before the break is the slow one —
      // exactly where the decision would have lived.
      const eased = 1 - Math.pow(1 - progress, 2.2);

      setDisplayed(MULTIPLIER_SCALE + (finalValue - MULTIPLIER_SCALE) * eased);
      draw(eased, finalValue, false);

      if (elapsed - lastTone > 80) {
        lastTone = elapsed;
        playSound("climb", progress);
      }

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayed(finalValue);
        draw(1, finalValue, broke, false);
        setRunning(false);
        onSettled();
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }

  function settle(outcome: RoundResult) {
    if (!outcome.ok) return;

    setSettled(true);
    setHistory((h) =>
      pushHistory(h, {
        id: outcome.roundId ?? String(Date.now()),
        multiplier: (outcome.outcome?.crashPoint as number) ?? 0,
      }),
    );

    if (outcome.outcome?.survived) {
      celebrate(outcome.multiplier ?? 0);
    } else {
      setBusted(true);
      feedback("break", 0, [45, 30, 70]);
      window.setTimeout(() => setBusted(false), 700);
    }
  }

  function run(outcome: RoundResult) {
    setResult(outcome);
    setSettled(false);
    if (outcome.ok && outcome.balance) setBalance(BigInt(outcome.balance));
    if (!outcome.ok) return;

    const point = (outcome.outcome?.crashPoint as number) ?? MULTIPLIER_SCALE;
    const stopAt = outcome.outcome?.survived ? targetScaled : point;
    animate(stopAt, outcome.outcome?.survived !== true, () => settle(outcome));
  }

  function placeBet() {
    unlockSound();
    playSound("tick");
    setResult(undefined);
    setSettled(false);
    setDisplayed(MULTIPLIER_SCALE);
    draw(0, targetScaled, false);

    if (demo) {
      run(demoCrash(stake, targetScaled));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("target", target);
    start(async () => {
      run(await playCrashRound(form));
    });
  }

  const busy = pending || running;
  const shown = Math.round(displayed);

  return (
    <GameLayout
      game="crash"
      board={
        <GameBoard
          game="crash"
          history={history}
          shake={busted}
          win={
            settled && survived && result?.ok
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
            ) : settled && crashAt ? (
              survived ? (
                <>
                  Out at {Number(target).toFixed(2)}× before it broke at{" "}
                  {formatMultiplier(crashAt)} —{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                  </span>
                  .
                </>
              ) : (
                <>Broke at {formatMultiplier(crashAt)}, before your {Number(target).toFixed(2)}×.</>
              )
            ) : running ? (
              "Climbing…"
            ) : (
              "Set a target and bet. The result is fixed the moment you do — the curve replays it."
            )
          }
        >
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="block aspect-[16/10] w-full"
              role="img"
              aria-label="Crash curve"
            />

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p
                className={cn(
                  "figure-num text-[clamp(2.75rem,11vw,4.5rem)] leading-none tabular-nums transition-colors",
                  !result
                    ? "text-night-muted"
                    : settled && !survived
                      ? "text-night-red"
                      : "text-night-green",
                )}
              >
                {(shown / MULTIPLIER_SCALE).toFixed(2)}×
              </p>
              {settled && !survived ? (
                <p className="label-mono mt-1 text-night-red">Broke</p>
              ) : null}
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
          multiplier={targetScaled}
          disabled={busy}
          demo={demo}
          summary={
            <p className="border-t border-night-rule pt-4 text-micro text-night-muted">
              One round in a hundred breaks instantly at 1.00×. Every target returns the
              same 99% over time — no multiplier is a better bet than another.
            </p>
          }
          action={
            <PlayButton onClick={placeBet} disabled={busy || stake <= 0n || stake > balance}>
              {busy ? "Running…" : "Bet"}
            </PlayButton>
          }
        >
          <div>
            <label htmlFor="target" className="label-mono block text-night-muted">
              Cash out at
            </label>
            <p className="mt-1.5 text-small text-night-muted">
              KYRO takes you out automatically here — no reflexes, and no advantage to
              anyone with a faster connection.
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
                disabled={busy}
                className={cn(
                  "figure-num min-h-12 min-w-0 flex-1 rounded-[9px] border border-night-rule-strong",
                  "bg-night-sunk px-3 text-[1.125rem] text-night-text outline-none transition-colors",
                  "focus:border-[var(--accent)] disabled:opacity-50",
                )}
              />
              <span className="label-mono flex flex-none items-center rounded-[9px] border border-night-rule bg-night-sunk px-3 text-night-muted">
                ×
              </span>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {["1.50", "2.00", "5.00", "10.00"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setTarget(preset);
                    unlockSound();
                    playSound("select");
                  }}
                  disabled={busy}
                  className={cn(
                    "tap rounded-[7px] border text-small transition-colors active:translate-y-px",
                    target === preset
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {Number(preset).toFixed(preset === "10.00" ? 0 : 1)}×
                </button>
              ))}
            </div>
          </div>
        </BetPanel>
      }
    />
  );
}
