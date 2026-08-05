"use client";

import { useMemo, useState, useTransition } from "react";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MINES_TILES, formatMultiplier, minesMultiplier } from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import {
  cashOutMines,
  openMinesRound,
  revealMinesTile,
  type MinesRoundState,
} from "@/server/games/mines";
import { createMinesDemo } from "@/lib/games/demo";
import { feedback, play as playSound, unlockSound } from "@/lib/sound";

/**
 * Mines.
 *
 * Every tap goes to the server, which checks it against a board already fixed
 * by the seeds. That is what makes the tension honest: the answer exists before
 * you touch anything, and nobody — including KYRO — can change it once you have.
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
  const [balance, setBalance] = useState(initialBalance);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n);
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<MinesRoundState | undefined>();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | undefined>();
  // One runner for the whole session, so an in-flight demo round survives
  // re-renders the same way a server round does.
  // A lazy `useState` initialiser rather than a ref assigned during render:
  // it runs exactly once and keeps the render pure.
  const [runner] = useState(() => (demo ? createMinesDemo() : undefined));

  const playing = Boolean(round?.ok && round.roundId && !round.finished);
  const revealed = round?.revealed ?? [];
  const mineTiles = round?.mineTiles;

  const current = round?.multiplier ?? 10_000;
  const next = round?.nextMultiplier ?? minesMultiplier(mines, 1);

  const projected = useMemo(
    () => (stake * BigInt(current)) / 10_000n,
    [stake, current],
  );

  function begin() {
    unlockSound();
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

    if (state.busted) feedback("break", 0, [40, 30, 60]);
    else if (state.finished) feedback("cashout", 0, [12, 24, 12]);
    // The note climbs with the tile count, so a long run runs up the scale.
    else feedback("step", (state.revealed?.length ?? 1) - 1, 10);
  }

  function reveal(tile: number) {
    if (!playing || !round?.roundId || revealed.includes(tile) || busy !== undefined) return;
    unlockSound();
    setBusy(tile);

    if (demo && runner) {
      applyReveal(runner.reveal(tile));
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
      const multiplier = state.multiplier ?? 0;
      feedback(
        multiplier >= 50_000 ? "bigWin" : "cashout",
        Math.min(1, multiplier / 200_000),
        [12, 24, 12],
      );
    };

    if (demo && runner) {
      settle(runner.cashOut());
      return;
    }

    start(async () => {
      settle(await cashOutMines(round.roundId as string));
    });
  }

  function tileClass(index: number): string {
    const isRevealed = revealed.includes(index);
    const isMine = mineTiles?.includes(index) ?? false;
    const isHit = round?.busted && revealed[revealed.length - 1] === index;

    if (isHit) return "border-night-red bg-night-red/25 text-night-red";
    if (isMine && round?.finished) return "border-night-rule bg-night-sunk text-night-muted";
    if (isRevealed) return "border-night-green/50 bg-night-green/15 text-night-green";
    if (busy === index) return "border-night-blue bg-night-blue/10";
    return cn(
      "border-night-rule-strong bg-night-sunk",
      playing && "hover:border-night-muted enabled:hover:-translate-y-px",
    );
  }

  return (
    <GameLayout
      board={
        <div className="rounded-[10px] border border-night-rule bg-night-raised p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-mono text-night-muted">
              {playing
                ? `${revealed.length} safe · ${mines} mines`
                : round?.finished
                  ? round.busted
                    ? "Hit a mine"
                    : "Cashed out"
                  : `${mines} mines`}
            </p>
            <p
              key={current}
              className={cn(
                "figure-num text-[1.25rem] animate-[kyro-digit-in_var(--duration-base)_var(--ease-out-quiet)]",
                round?.busted ? "text-night-red" : playing ? "text-night-green" : "text-night-text",
              )}
            >
              {formatMultiplier(round?.busted ? 0 : current)}
            </p>
          </div>

          <div
            role="grid"
            aria-label="Mines board"
            className="mt-4 grid grid-cols-5 gap-1.5 sm:gap-2"
          >
            {Array.from({ length: MINES_TILES }, (_, index) => (
              <button
                key={index}
                type="button"
                role="gridcell"
                onClick={() => reveal(index)}
                disabled={!playing || revealed.includes(index) || busy !== undefined}
                aria-label={`Tile ${index + 1}${
                  revealed.includes(index)
                    ? ", safe"
                    : mineTiles?.includes(index)
                      ? ", mine"
                      : ""
                }`}
                className={cn(
                  "aspect-square rounded-[6px] border text-[0.9375rem] transition-all",
                  "duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)] disabled:cursor-default",
                  tileClass(index),
                )}
              >
                <span aria-hidden="true">
                  {revealed.includes(index)
                    ? round?.busted && revealed[revealed.length - 1] === index
                      ? "✕"
                      : "✓"
                    : mineTiles?.includes(index) && round?.finished
                      ? "✕"
                      : ""}
                </span>
              </button>
            ))}
          </div>

          <p aria-live="polite" className="mt-4 min-h-[2.5rem] text-small text-night-muted">
            {round?.error ? (
              <span className="text-night-amber">{round.error}</span>
            ) : round?.busted ? (
              <>You hit a mine on tile {(revealed[revealed.length - 1] ?? 0) + 1}. Round over.</>
            ) : round?.finished ? (
              <>
                Cashed out at {formatMultiplier(current)} for{" "}
                <span className="figure-num text-night-green">
                  {formatCrypto(cryptoAmount(BigInt(round.payout ?? "0"), asset))}
                </span>
                .
              </>
            ) : playing ? (
              <>
                Cash out for{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(projected, asset))}
                </span>
                , or open one more for {formatMultiplier(next)}.
              </>
            ) : (
              "Choose how many mines, set your stake, and start."
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
          disabled={playing || pending}
          action={
            playing ? (
              <Button
                tone="night"
                size="lg"
                full
                onClick={cashOut}
                disabled={pending || revealed.length === 0}
              >
                {revealed.length === 0
                  ? "Reveal a tile first"
                  : `Cash out ${formatMultiplier(current)}`}
              </Button>
            ) : (
              <Button
                tone="night"
                size="lg"
                full
                onClick={begin}
                disabled={pending || stake <= 0n || stake > balance}
              >
                {pending ? "Dealing…" : round?.finished ? "Play again" : "Start round"}
              </Button>
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
                    "tap rounded-[6px] border text-small transition-colors",
                    mines === count
                      ? "border-night-blue bg-night-blue/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  {count}
                </button>
              ))}
            </div>

            <dl className="mt-5 space-y-1.5 border-t border-night-rule pt-4">
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">
                  {playing ? "Cash out now" : "First tile pays"}
                </dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">
                  {formatMultiplier(playing ? current : minesMultiplier(mines, 1))}
                </dd>
              </div>
              {playing ? (
                <div className="flex items-baseline gap-1.5">
                  <dt className="flex-none text-small text-night-muted">One more tile</dt>
                  <span aria-hidden="true" className="leader-night" />
                  <dd className="figure-num flex-none text-small">{formatMultiplier(next)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </BetPanel>
      }
    />
  );
}
