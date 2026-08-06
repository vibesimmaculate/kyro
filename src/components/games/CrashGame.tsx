"use client";

import { useEffect, useRef, useState } from "react";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { EffectsLayer, type EffectsHandle } from "@/components/games/EffectsLayer";
import { frameNow, nowMs } from "@/lib/clock";
import { cn } from "@/lib/cn";
import {
  MULTIPLIER_SCALE,
  crashMultiplierAt,
  crashTimeFor,
  formatMultiplier,
  payoutFor,
} from "@/lib/games";
import { createCrashDemo, type CrashDemoRunner } from "@/lib/games/demo";
import { useGameBalance } from "@/lib/games/use-balance";
import { HitStop } from "@/lib/motion";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import type { CryptoCode } from "@/lib/money/currencies";
import { formatCrypto } from "@/lib/money/format";
import { PALETTE } from "@/lib/particles";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";
import { openCrashRound, settleCrashRound, type CrashState } from "@/server/games/crash";

/**
 * Crash.
 *
 * The version this replaces settled the entire round the moment the stake was
 * taken: you named a target, the answer came back immediately, and the curve
 * was a replay of a decision already made. It was honest and it was not a game.
 * There was no instant where anything was at stake, and a crash game without
 * that instant is a slot machine with a chart on it.
 *
 * Now the round opens and tells you nothing. The crash point is fixed by the
 * seeds before your stake moves — the fairness claim is unchanged — but it
 * stays on the server, and the only way to find out where it is is to still be
 * in when it arrives. You watch the number climb and you decide.
 *
 * The auto-target stays, and it is not a lesser way to play. It is the reason
 * a slow connection cannot cost you a round: the server settles at whichever
 * came first out of your tap, your target, and the break. Set a target and
 * latency is irrelevant to you. Play past it and you are improvising, which is
 * the point, and the risk is yours.
 */

