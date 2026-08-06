"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatedNumber } from "@/components/games/AnimatedNumber";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { BoardHeader, GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import { MINES_TILES, MULTIPLIER_SCALE, formatMultiplier, minesMultiplier } from "@/lib/games";
import { createMinesDemo } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { useGameBalance } from "@/lib/games/use-balance";
import {
  cashOutMines,
  openMinesRound,
  revealMinesTile,
  type MinesRoundState,
} from "@/server/games/mines";

/**
 * Mines.
 *
 * Every tap goes to the server, which checks it against a board already fixed
 * by the seeds. That is what makes the tension honest: the answer exists before
 * you touch anything, and nobody — including KYRO — can change it once you have.
 *
 * The tile turns over rather than recolouring. A quarter-second flip is the
 * difference between "the square changed colour" and "I opened something", and
 * it is the entire feel of this game.
 */

export function MinesGame({
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
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<MinesRoundState | undefined>();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | undefined>();
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [shake, setShake] = useState(false);

  // A lazy initialiser rather than a ref assigned during render: it runs once
  // and keeps the render pure.
  const [runner] = useState(() => (demo ? createMinesDemo() : undefined));

  const playing = Boolean(round?.ok && round.roundId && !round.finished);
  const revealed = round?.revealed ?? [];
  const mineTiles = round?.mineTiles;
  const finished = Boolean(round?.finished);

  const current = round?.multiplier ?? MULTIPLIER_SCALE;
  const next = round?.nextMultiplier ?? minesMultiplier(mines, 1);
  const projected = useMemo(
    () => (stake * BigInt(Math.max(current, MULTIPLIER_SCALE))) / BigInt(MULTIPLIER_SCALE),
    [stake, current],
  );

  const bustTile = round?.busted ? revealed[revealed.length - 1] : undefined;

  function record(state: MinesRoundState) {
    if (!state.finished) return;
    setHistory((h) =>
      pushHistory(h, {
        id: state.roundId ?? String(Date.now()),
        multiplier: state.busted ? 0 : (state.multiplier ?? 0),
      }),
    );
  }

  function begin() {
    unlockSound();
    recordRound();
    playSound("select");

    if (demo && runner) {
      const state = runner.open({ mines, stake });
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("mines", String(mines));
    start(async () => {
      const state = await openMinesRound(form);
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
    });
  }

  function applyReveal(state: MinesRoundState) {
    setRound(state);
    setBusy(undefined);
    if (state.balance) setBalance(BigInt(state.balance));
    record(state);

    if (state.busted) {
      feedback("break", 0, [45, 30, 70]);
      setShake(true);
      window.setTimeout(() => setShake(false), 700);
    } else if (state.finished) {
      celebrate(state.multiplier ?? 0);
    } else {
      // The note climbs with the tile count, so a long run runs up the scale.
      feedback("step", (state.revealed?.length ?? 1) - 1, 10);
    }
  }

  function reveal(tile: number) {
    if (!playing || !round?.roundId || revealed.includes(tile) || busy !== undefined) return;
    unlockSound();
    setBusy(tile);

    if (demo && runner) {
      // A beat before the answer: instant resolution reads as a recolour, and
      // the held breath is most of what makes this game work.
      window.setTimeout(() => applyReveal(runner.reveal(tile)), 160);
      return;
    }

    start(async () => {
      applyReveal(await revealMinesTile(round.roundId as string, tile));
    });
  }

  function cashOut() {
    if (!round?.roundId) return;
    unlockSound();

    const settle = (state: MinesRoundState) => {
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      record(state);
      celebrate(state.multiplier ?? 0);
    };

    if (demo && runner) {
      settle(runner.cashOut());
      return;
    }

    start(async () => {
      settle(await cashOutMines(round.roundId as string));
    });
  }

  return (
    <GameLayout
      game="mines"
      board={
        <GameBoard
          game="mines"
          history={history}
          shake={shake}
          win={
            finished && !round?.busted
              ? {
                  multiplier: round?.multiplier,
                  payout: BigInt(round?.payout ?? "0"),
                  asset,
                  roundKey: round?.roundId,
                }
              : undefined
          }
          status={
            round?.error ? (
              <span className="text-night-amber">{round.error}</span>
            ) : round?.busted ? (
              <>You hit a mine on tile {(bustTile ?? 0) + 1}. Round over.</>
            ) : finished ? (
              <>
                Took{" "}
                <span className="figure-num text-night-green">
                  {formatCrypto(cryptoAmount(BigInt(round?.payout ?? "0"), asset))}
                </span>{" "}
                at {formatMultiplier(current)}.
              </>
            ) : playing ? (
              <>
                Take{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(projected, asset))}
                </span>
                , or open one more for {formatMultiplier(next)}.
              </>
            ) : (
              "Choose how many mines, set your stake, and start."
            )
          }
        >
          <BoardHeader
            label={
              playing
                ? `${revealed.length} safe · ${mines} mines`
                : finished
                  ? round?.busted
                    ? "Hit a mine"
                    : "Cashed out"
                  : `${mines} mines`
            }
            tone={round?.busted ? "lose" : playing || finished ? "win" : "neutral"}
            value={
              // A bust is not a multiplier of zero-point-something — it is the
              // absence of one, and a pickup point ticking down to nothing reads as
              // a payout rather than a loss.
              round?.busted ? (
                "—"
              ) : (
                <AnimatedNumber value={current / MULTIPLIER_SCALE} suffix="×" />
              )
            }
          />

          <div
            role="grid"
            aria-label="Mines board"
            className="mt-4 grid grid-cols-5 gap-2 sm:gap-2.5"
          >
            {Array.from({ length: MINES_TILES }, (_, index) => {
              const isSafe = revealed.includes(index) && index !== bustTile;
              const isBust = index === bustTile;
              const isMine = (mineTiles?.includes(index) ?? false) && finished && !isBust;
              const isTurning = busy === index;
              const face = isSafe || isBust || isMine;

              return (
                <button
                  key={index}
                  type="button"
                  role="gridcell"
                  onClick={() => reveal(index)}
                  disabled={!playing || revealed.includes(index) || busy !== undefined}
                  aria-label={`Tile ${index + 1}${
                    isSafe ? ", safe" : isBust ? ", mine" : isMine ? ", mine" : ""
                  }`}
                  className={cn(
                    "relative aspect-square rounded-[9px] border text-[1.125rem]",
                    "transition-[transform,border-color,background-color,box-shadow]",
                    "duration-[var(--duration-base)] ease-[var(--ease-out-quiet)]",
                    "disabled:cursor-default [transform-style:preserve-3d]",
                    isBust && "glow-lose border-night-red bg-night-red/25 text-night-red",
                    isSafe &&
                      "glow-win border-night-green/60 bg-night-green/18 text-night-green",
                    isMine && "border-night-red/35 bg-night-red/10 text-night-red/70",
                    !face &&
                      playing &&
                      "tile-idle hover:tile-idle-hover hover:-translate-y-0.5 hover:border-[var(--accent)]",
                    !face && !playing && "tile-idle opacity-45",
                    isTurning && "border-[var(--accent)] bg-[var(--accent)]/20",
                  )}
                  style={
                    isTurning
                      ? { animation: "kyro-flip-out 160ms var(--ease-out-quiet) forwards" }
                      : face
                        ? { animation: "kyro-flip-in 200ms var(--ease-out-quiet)" }
                        : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 flex items-center justify-center",
                      isSafe && "animate-[kyro-pop_var(--duration-slow)_var(--ease-out-quiet)]",
                    )}
                  >
                    {isSafe ? <Gem /> : isBust || isMine ? <Bomb dim={isMine} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </GameBoard>
      }
      controls={
        <BetPanel
          asset={asset}
          balance={balance}
          stake={stake}
          onStakeChange={setStake}
          disabled={playing || pending}
          demo={demo}
          summary={
            playing ? (
              <dl className="space-y-1.5 border-t border-night-rule pt-4">
                <div className="flex items-baseline gap-1.5">
                  <dt className="flex-none text-small text-night-muted">Take now</dt>
                  <span aria-hidden="true" className="leader-night" />
                  <dd className="figure-num flex-none text-small text-night-green">
                    {formatMultiplier(current)}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="flex-none text-small text-night-muted">One more tile</dt>
                  <span aria-hidden="true" className="leader-night" />
                  <dd className="figure-num flex-none text-small">{formatMultiplier(next)}</dd>
                </div>
              </dl>
            ) : (
              <div className="flex items-baseline gap-1.5 border-t border-night-rule pt-4">
                <span className="flex-none text-small text-night-muted">First tile pays</span>
                <span aria-hidden="true" className="leader-night" />
                <span className="figure-num flex-none text-small">
                  {formatMultiplier(minesMultiplier(mines, 1))}
                </span>
              </div>
            )
          }
          action={
            playing ? (
              <PlayButton
                variant="cash"
                onClick={cashOut}
                disabled={pending || revealed.length === 0}
              >
                {revealed.length === 0
                  ? "Open a tile first"
                  : `Take ${formatCrypto(cryptoAmount(projected, asset))}`}
              </PlayButton>
            ) : (
              <PlayButton onClick={begin} disabled={pending || stake <= 0n || stake > balance}>
                {pending ? "Dealing…" : finished ? "Play again" : "Start"}
              </PlayButton>
            )
          }
        >
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="label-mono text-night-muted">Mines</span>
              <span className="figure-num text-small">{mines} of 25</span>
            </div>

            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {[1, 3, 5, 10, 15, 24].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setMines(count);
                    unlockSound();
                    playSound("tick");
                  }}
                  aria-pressed={mines === count}
                  disabled={playing || pending}
                  className={cn(
                    "tap rounded-[7px] border text-small transition-colors active:translate-y-px",
                    mines === count
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </BetPanel>
      }
    />
  );
}

/** A cut stone. Drawn rather than an emoji, so it matches the type system. */
function Gem() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M6 3h12l4 6-10 12L2 9z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2 9h20M8 3l-2 6 6 12 6-12-2-6" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
    </svg>
  );
}

function Bomb({ dim }: { readonly dim?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", dim && "opacity-80")}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="14.5" r="6.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.6" />
      {/* Fuse: a curve out of the casing, with a spark at the end. */}
      <path d="M15 10c1.4-1.6 2.6-2.4 4-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19.6 4.4v2M21.8 6.6h-2M21 4.9l-1.2 1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
