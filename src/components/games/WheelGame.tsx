"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { EffectsLayer, type EffectsHandle } from "@/components/games/EffectsLayer";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { Segmented } from "@/components/games/Segmented";
import { frameNow, nowMs } from "@/lib/clock";
import { cn } from "@/lib/cn";
import {
  MULTIPLIER_SCALE,
  WHEEL_RISKS,
  WHEEL_SEGMENTS,
  formatMultiplier,
  payoutFor,
  wheelPayouts,
  wheelRing,
  type WheelRisk,
} from "@/lib/games";
import { demoWheel } from "@/lib/games/demo";
import { useGameBalance } from "@/lib/games/use-balance";
import { easeOutQuint } from "@/lib/motion";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import type { CryptoCode } from "@/lib/money/currencies";
import { formatCrypto } from "@/lib/money/format";
import { PALETTE } from "@/lib/particles";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { playWheelRound, type RoundResult } from "@/server/games/play";

/**
 * The Wheel.
 *
 * It is here for the deceleration. Every other game in this wing resolves at a
 * moment — the coin lands, the curve breaks, the tile turns — and the wheel is
 * the only one that resolves over several seconds of slowing down, where you
 * can see the segment it might just reach and count the ticks to it. That is a
 * different kind of tension from Crash's, and it is the one people will queue
 * for.
 *
 * The spin is a single eased rotation to a known angle. The outcome is fixed by
 * the seeds before the wheel starts turning, exactly as everywhere else, so
 * what the animation does is take four seconds to arrive somewhere it already
 * knows about. The quintic ease-out is doing all the work: most of the rotation
 * happens in the first second, and the last quarter-turn takes almost as long
 * as the rest of the spin put together.
 */

const SPIN_MS = 4200;
/** Full turns before the wheel settles. Enough to lose track of where it began. */
const TURNS = 5;