export function CrashGame({
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
  const [target, setTarget] = useState("2.00");
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [recent, setRecent] = useState<readonly number[]>([]);
  const [displayed, setDisplayed] = useState(MULTIPLIER_SCALE);
  const [phase, setPhase] = useState<"idle" | "running" | "settling" | "over">("idle");
  const [outcome, setOutcome] = useState<CrashState | undefined>();
  const [error, setError] = useState<string | undefined>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsRef = useRef<EffectsHandle | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const roundRef = useRef<{ id: string; startedAt: number; target: number } | undefined>(undefined);
  const demoRef = useRef<CrashDemoRunner | undefined>(undefined);
  const hitStopRef = useRef(new HitStop());
  const climbAtRef = useRef(0);
  const peakRef = useRef(MULTIPLIER_SCALE);
  const bustedRef = useRef(false);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useEffect(() => {
    const paint = () => drawChart(canvasRef.current, MULTIPLIER_SCALE, MULTIPLIER_SCALE, 0, false);
    paint();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const targetScaled = Math.round(Number(target || "0") * MULTIPLIER_SCALE);
  const hasTarget = targetScaled > MULTIPLIER_SCALE;

  /* ── The loop ────────────────────────────────────────────────────────── */

  function frame(now: number) {
    frameRef.current = undefined;
    const round = roundRef.current;
    if (!round) return;

    const elapsed = now - climbAtRef.current;
    const reached = crashMultiplierAt(elapsed);
    peakRef.current = Math.max(peakRef.current, reached);

    // In demo the crash point is here, so the bust is drawn at the exact frame.
    // Against the server it is not, so the client draws until the server says
    // otherwise — which is the point: it cannot know, so it cannot cheat.
    const breaks = demoRef.current?.breaksAt();
    const broke = breaks !== undefined && reached >= breaks;

    if (broke && !bustedRef.current) {
      bustedRef.current = true;
      bust(reached, breaks);
      return;
    }

    // The safety net fires locally too, so the curve stops climbing the moment
    // the target is met rather than a round-trip later.
    if (hasTarget && reached >= round.target && !bustedRef.current) {
      bustedRef.current = true;
      void leave(round.target);
      return;
    }

    setDisplayed(reached);
    drawChart(canvasRef.current, reached, peakRef.current, round.target, false);

    // A tone that rises with the curve. Thin on purpose — it plays several
    // times a second and must never become a siren.
    if (elapsed - (climbToneRef.current - climbAtRef.current) > 210) {
      climbToneRef.current = now;
      playSound("climb", Math.min(1, Math.log10(reached / MULTIPLIER_SCALE + 1) * 1.6));
    }

    frameRef.current = requestAnimationFrame(frame);
  }

  const climbToneRef = useRef(0);

  function wake() {
    if (frameRef.current !== undefined) return;
    frameRef.current = requestAnimationFrame(frame);
  }

  /* ── Settling ────────────────────────────────────────────────────────── */

  function record(state: CrashState) {
    const multiplier = state.multiplier ?? 0;
    setOutcome(state);
    setPhase("over");
    setHistory((entries) =>
      pushHistory(entries, { id: state.roundId ?? String(nowMs()), multiplier }),
    );
    if (state.crashPoint) {
      setRecent((entries) => [state.crashPoint as number, ...entries].slice(0, 14));
    }
    if (!demo && state.balance) setBalance(BigInt(state.balance));
  }

  function bust(reached: number, breaks: number) {
    setDisplayed(breaks);
    drawChart(canvasRef.current, breaks, Math.max(peakRef.current, breaks), 0, true);
    hitStopRef.current.request(0.08);
    effectsRef.current?.shake(0.7);
    effectsRef.current?.burst({
      x: 0.5,
      y: 0.45,
      count: 34,
      colours: PALETTE.red,
      speed: 1.3,
      life: 0.7,
      size: 2.6,
      arc: Math.PI * 2,
      gravity: 2.2,
      drag: 1.8,
    });
    feedback("break", 1, [40, 30, 60]);
    void leave(reached);
  }

  /** Tells the back end the player is out, at whatever the curve had reached. */
  async function leave(reached: number) {
    const round = roundRef.current;
    if (!round || phase === "settling") return;
    setPhase("settling");

    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }

    if (demo && demoRef.current) {
      const state = demoRef.current.settle(reached);
      finish(state);
      return;
    }

    const state = await settleCrashRound(round.id);
    finish(state);
  }

  function finish(state: CrashState) {
    roundRef.current = undefined;
    record(state);

    if (!state.ok) {
      setError(state.error);
      return;
    }

    if (state.busted) {
      if (!bustedRef.current) {
        // The server saw a break the client had not drawn yet.
        setDisplayed(state.crashPoint ?? MULTIPLIER_SCALE);
        drawChart(
          canvasRef.current,
          state.crashPoint ?? MULTIPLIER_SCALE,
          peakRef.current,
          0,
          true,
        );
        feedback("break", 1, [40, 30, 60]);
        effectsRef.current?.shake(0.7);
      }
      return;
    }

    const multiplier = state.multiplier ?? 0;
    setDisplayed(multiplier);
    drawChart(canvasRef.current, multiplier, peakRef.current, 0, false);
    effectsRef.current?.burst({
      x: 0.5,
      y: 0.45,
      count: multiplier >= 50_000 ? 52 : 26,
      colours: multiplier >= 50_000 ? PALETTE.gold : PALETTE.cyan,
      speed: 0.9 + Math.min(1, multiplier / 200_000),
      life: 1.1,
      size: 3,
      arc: Math.PI * 1.4,
      direction: -Math.PI / 2,
    });
    effectsRef.current?.shake(0.24);
    celebrate(multiplier);
  }

  /* ── Starting ────────────────────────────────────────────────────────── */

  /**
   * Split in two on purpose. Everything that reads a clock happens here, before
   * anything is awaited — the compiler cannot tell that an async function is
   * only ever reached from a tap, and it is right to be suspicious: a clock
   * read on a path that might re-run during render is a real bug elsewhere.
   */
  function bet() {
    unlockSound();
    setError(undefined);
    setOutcome(undefined);
    recordRound();

    if (stake <= 0n || stake > balance) return;

    setPhase("running");
    setDisplayed(MULTIPLIER_SCALE);
    peakRef.current = MULTIPLIER_SCALE;
    bustedRef.current = false;
    playSound("drop");

    climbAtRef.current = frameNow();
    climbToneRef.current = climbAtRef.current;
    void begin(nowMs());
  }

  async function begin(openedAt: number) {
    const state = demo
      ? (demoRef.current ??= createCrashDemo()).open({ stake, target: targetScaled })
      : await openCrash();

    if (!state.ok || !state.roundId) {
      setPhase("idle");
      setError(state.error ?? "Could not start the round.");
      return;
    }

    if (!demo && state.balance) setBalance(BigInt(state.balance));

    roundRef.current = {
      id: state.roundId,
      startedAt: state.startedAt ?? openedAt,
      target: targetScaled,
    };

    if (prefersReducedMotion()) {
      // No curve at all: the round is played out instantly at the target, or
      // held at 1.00× if there is none to hold it to.
      void leave(hasTarget ? targetScaled : MULTIPLIER_SCALE);
      return;
    }

    wake();
  }

  async function openCrash(): Promise<CrashState> {
    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("target", String(hasTarget ? targetScaled : 0));
    return openCrashRound(form);
  }

  const running = phase === "running";
  const busy = phase === "settling";
  const projected = payoutFor(stake, displayed);

  return (
    <GameLayout
      game="crash"
      board={
        <GameBoard
          game="crash"
          history={history}
          status={
            error ? (
              <span className="text-night-amber">{error}</span>
            ) : outcome?.finished ? (
              outcome.busted ? (
                <>
                  It broke at {formatMultiplier(outcome.crashPoint ?? 0)}
                  {hasTarget ? <> — short of your {formatMultiplier(targetScaled)}.</> : "."}
                </>
              ) : (
                <>
                  Out at {formatMultiplier(outcome.multiplier ?? 0)} for{" "}
                  <span className="figure-num text-night-green">
                    {formatCrypto(cryptoAmount(BigInt(outcome.payout ?? "0"), asset))}
                  </span>
                  . It went on to {formatMultiplier(outcome.crashPoint ?? 0)}.
                </>
              )
            ) : running ? (
              "Take it whenever you like."
            ) : (
              "Set a stake. Take it out before the curve breaks — by hand, or at a target."
            )
          }
        >
          <EffectsLayer ref={effectsRef} magnitude={13} capacity={360}>
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="block aspect-[16/10] w-full"
                role="img"
                aria-label="Crash curve"
              />

              {/* The figure, over the chart rather than beside it. It is the
                  thing being watched, and a chart with the number somewhere
                  else makes you look in two places at the moment you can least
                  afford to. */}
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
                <p
                  className={cn(
                    "figure-num text-[clamp(2.75rem,9vw,4.5rem)] leading-none font-medium tabular-nums",
                    "transition-colors duration-[var(--duration-fast)]",
                    outcome?.busted
                      ? "text-night-red"
                      : outcome?.finished
                        ? "text-night-green"
                        : running
                          ? "text-[var(--accent)]"
                          : "text-night-muted",
                  )}
                  style={
                    running
                      ? { textShadow: "0 0 40px color-mix(in oklab, var(--accent) 55%, transparent)" }
                      : undefined
                  }
                  aria-live="off"
                >
                  {formatMultiplier(displayed)}
                </p>

                {running ? (
                  <p className="figure-num mt-4 text-small text-night-muted tabular-nums">
                    {formatCrypto(cryptoAmount(projected, asset))}
                  </p>
                ) : null}

                {outcome?.busted ? (
                  <p className="label-mono mt-3 text-night-red">Broke</p>
                ) : null}
              </div>
            </div>

            {/* Recent rounds. Every crash game has this strip and it earns its
                place: it is the only way to see that a run of low breaks is
                normal rather than the game turning against you. */}
            {recent.length > 0 ? (
              <ol className="mt-3 flex flex-wrap gap-1.5">
                {recent.map((point, index) => (
                  <li
                    key={`${index}-${point}`}
                    className={cn(
                      "figure-num rounded-[5px] border px-2 py-1 text-micro tabular-nums",
                      point >= 100_000
                        ? "border-night-gold/40 bg-night-gold/12 text-night-gold"
                        : point >= 20_000
                          ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-night-rule bg-night-sunk text-night-muted",
                    )}
                  >
                    {(point / MULTIPLIER_SCALE).toFixed(2)}×
                  </li>
                ))}
              </ol>
            ) : null}
          </EffectsLayer>
        </GameBoard>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          disabled={running || busy}
          demo={demo}
          summary={
            <p className="border-t border-night-rule pt-4 text-micro text-night-muted">
              One round in a hundred breaks instantly at 1.00×. Every target returns
              the same 99% over time — no multiplier is a better bet than another.
              A target also settles on the server the moment it is reached, so a slow
              connection cannot cost you a round you had already decided to take.
            </p>
          }
          action={
            running ? (
              <PlayButton onClick={() => void leave(displayed)} variant="cash">
                Take {formatCrypto(cryptoAmount(projected, asset))}
              </PlayButton>
            ) : (
              <PlayButton onClick={bet} disabled={busy || stake <= 0n || stake > balance}>
                {busy ? "Settling…" : "Bet"}
              </PlayButton>
            )
          }
        >
          <fieldset disabled={running || busy}>
            <legend className="label-mono text-night-muted">Take out at</legend>
            <p className="mt-2 text-micro text-night-muted">
              Optional. Leave it blank to play the whole round by hand.
            </p>

            <div className="mt-2 flex items-stretch overflow-hidden rounded-[10px] border border-night-rule-strong bg-night-sunk focus-within:border-[var(--accent)]">
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                aria-label="Take out at multiplier"
                className="figure-num min-h-12 min-w-0 flex-1 bg-transparent px-3.5 text-[1.0625rem] text-night-text outline-none disabled:opacity-50"
              />
              <span className="label-mono flex flex-none items-center border-s border-night-rule px-3.5 text-night-muted">
                ×
              </span>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {(["", "1.5", "2", "5", "10"] as const).map((preset) => (
                <button
                  key={preset || "manual"}
                  type="button"
                  onClick={() => {
                    setTarget(preset);
                    unlockSound();
                    playSound("select");
                  }}
                  aria-pressed={target === preset}
                  className={cn(
                    "tap figure-num min-h-11 rounded-[7px] border text-small transition-colors",
                    "active:translate-y-px disabled:opacity-40",
                    target === preset
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {preset === "" ? "Hand" : `${preset}×`}
                </button>
              ))}
            </div>
          </fieldset>
        </BetPanel>
      }
    />
  );
}

/* ── The chart ───────────────────────────────────────────────────────────── */

/**
 * Draws the curve up to `current`, scaled to `peak`.
 *
 * The vertical scale follows the round's own peak rather than a fixed ceiling,
 * so a 1.2× round and a 40× round both fill the frame. A fixed axis would draw
 * every ordinary round as a flat line along the bottom, which is most rounds.
 */
function drawChart(
  canvas: HTMLCanvasElement | null,
  current: number,
  peak: number,
  target: number,
  broke: boolean,
): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = 12;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // The time axis follows the round too, so the head always sits near the right
  // edge and the curve is legible from the first frame to the last.
  const span = Math.max(1200, crashTimeFor(Math.max(peak, current)) * 1.06);
  const ceiling = Math.max(current, peak, MULTIPLIER_SCALE * 1.35);

  const x = (ms: number) => pad + (Math.min(1, ms / span) * innerW);
  const y = (multiplier: number) => {
    // Very nearly linear in the multiplier, which is what bends the line.
    //
    // A fully logarithmic axis is the defensible choice for an exponential
    // quantity and it draws this game as a straight diagonal — technically
    // honest and completely wrong, because the whole feel of crash is a line
    // that rears up as it goes. The 0.78 exponent keeps the first second
    // legible without flattening the climb that follows.
    const range = Math.max(1, ceiling - MULTIPLIER_SCALE);
    const t = Math.pow(Math.max(0, multiplier - MULTIPLIER_SCALE) / range, 0.78);
    return pad + innerH * (1 - Math.max(0, Math.min(1, t)));
  };

  drawGraticule(ctx, w, h, pad, ceiling, y);

  if (target > MULTIPLIER_SCALE && target < ceiling) {
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "rgba(91,135,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y(target));
    ctx.lineTo(w - pad, y(target));
    ctx.stroke();
    ctx.restore();
  }

  const colour = broke ? "#ff5c5c" : "#3fd9e8";
  const steps = 96;
  const upTo = crashTimeFor(current);
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const ms = (i / steps) * upTo;
    points.push([x(ms), y(crashMultiplierAt(ms))]);
  }

  const head = points[points.length - 1];
  const first = points[0];
  if (!head || !first) return;

  const fill = ctx.createLinearGradient(0, pad, 0, h - pad);
  fill.addColorStop(0, broke ? "rgba(255,92,92,0.34)" : "rgba(63,217,232,0.32)");
  fill.addColorStop(1, "rgba(0,0,0,0)");

  ctx.beginPath();
  ctx.moveTo(first[0], h - pad);
  for (const [px, py] of points) ctx.lineTo(px, py);
  ctx.lineTo(head[0], h - pad);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = colour;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // The head: a soft halo and a bright core, so the eye tracks the tip rather
  // than the whole line.
  ctx.beginPath();
  ctx.arc(head[0], head[1], 13, 0, Math.PI * 2);
  ctx.fillStyle = broke ? "rgba(255,92,92,0.2)" : "rgba(63,217,232,0.2)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(head[0], head[1], 5.5, 0, Math.PI * 2);
  ctx.fillStyle = broke ? "#ff9b9b" : "#c9f8ff";
  ctx.fill();
}

/**
 * The graticule the curve is read against.
 *
 * Horizontals are labelled with the multiplier they represent, which is the one
 * piece of chart furniture that earns its keep here: without it "the curve is
 * high" means nothing, and with it you can see how far your target is.
 */
function drawGraticule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pad: number,
  ceiling: number,
  y: (multiplier: number) => number,
): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(140,150,170,0.09)";

  const innerW = w - pad * 2;
  for (let i = 1; i <= 5; i += 1) {
    const x = pad + (innerW / 6) * i;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }

  ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (const multiplier of gridLines(ceiling)) {
    const py = y(multiplier);
    if (py < pad + 6 || py > h - pad - 2) continue;
    ctx.beginPath();
    ctx.moveTo(pad, py);
    ctx.lineTo(w - pad, py);
    ctx.stroke();
    ctx.fillStyle = "rgba(141,149,165,0.65)";
    ctx.fillText(`${(multiplier / MULTIPLIER_SCALE).toFixed(multiplier >= 100_000 ? 0 : 1)}×`, pad + 4, py - 7);
  }

  ctx.strokeStyle = "rgba(140,150,170,0.24)";
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();
}

/** Round multiplier values to label, chosen to suit the range on screen. */
function gridLines(ceiling: number): number[] {
  const ladder = [
    1.5, 2, 3, 5, 8, 12, 20, 35, 60, 100, 200, 400, 800, 1500, 3000,
  ];
  return ladder
    .map((value) => value * MULTIPLIER_SCALE)
    .filter((value) => value <= ceiling * 1.02)
    .slice(-6);
}
