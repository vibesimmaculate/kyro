"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { EffectsLayer, type EffectsHandle } from "@/components/games/EffectsLayer";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { Segmented } from "@/components/games/Segmented";
import { cn } from "@/lib/cn";
import {
  MULTIPLIER_SCALE,
  PLINKO_RISK,
  PLINKO_RISKS,
  PLINKO_ROW_OPTIONS,
  PLINKO_ROWS,
  formatMultiplier,
  plinkoMultipliers,
  plinkoProbability,
  type PlinkoRisk,
  type PlinkoRows,
} from "@/lib/games";
import { creditDemoPayout, demoPlinko } from "@/lib/games/demo";
import { HitStop, hitStopFor } from "@/lib/motion";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import type { CryptoCode } from "@/lib/money/currencies";
import { formatCrypto } from "@/lib/money/format";
import { PALETTE } from "@/lib/particles";
import {
  buildPegs,
  bucketCentre,
  createBall,
  geometryFor,
  landingY,
  pegAt,
  reaim,
  stepBall,
  type Ball,
  type BoardGeometry,
  type Peg,
} from "@/lib/physics/plinko-board";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { playPlinkoRound, type RoundResult } from "@/server/games/play";

/**
 * Plinko.
 *
 * The board is a real simulation. Gravity, restitution, tangential friction and
 * spin, integrated semi-implicitly and sub-stepped so nothing tunnels through a
 * pin. Every bounce you watch is solved, not played back — the ball genuinely
 * strikes the pin, genuinely deflects by the impulse formula, genuinely carries
 * the spin it picked up into the next row.
 *
 * The destination is still committed before release: the seed decides left or
 * right at every row, and a weak steering force biases the ball towards the side
 * it already chose. The reasoning is written out in `lib/physics/plinko-board`.
 * The short version is that free physics would be unprovable and a canned path
 * would look it, so the motion is physical and the outcome is fixed.
 *
 * Balls are independent. Dropping five at once is five separate rounds with five
 * separate nonces, resolving on their own schedule — not one round drawn five
 * times. That is the only version of multi-ball that keeps the fairness claim
 * honest, and it is also the more fun one, because the board fills up.
 */

const BALL_COUNTS = [1, 3, 5] as const;
type BallCount = (typeof BALL_COUNTS)[number];

/** Distinct enough to follow one ball among five, close enough to stay on-brand. */
const TINTS = ["#c9a6ff", "#a97bff", "#8f6bff", "#dcc7ff", "#7f5bf0"] as const;

/** Pins ring often; without a floor on the gap they become a buzz. */
const BOUNCE_SOUND_GAP_MS = 24;

/** How long a landed ball stays visible in its slot. */
const RESTING_MS = 900;

interface Live {
  readonly ball: Ball;
  readonly result: RoundResult;
  /** Recent positions as flat x,y pairs, newest last. */
  readonly trail: number[];
}

interface Outcome {
  readonly path: readonly ("L" | "R")[];
  readonly bucket: number;
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
  const [rows, setRows] = useState<PlinkoRows>(PLINKO_ROWS);
  const [risk, setRisk] = useState<PlinkoRisk>(PLINKO_RISK);
  const [count, setCount] = useState<BallCount>(1);
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [flying, setFlying] = useState(0);
  const [last, setLast] = useState<{ bucket: number; multiplier: number; payout: bigint } | undefined>();
  /** Bucket index → how many times it has been hit, to retrigger its animation. */
  const [pulses, setPulses] = useState<Record<number, number>>({});