export function WheelGame({
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
  const [risk, setRisk] = useState<WheelRisk>("medium");
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [result, setResult] = useState<RoundResult | undefined>();
  const [spinning, setSpinning] = useState(false);
  const [settled, setSettled] = useState(false);
  const [pending, start] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsRef = useRef<EffectsHandle | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const angleRef = useRef(0);
  const tickRef = useRef(-1);

  const ring = wheelRing(risk);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // The wheel at rest, and on resize. Without this the board is blank until the
  // first spin, which reads as a failure to load.
  useEffect(() => {
    const paint = () => drawWheel(canvasRef.current, wheelRing(risk), angleRef.current, undefined);
    paint();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [risk]);

  /* ── The spin ────────────────────────────────────────────────────────── */

  function run(outcome: RoundResult, startedAt: number) {
    const segment = (outcome.outcome?.segment as number | undefined) ?? 0;

    // Where the wheel must stop for the pointer at the top to sit on `segment`.
    const step = (Math.PI * 2) / WHEEL_SEGMENTS;
    const target = -(segment * step + step / 2);
    const from = angleRef.current;
    const to = target - Math.PI * 2 * TURNS;

    if (prefersReducedMotion()) {
      angleRef.current = normalise(target);
      drawWheel(canvasRef.current, wheelRing(risk), angleRef.current, segment);
      finish(outcome, segment);
      return;
    }

    setSpinning(true);
    tickRef.current = -1;

    const step2 = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / SPIN_MS);
      const eased = easeOutQuint(progress);
      const angle = from + (to - from) * eased;
      angleRef.current = angle;

      // One tick each time a segment boundary passes the pointer. Because the
      // easing is quintic, these start as a blur and end as separate, countable
      // taps — which is the entire sound design of a wheel.
      const passed = Math.floor(-angle / step);
      if (passed !== tickRef.current) {
        if (tickRef.current >= 0) {
          playSound("bounce", 1 - progress * 0.6);
        }
        tickRef.current = passed;
      }

      drawWheel(canvasRef.current, wheelRing(risk), angle, progress >= 1 ? segment : undefined);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step2);
        return;
      }

      angleRef.current = normalise(angle);
      setSpinning(false);
      finish(outcome, segment);
    };

    frameRef.current = requestAnimationFrame(step2);
  }

  function finish(outcome: RoundResult, segment: number) {
    setSettled(true);
    if (!outcome.ok) return;

    const multiplier = outcome.multiplier ?? 0;
    setHistory((entries) =>
      pushHistory(entries, { id: outcome.roundId ?? String(nowMs()), multiplier }),
    );

    if (multiplier > 0) {
      effectsRef.current?.shake(0.2 + Math.min(0.5, multiplier / 400_000));
      effectsRef.current?.burst({
        x: 0.5,
        y: 0.12,
        count: multiplier >= 50_000 ? 48 : 24,
        colours: multiplier >= 50_000 ? PALETTE.gold : PALETTE.ember,
        speed: 0.9,
        life: 1.1,
        size: 3,
        arc: Math.PI,
        direction: Math.PI / 2,
      });
      celebrate(multiplier);
    } else {
      feedback("lose", 0, 14);
    }

    void segment;
  }

  function spin() {
    unlockSound();
    recordRound();
    playSound("whoosh");
    setSettled(false);
    setResult(undefined);

    if (stake <= 0n || stake > balance) return;

    const startedAt = frameNow();

    if (demo) {
      const outcome = demoWheel(stake, risk);
      setResult(outcome);
      if (!outcome.ok) {
        setSettled(true);
        return;
      }
      run(outcome, startedAt);
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("risk", risk);

    start(async () => {
      const outcome = await playWheelRound(form);
      setResult(outcome);
      if (!outcome.ok) {
        setSettled(true);
        if (outcome.balance) setBalance(BigInt(outcome.balance));
        return;
      }
      if (outcome.balance) setBalance(BigInt(outcome.balance));
      run(outcome, frameNow());
    });
  }

  const busy = pending || spinning;
  const landed = settled && result?.ok ? (result.outcome?.segment as number | undefined) : undefined;
  const won = (result?.multiplier ?? 0) > 0;
  const payouts = wheelPayouts(risk);

  return (
    <GameLayout
      game="wheel"
      board={
        <GameBoard
          game="wheel"
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
            ) : settled && landed !== undefined ? (
              won ? (
                <>
                  It stopped on {formatMultiplier(result?.multiplier ?? 0)} —{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(result?.payout ?? "0"), asset))}
                  </span>
                  .
                </>
              ) : (
                "It stopped on a blank."
              )
            ) : spinning ? (
              "Slowing down…"
            ) : (
              "Pick a ring and spin. Every ring returns the same 99%."
            )
          }
        >
          <EffectsLayer ref={effectsRef} magnitude={10} capacity={340}>
            <div className="relative mx-auto w-full max-w-[30rem]">
              <canvas
                ref={canvasRef}
                className="block aspect-square w-full"
                role="img"
                aria-label={`Wheel of ${WHEEL_SEGMENTS} segments, ${risk} ring`}
              />

              {/* The readout in the hub, where the eye already is. */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p
                    className={cn(
                      "figure-num text-[clamp(1.5rem,5vw,2.25rem)] leading-none font-medium tabular-nums",
                      settled && won
                        ? "text-night-green"
                        : settled
                          ? "text-night-muted"
                          : "text-night-text",
                    )}
                  >
                    {settled && result?.ok
                      ? formatMultiplier(result.multiplier ?? 0)
                      : spinning
                        ? "—"
                        : formatMultiplier(MULTIPLIER_SCALE)}
                  </p>
                  <p className="label-mono mt-2 text-night-muted">{risk} ring</p>
                </div>
              </div>
            </div>
          </EffectsLayer>
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
            <div className="border-t border-night-rule pt-4">
              <p className="label-mono text-night-muted">This ring pays</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {payouts.map((multiplier) => {
                  const count = ring.filter((value) => value === multiplier).length;
                  return (
                    <li
                      key={multiplier}
                      className={cn(
                        "figure-num rounded-[5px] border px-2 py-1 text-micro tabular-nums",
                        multiplier === 0
                          ? "border-night-rule bg-night-sunk text-night-muted"
                          : multiplier >= 50_000
                            ? "border-night-gold/40 bg-night-gold/12 text-night-gold"
                            : "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)]",
                      )}
                    >
                      {multiplier === 0 ? "0×" : formatMultiplier(multiplier)}
                      <span className="ms-1.5 opacity-60">×{count}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-micro text-night-muted">
                Every ring returns the same 99% over time. A higher ring buys
                variance, never value.
              </p>
            </div>
          }
          action={
            <PlayButton onClick={spin} disabled={busy || stake <= 0n || stake > balance}>
              {busy ? "Spinning…" : "Spin"}
              {!busy ? (
                <span className="figure-num ms-2 text-small font-normal opacity-70">
                  {formatCrypto(cryptoAmount(payoutFor(stake, payouts[0] ?? 0), asset))} top
                </span>
              ) : null}
            </PlayButton>
          }
        >
          <Segmented
            name="wheel-risk"
            label="Ring"
            value={risk}
            disabled={busy}
            options={WHEEL_RISKS.map((option) => ({
              value: option,
              label: option === "low" ? "Low" : option === "medium" ? "Medium" : "High",
              hint: `${formatMultiplier(wheelPayouts(option)[0] ?? 0)} top`,
            }))}
            onChange={setRisk}
          />
        </BetPanel>
      }
    />
  );
}

const normalise = (angle: number): number => {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
};

/* ── The wheel ───────────────────────────────────────────────────────────── */

/**
 * Draws the ring at `angle`, with `landed` lit if the spin has finished.
 *
 * Segments are drawn as arc bands rather than pie slices with a hole punched
 * out: at fifty-four segments the difference is invisible and the band is one
 * stroked path each instead of two filled ones, which matters when this is
 * redrawn sixty times a second for four seconds.
 */
function drawWheel(
  canvas: HTMLCanvasElement | null,
  ring: readonly number[],
  angle: number,
  landed: number | undefined,
): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.clientWidth;
  if (size === 0) return;

  if (canvas.width !== Math.round(size * dpr) || canvas.height !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const centre = size / 2;
  const outer = size * 0.47;
  // A thick band: the ring is the game, and a thin one left the hub swallowing
  // the board.
  const band = size * 0.17;
  const radius = outer - band / 2;
  const step = (Math.PI * 2) / ring.length;

  ctx.save();
  ctx.translate(centre, centre);

  // The rim.
  ctx.beginPath();
  ctx.arc(0, 0, outer + 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(140,150,170,0.22)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.rotate(angle);
  ctx.lineWidth = band;

  for (let i = 0; i < ring.length; i += 1) {
    const multiplier = ring[i] ?? 0;
    // Start at the top and run clockwise, so segment 0 is under the pointer at
    // an angle of zero.
    const from = -Math.PI / 2 + i * step;

    ctx.beginPath();
    ctx.arc(0, 0, radius, from + step * 0.06, from + step * 0.94);
    ctx.strokeStyle = colourFor(multiplier, landed === i);
    ctx.stroke();
  }

  ctx.restore();

  // The pointer, outside the rotation so it stays at the top.
  ctx.beginPath();
  ctx.moveTo(centre, centre - outer - 12);
  ctx.lineTo(centre - 9, centre - outer - 26);
  ctx.lineTo(centre + 9, centre - outer - 26);
  ctx.closePath();
  ctx.fillStyle = "#f2f4f8";
  ctx.fill();

  // The hub, so the middle is a dial rather than a hole.
  ctx.beginPath();
  ctx.arc(centre, centre, outer - band - 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(6,8,11,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(140,150,170,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * A colour per payout tier.
 *
 * Three tiers rather than a continuous scale: at a glance a player needs to
 * know "nothing / something / a lot", and fifty-four subtly different oranges
 * would communicate none of that while spinning.
 */
function colourFor(multiplier: number, lit: boolean): string {
  if (lit) return "#ffffff";
  if (multiplier <= 0) return "#1b1f28";
  if (multiplier >= 50_000) return "#ffc94a";
  if (multiplier >= 20_000) return "#ffb340";
  return "#8a5f2a";
}