  const multipliers = useMemo(() => plinkoMultipliers(rows, risk), [rows, risk]);
  const geometry = useMemo(() => geometryFor(rows), [rows]);
  const pegs = useMemo(() => buildPegs(geometry), [geometry]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsRef = useRef<EffectsHandle | null>(null);
  const liveRef = useRef<Live[]>([]);
  /** Landed balls, still drawn while they settle into the slot. */
  const restingRef = useRef<{ ball: Ball; until: number }[]>([]);
  const boardRef = useRef<{ geometry: BoardGeometry; pegs: readonly Peg[] }>({ geometry, pegs });
  const multipliersRef = useRef<readonly number[]>(multipliers);
  const flaresRef = useRef<Map<number, number>>(new Map());
  const frameRef = useRef<number | undefined>(undefined);
  const clockRef = useRef(0);
  const hitStopRef = useRef(new HitStop());
  const bounceAtRef = useRef(0);
  const pendingRef = useRef(0);
  const tintRef = useRef(0);

  /**
   * Balance bookkeeping, which is fiddlier than it looks with five rounds in
   * the air at once.
   *
   * Both back-ends settle a round the instant it is placed — stake out, payout
   * in — but the ball then spends three seconds falling. Showing the payout
   * straight away would give the answer away before the board does, so the
   * panel shows the authoritative figure minus the payouts it has not revealed
   * yet, and reveals each one as its ball lands.
   *
   * Demo withholds its payouts at source (`demoPlinko` defers them), so there
   * is nothing to subtract there — which is what keeps this readout and the
   * demo banner, reading the same store, from ever disagreeing.
   */
  const authoritativeRef = useRef(initialBalance);
  const withheldRef = useRef(0n);
  const nonceRef = useRef(-1);

  // The render loop reads the board from a ref, so changing rows mid-session
  // can never leave a running simulation pointing at the previous geometry.
  // Redrawing here is what puts pins on an idle board: the loop only runs while
  // something is falling, so at rest nothing else would ever paint.
  useEffect(() => {
    boardRef.current = { geometry, pegs };
    multipliersRef.current = multipliers;
    draw();

    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [geometry, pegs, multipliers]);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  /* ── Drawing ─────────────────────────────────────────────────────────── */

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { geometry: geo, pegs: pins } = boardRef.current;
    // The canvas is square, so one normalised unit is the same distance on both
    // axes and a peg is a circle rather than an ellipse. That is not cosmetic:
    // the collision solver assumes an isotropic space.
    const scale = Math.min(width, height);
    const flares = flaresRef.current;

    // ── Lanes ─────────────────────────────────────────────────────────
    // The drop zone under the last pin row, divided into the buckets. It fills
    // what was dead canvas, and more usefully it makes the landing legible:
    // the ball is seen to enter a slot rather than to stop somewhere near a
    // number printed underneath.
    const lastPinY = pegAt(geo.rows - 1, 0, geo).y;
    const laneTop = (lastPinY + geo.pegRadius * 2.5) * height;
    // Past the landing line by a ball, so a resting ball sits *in* its slot
    // rather than appearing to have fallen out of the bottom of it.
    const laneBottom = (landingY(geo) + geo.ballRadius * 1.7) * height;
    const laneWidth = ((2 * geo.spread) / geo.rows) * width;
    const table = multipliersRef.current;

    for (let bucket = 0; bucket <= geo.rows; bucket += 1) {
      const centre = bucketCentre(bucket, geo.rows, geo) * width;
      const multiplier = table[bucket] ?? 0;
      const rich = multiplier >= 30_000;
      const profit = multiplier > MULTIPLIER_SCALE;

      const gradient = ctx.createLinearGradient(0, laneTop, 0, laneBottom);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(
        1,
        rich ? "rgba(255,201,74,0.16)" : profit ? "rgba(169,123,255,0.13)" : "rgba(255,255,255,0.04)",
      );
      ctx.fillStyle = gradient;
      ctx.fillRect(centre - laneWidth / 2 + 0.5, laneTop, laneWidth - 1, laneBottom - laneTop);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let edge = 0; edge <= geo.rows + 1; edge += 1) {
      const x = bucketCentre(edge, geo.rows, geo) * width - laneWidth / 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, laneTop);
      ctx.lineTo(Math.round(x) + 0.5, laneBottom);
      ctx.stroke();
    }

    // ── Pins ──────────────────────────────────────────────────────────
    const pinRadius = geo.pegRadius * scale;
    for (let i = 0; i < pins.length; i += 1) {
      const peg = pins[i];
      if (!peg) continue;
      const x = peg.x * width;
      const y = peg.y * height;
      const flare = flares.get(i) ?? 0;

      if (flare > 0.02) {
        // Additive, and only a little wider than the pin. A generous halo here
        // is indistinguishable from a ball at a glance, and a board where you
        // cannot tell the pins from the balls is worse than one with no flare
        // at all.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(x, y, pinRadius * (1.15 + flare * 0.75), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150,102,240,${flare * 0.55})`;
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(x, y, pinRadius * (1 + flare * 0.22), 0, Math.PI * 2);
      ctx.fillStyle = flare > 0.02 ? mix("#98a0b2", "#c9b0ff", flare) : "#98a0b2";
      ctx.fill();

      // A highlight on the upper-left of each pin. Cheap, and it is the whole
      // difference between a field of flat dots and something machined.
      ctx.beginPath();
      ctx.arc(x - pinRadius * 0.3, y - pinRadius * 0.32, pinRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fill();
    }

    // ── Balls ─────────────────────────────────────────────────────────
    const ballRadius = geo.ballRadius * scale;

    // Landed balls linger a moment in their slot. Deleting one the instant it
    // arrives means the ball is gone before the eye has followed it down, and
    // the player is left reading the answer off a status line instead of
    // seeing it.
    const now = performance.now();
    for (const settled of restingRef.current) {
      const remaining = Math.max(0, (settled.until - now) / RESTING_MS);
      ctx.save();
      ctx.globalAlpha = Math.min(1, remaining * 1.6);
      drawBall(ctx, settled.ball, width, height, ballRadius);
      ctx.restore();
    }

    for (const live of liveRef.current) {
      const { ball, trail } = live;

      // The trail is a stroke that tapers into the past, not a row of discs.
      // Discs pile up into a halo that reads as a glow around a stationary
      // ball; a tapering streak reads as speed, which is the thing being
      // communicated. Additively blended so overlaps brighten rather than
      // muddy.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 2; i < trail.length; i += 2) {
        const px0 = trail[i - 2];
        const py0 = trail[i - 1];
        const px1 = trail[i];
        const py1 = trail[i + 1];
        if (px0 === undefined || py0 === undefined || px1 === undefined || py1 === undefined) {
          continue;
        }
        const age = i / Math.max(2, trail.length - 2);
        ctx.beginPath();
        ctx.moveTo(px0 * width, py0 * height);
        ctx.lineTo(px1 * width, py1 * height);
        ctx.lineWidth = ballRadius * age * 1.05;
        ctx.strokeStyle = `rgba(112,78,190,${0.12 + age * 0.3})`;
        ctx.stroke();
      }
      ctx.restore();

      drawBall(ctx, ball, width, height, ballRadius);
    }
  }

  /* ── Simulation ──────────────────────────────────────────────────────── */

  function frame(now: number) {
    frameRef.current = undefined;

    const elapsed = Math.min(0.032, Math.max(0, (now - clockRef.current) / 1000));
    clockRef.current = now;
    const dt = hitStopRef.current.consume(elapsed);

    const { geometry: geo, pegs: pins } = boardRef.current;
    const flares = flaresRef.current;
    for (const [key, value] of flares) {
      const next = value - elapsed * 2.6;
      if (next <= 0) flares.delete(key);
      else flares.set(key, next);
    }

    restingRef.current = restingRef.current.filter((settled) => settled.until > now);

    if (dt > 0) {
      const landed: Live[] = [];

      for (const live of liveRef.current) {
        const strikes = stepBall(live.ball, pins, dt, geo);

        for (const strike of strikes) {
          const index = pins.findIndex((peg) => peg.row === strike.row && peg.col === strike.col);
          if (index >= 0) flares.set(index, 1);

          // Sparks fly off the contact, away from the pin — the direction is
          // the contact normal, which is exactly what the solver just computed.
          if (strike.impact > 0.12) {
            effectsRef.current?.burst({
              ...toWrapper(canvasRef.current, strike.x, strike.y),
              count: 3,
              colours: PALETTE.violet,
              speed: 0.22 + strike.impact * 0.5,
              life: 0.3,
              size: 1.6,
              gravity: 1.2,
              arc: Math.PI * 1.4,
              direction: -Math.PI / 2,
            });
          }

          if (now - bounceAtRef.current > BOUNCE_SOUND_GAP_MS) {
            bounceAtRef.current = now;
            // Panned to where on the board it happened, so a run down the left
            // edge is heard on the left.
            playSound(
              "bounce",
              strike.row / Math.max(1, geo.rows),
              Math.max(-1, Math.min(1, (strike.x - 0.5) / geo.spread)) * 0.7,
            );
          }
        }

        // The trail is a short ring of recent positions, sampled per frame.
        live.trail.push(live.ball.x, live.ball.y);
        if (live.trail.length > 14) live.trail.splice(0, live.trail.length - 14);

        if (live.ball.landed) landed.push(live);
      }

      separate(liveRef.current, geo);
      for (const live of landed) settle(live);
    }

    draw();

    if (liveRef.current.length > 0 || restingRef.current.length > 0) {
      frameRef.current = requestAnimationFrame(frame);
    }
  }

  function wake() {
    if (frameRef.current !== undefined) return;
    clockRef.current = performance.now();
    frameRef.current = requestAnimationFrame(frame);
  }

  /* ── Settlement ──────────────────────────────────────────────────────── */

  function syncBalance() {
    const shown = authoritativeRef.current - withheldRef.current;
    setBalance(shown < 0n ? 0n : shown);
  }

  function settle(live: Live) {
    liveRef.current = liveRef.current.filter((entry) => entry !== live);

    // Park it at the bottom of its slot, upright and still, so it can be seen
    // to have arrived somewhere rather than simply ceasing to exist.
    live.ball.vx = 0;
    live.ball.vy = 1;
    live.ball.squash = 0;
    restingRef.current = [
      ...restingRef.current,
      { ball: live.ball, until: performance.now() + RESTING_MS },
    ];

    const multiplier = live.result.multiplier ?? 0;
    const payout = BigInt(live.result.payout ?? "0");
    const bucket = live.ball.bucket;
    const won = multiplier > MULTIPLIER_SCALE;

    if (demo) {
      // The demo store held this back until the ball actually arrived.
      authoritativeRef.current = creditDemoPayout(payout);
    } else {
      withheldRef.current -= payout;
    }
    syncBalance();

    setFlying((n) => Math.max(0, n - 1));
    setHistory((entries) =>
      pushHistory(entries, { id: live.result.roundId ?? live.ball.id, multiplier }),
    );
    setPulses((current) => ({ ...current, [bucket]: (current[bucket] ?? 0) + 1 }));
    setLast({ bucket, multiplier, payout });

    const impact = Math.min(1, multiplier / 200_000);
    hitStopRef.current.request(hitStopFor(impact));
    effectsRef.current?.shake(won ? 0.14 + impact * 0.4 : 0.05);

    const at = toWrapper(canvasRef.current, bucketCentre(bucket, rows, geometry), geometry.bottom);
    if (won) {
      effectsRef.current?.burst({
        ...at,
        count: multiplier >= 100_000 ? 46 : 22,
        colours: multiplier >= 100_000 ? PALETTE.gold : PALETTE.violet,
        speed: 0.7 + impact * 0.9,
        life: 1,
        size: 3,
        arc: Math.PI * 1.1,
        direction: -Math.PI / 2,
      });
      celebrate(multiplier);
    } else {
      effectsRef.current?.burst({
        ...at,
        count: 8,
        colours: PALETTE.violet,
        speed: 0.32,
        life: 0.45,
        size: 2,
        arc: Math.PI,
        direction: -Math.PI / 2,
      });
      feedback("land", 0, 10);
    }
  }

  /* ── Release ─────────────────────────────────────────────────────────── */

  function release(result: RoundResult) {
    if (!result.ok) {
      // Nothing was staked, so there is nothing to give back.
      setFlying((n) => Math.max(0, n - 1));
      setError(result.error ?? "That round could not be placed.");
      syncBalance();
      return;
    }

    const payout = BigInt(result.payout ?? "0");
    if (result.balance && result.nonce !== undefined && result.nonce > nonceRef.current) {
      // Responses can arrive out of order; only the highest nonce is current.
      nonceRef.current = result.nonce;
      authoritativeRef.current = BigInt(result.balance);
    }
    if (!demo) withheldRef.current += payout;
    syncBalance();

    const outcome = result.outcome as unknown as Outcome | undefined;
    const path = outcome?.path ?? [];
    const bucket = outcome?.bucket ?? 0;

    const tint = TINTS[tintRef.current % TINTS.length] ?? TINTS[0];
    tintRef.current += 1;

    const ball = createBall({
      id: result.roundId ?? `${result.nonce ?? 0}-${tintRef.current}`,
      path,
      bucket,
      tint,
      // A hair of lateral offset per ball, so five released together separate
      // immediately instead of travelling as one indistinguishable clump.
      jitter: ((tintRef.current % 5) - 2) * geometry.ballRadius * 0.45,
      geometry,
    });

    if (prefersReducedMotion()) {
      // No simulation at all: the result is simply stated.
      settle({ ball: { ...ball, landed: true }, result, trail: [] });
      return;
    }

    liveRef.current = [...liveRef.current, { ball, result, trail: [] }];
    wake();
  }

  function drop() {
    unlockSound();
    setError(undefined);

    const total = stake * BigInt(count);
    if (stake <= 0n || total > balance) return;

    setFlying((n) => n + count);
    recordRound();
    playSound("drop");

    for (let i = 0; i < count; i += 1) {
      // Stagger the releases. Five balls leaving on the same frame trace
      // near-identical arcs; ninety milliseconds apart they fan out, and the
      // board fills the way a real one does.
      pendingRef.current += 1;

      if (demo) {
        window.setTimeout(() => {
          pendingRef.current -= 1;
          release(demoPlinko(stake, rows, risk));
        }, i * 90);
        continue;
      }

      const form = new FormData();
      form.set("asset", asset);
      form.set("stake", String(stake));
      form.set("rows", String(rows));
      form.set("risk", risk);

      window.setTimeout(() => {
        void playPlinkoRound(form)
          .then((result) => {
            pendingRef.current -= 1;
            release(result);
          })
          .catch(() => {
            pendingRef.current -= 1;
            setFlying((n) => Math.max(0, n - 1));
            setError("That round could not be placed.");
          });
      }, i * 90);
    }
  }

  /* ── Board switches ──────────────────────────────────────────────────── */

  function changeRows(next: PlinkoRows) {
    setRows(next);
    setLast(undefined);
    setPulses({});
  }

  function changeRisk(next: PlinkoRisk) {
    setRisk(next);
    setLast(undefined);
    setPulses({});
  }

  const buckets = rows + 1;
  const total = stake * BigInt(count);
  const canDrop = stake > 0n && total <= balance;
  const busy = flying > 0;

  return (
    <GameLayout
      game="plinko"
      board={
        <GameBoard
          game="plinko"
          history={history}
          status={
            error ? (
              <span className="text-night-amber">{error}</span>
            ) : last ? (
              <>
                Bucket {last.bucket + 1} of {buckets} — {formatMultiplier(last.multiplier)}, paying{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(last.payout, asset))}
                </span>
                . About {oddsPhrase(plinkoProbability(last.bucket, rows))}.
              </>
            ) : busy ? (
              `${flying} ${flying === 1 ? "ball" : "balls"} falling…`
            ) : (
              "Drop a ball. The middle is likely and cheap; the edges are rare and not."
            )
          }
        >
          <EffectsLayer
            ref={effectsRef}
            magnitude={9}
            capacity={420}
            className="mx-auto w-full max-w-[40rem]"
          >
            <canvas
              ref={canvasRef}
              className="block aspect-square w-full"
              role="img"
              aria-label={`Plinko board, ${rows} rows, ${risk} risk`}
            />

            <ol
              className="mt-1.5 grid gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${buckets}, minmax(0, 1fr))`,
                // Inset so each bucket sits directly under where the ball
                // actually lands. Spreading them edge to edge instead puts the
                // outermost labels a sixth of a bucket wide of the ball.
                paddingInline: `${(0.5 - geometry.spread - geometry.spread / rows) * 100}%`,
              }}
            >
              {multipliers.map((multiplier, index) => {
                const pulse = pulses[index] ?? 0;
                const rich = multiplier >= 30_000;
                const profit = multiplier > MULTIPLIER_SCALE;
                return (
                  <li key={index} className="min-w-0">
                    <span
                      // Remounting on each hit is what restarts the animation;
                      // a class toggle would need a frame of "off" in between.
                      key={pulse}
                      className={cn(
                        "block rounded-[4px] border py-1.5 text-center",
                        pulse > 0 && "animate-[kyro-bucket_620ms_var(--ease-out-quiet)]",
                        rich
                          ? "border-night-gold/40 bg-night-gold/12 text-night-gold"
                          : profit
                            ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-night-rule bg-night-sunk text-night-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "figure-num block leading-none",
                          buckets > 13 ? "text-[0.5rem]" : "text-[0.625rem]",
                        )}
                      >
                        {(multiplier / MULTIPLIER_SCALE).toFixed(
                          multiplier >= 100_000 ? 0 : multiplier >= 10_000 ? 1 : 2,
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
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
            <p className="border-t border-night-rule pt-4 text-micro text-night-muted">
              Risk changes the shape of the curve, never the return: all three are
              normalised to the same 99%. Low keeps more of your stake in the middle;
              high hollows it out and pays the edges.
            </p>
          }
          action={
            <PlayButton onClick={drop} disabled={!canDrop}>
              {count === 1 ? "Drop" : `Drop ${count}`}
              {count > 1 ? (
                <span className="figure-num ms-2 text-small font-normal opacity-70">
                  {formatCrypto(cryptoAmount(total, asset))}
                </span>
              ) : null}
            </PlayButton>
          }
        >
          <div className="grid gap-4">
            <Segmented
              name="plinko-rows"
              label="Rows"
              value={String(rows)}
              disabled={busy}
              options={PLINKO_ROW_OPTIONS.map((option) => ({
                value: String(option),
                label: String(option),
                hint: `${option + 1} buckets`,
              }))}
              onChange={(next) => changeRows(Number.parseInt(next, 10) as PlinkoRows)}
            />

            <Segmented
              name="plinko-risk"
              label="Risk"
              value={risk}
              disabled={busy}
              options={PLINKO_RISKS.map((option) => ({
                value: option,
                label: option === "low" ? "Low" : option === "medium" ? "Medium" : "High",
                hint: `${((plinkoMultipliers(rows, option)[0] ?? 0) / MULTIPLIER_SCALE).toFixed(0)}× edge`,
              }))}
              onChange={changeRisk}
            />

            <Segmented
              name="plinko-balls"
              label="Balls per drop"
              value={String(count)}
              options={BALL_COUNTS.map((option) => ({
                value: String(option),
                label: `${option}×`,
                hint: option === 1 ? "one round" : `${option} rounds`,
              }))}
              onChange={(next) => setCount(Number.parseInt(next, 10) as BallCount)}
            />
          </div>
        </BetPanel>
      }
    />
  );
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: Ball,
  width: number,
  height: number,
  radius: number,
): void {
  const squash = ball.squash * 0.34;

  ctx.save();
  ctx.translate(ball.x * width, ball.y * height);
  // Squash along the direction of travel, stretch across it — conservation of
  // volume, roughly, which is what makes it read as a deforming solid rather
  // than a circle being scaled.
  ctx.rotate(Math.atan2(ball.vy, ball.vx));
  ctx.scale(1 - squash, 1 + squash);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.4,
    radius * 0.1,
    0,
    0,
    radius * 1.15,
  );
  gradient.addColorStop(0, "#f4ecff");
  gradient.addColorStop(0.45, ball.tint);
  gradient.addColorStop(1, "#4c2f8a");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/**
 * Pushes overlapping balls apart.
 *
 * Position only, and then re-solve — never an impulse. Ball-on-ball collision
 * would be a force the committed trajectory never accounted for, and the seed
 * has already decided where each of these is going. Five balls tracing one line
 * down the board is a rendering problem, so it gets a rendering fix, and
 * `reaim` absorbs the displacement before it can become a wrong bucket.
 */
function separate(balls: readonly Live[], geometry: BoardGeometry): void {
  const minimum = geometry.ballRadius * 2;

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i]?.ball;
      const b = balls[j]?.ball;
      if (!a || !b || a.landed || b.landed) continue;

      let dx = b.x - a.x;
      const dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= minimum) continue;

      // Perfectly stacked: nothing to push along, so pick a side.
      if (distance < 1e-6) {
        dx = minimum * 0.5;
        distance = minimum * 0.5;
      }

      // Mostly lateral. Shoving balls vertically past each other reads as one
      // overtaking the other, which is stranger than the overlap it fixes.
      const push = ((minimum - distance) / distance) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push * 0.3;
      b.x += dx * push;
      b.y += dy * push * 0.3;

      reaim(a, geometry);
      reaim(b, geometry);
    }
  }
}

/**
 * Converts a point in the canvas's own 0–1 space into the effects wrapper's,
 * since the wrapper also contains the bucket row underneath.
 */
function toWrapper(
  canvas: HTMLCanvasElement | null,
  x: number,
  y: number,
): { x: number; y: number } {
  const parent = canvas?.offsetParent as HTMLElement | null | undefined;
  if (!canvas || !parent || parent.clientHeight === 0) return { x, y };
  return {
    x: (canvas.offsetLeft + x * canvas.offsetWidth) / parent.clientWidth,
    y: (canvas.offsetTop + y * canvas.offsetHeight) / parent.clientHeight,
  };
}

/** "one drop in 12" reads better under a board than "0.0823". */
function oddsPhrase(probability: number): string {
  if (probability <= 0) return "never";
  const one = Math.round(1 / probability);
  return `one drop in ${one.toLocaleString("en-GB")}`;
}

function mix(from: string, to: string, amount: number): string {
  const parse = (hex: string): [number, number, number] => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const t = Math.max(0, Math.min(1, amount));
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${channel(r1, r2)},${channel(g1, g2)},${channel(b1, b2)})`;
}
