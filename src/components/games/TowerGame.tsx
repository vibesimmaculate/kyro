"use client";

import { useState, useTransition } from "react";
import { BetPanel } from "@/components/games/BetPanel";
import { GameLayout } from "@/components/games/GameLayout";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  TOWER_FLOORS,
  TOWER_RULES,
  formatMultiplier,
  towerMultiplier,
  type TowerDifficulty,
} from "@/lib/games";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { feedback, play, unlockSound } from "@/lib/sound";
import { climbTower, cashOutTower, openTowerRound, type TowerState } from "@/server/games/tower";
import { runDemoTower } from "@/lib/games/demo";

/**
 * Tower.
 *
 * The floors are drawn top-down so the climb reads upward, the way a tower
 * does. Each cleared floor plays the next note of a rising pentatonic scale —
 * the pitch climbs because the multiplier climbs, which is the whole point.
 *
 * The cash-out button carries the actual figure rather than the word "collect",
 * because the decision it is asking about is "is this enough", and that is a
 * question about a number.
 */
export function TowerGame({
  asset,
  balance: initialBalance,
  demo,
}: {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  /** Runs rounds in the browser against a local seed. No money involved. */
  readonly demo?: boolean;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n || 1_000_000n);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>("medium");
  const [round, setRound] = useState<TowerState | undefined>();
  const [pending, start] = useTransition();
  const [busyDoor, setBusyDoor] = useState<number | undefined>();
  // A lazy `useState` initialiser rather than a ref assigned during render:
  // it runs exactly once and keeps the render pure.
  const [runner] = useState(() => (demo ? runDemoTower() : undefined));

  const rules = TOWER_RULES[difficulty];
  const playing = Boolean(round?.ok && round.roundId && !round.finished);
  const climbed = round?.climbed ?? [];
  const floorsCleared = round?.busted ? climbed.length - 1 : climbed.length;
  const current = round?.multiplier ?? 10_000;
  const next = round?.nextMultiplier ?? towerMultiplier(difficulty, 1);

  const projected = (stake * BigInt(Math.max(current, 10_000))) / 10_000n;

  function begin() {
    unlockSound();
    feedback("select");

    if (demo && runner) {
      const state = runner.open({ difficulty, stake });
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      return;
    }

    const form = new FormData();
    form.set("asset", asset);
    form.set("stake", String(stake));
    form.set("difficulty", difficulty);
    start(async () => {
      const state = await openTowerRound(form);
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      if (!state.ok) play("lose");
    });
  }

  function applyStep(state: TowerState) {
    setRound(state);
    setBusyDoor(undefined);
    if (state.balance) setBalance(BigInt(state.balance));

    if (state.busted) {
      feedback("break", 0, [40, 30, 60]);
    } else if (state.finished) {
      feedback("cashout", 0, [12, 24, 12]);
    } else {
      // The note rises with the floor, so eight floors is a run up the scale.
      feedback("step", (state.climbed?.length ?? 1) - 1, 10);
    }
  }

  function pick(door: number) {
    if (!playing || !round?.roundId || busyDoor !== undefined) return;
    unlockSound();
    setBusyDoor(door);

    if (demo && runner) {
      applyStep(runner.climb(door));
      return;
    }

    start(async () => {
      applyStep(await climbTower(round.roundId as string, door));
    });
  }

  function collect() {
    if (!round?.roundId) return;
    unlockSound();

    if (demo && runner) {
      const state = runner.cashOut();
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      // A big result gets the arpeggio; everything else gets the plain chime.
      feedback(current >= 50_000 ? "bigWin" : "cashout", Math.min(1, current / 200_000), [12, 24, 12]);
      return;
    }

    start(async () => {
      const state = await cashOutTower(round.roundId as string);
      setRound(state);
      if (state.balance) setBalance(BigInt(state.balance));
      feedback(current >= 50_000 ? "bigWin" : "cashout", Math.min(1, current / 200_000), [12, 24, 12]);
    });
  }

  // Floors are rendered top-first: floor 8 at the top of the screen.
  const floors = Array.from({ length: TOWER_FLOORS }, (_, i) => TOWER_FLOORS - 1 - i);

  return (
    <GameLayout
      board={
        <div className="rounded-[10px] border border-night-rule bg-night-raised p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-mono text-night-muted">
              {playing
                ? `Floor ${floorsCleared + 1} of ${TOWER_FLOORS}`
                : round?.finished
                  ? round.busted
                    ? `Fell on floor ${climbed.length}`
                    : `Cleared ${floorsCleared} ${floorsCleared === 1 ? "floor" : "floors"}`
                  : rules.label}
            </p>
            <p
              key={current}
              className={cn(
                "figure-num text-[1.25rem] animate-[kyro-digit-in_var(--duration-base)_var(--ease-out-quiet)]",
                round?.busted
                  ? "text-night-red"
                  : playing || round?.finished
                    ? "text-night-green"
                    : "text-night-text",
              )}
            >
              {formatMultiplier(round?.busted ? 0 : current)}
            </p>
          </div>

          <ol className="mt-4 space-y-1.5" aria-label="Tower floors, highest first">
            {floors.map((floor) => {
              const cleared = floor < floorsCleared;
              const isCurrent = playing && floor === floorsCleared;
              const takenDoor = climbed[floor];
              const trapsHere = round?.traps?.[floor];
              const bustFloor = round?.busted && floor === climbed.length - 1;

              return (
                <li key={floor} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "figure-num w-8 flex-none text-micro",
                      isCurrent ? "text-night-blue" : "text-night-muted",
                    )}
                  >
                    {String(floor + 1).padStart(2, "0")}
                  </span>

                  <div
                    className="grid flex-1 gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${rules.doors}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: rules.doors }, (_, door) => {
                      const isTaken = cleared && takenDoor === door;
                      const isTrap = trapsHere?.includes(door) ?? false;
                      const isBustDoor = bustFloor && takenDoor === door;

                      return (
                        <button
                          key={door}
                          type="button"
                          onClick={() => pick(door)}
                          disabled={!isCurrent || busyDoor !== undefined}
                          aria-label={`Floor ${floor + 1}, door ${door + 1}`}
                          className={cn(
                            "h-9 rounded-[5px] border text-[0.8125rem] transition-all",
                            "duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
                            "disabled:cursor-default",
                            isBustDoor && "border-night-red bg-night-red/25 text-night-red",
                            !isBustDoor &&
                              isTaken &&
                              "border-night-green/60 bg-night-green/20 text-night-green",
                            !isBustDoor &&
                              !isTaken &&
                              isTrap &&
                              round?.finished &&
                              "border-night-rule bg-night-sunk text-night-muted",
                            !isTaken &&
                              !isTrap &&
                              isCurrent &&
                              "border-night-blue/60 bg-night-blue/10 hover:-translate-y-px hover:border-night-blue",
                            !isTaken &&
                              !isCurrent &&
                              !round?.finished &&
                              "border-night-rule bg-night-sunk opacity-50",
                            !isTaken &&
                              !isTrap &&
                              round?.finished &&
                              "border-night-rule bg-night-sunk opacity-60",
                            busyDoor === door && "border-night-blue bg-night-blue/25",
                          )}
                        >
                          <span aria-hidden="true">
                            {isBustDoor ? "✕" : isTaken ? "✓" : isTrap && round?.finished ? "✕" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <span
                    className={cn(
                      "figure-num w-16 flex-none text-end text-micro",
                      cleared ? "text-night-green" : isCurrent ? "text-night-text" : "text-night-muted",
                    )}
                  >
                    {formatMultiplier(towerMultiplier(difficulty, floor + 1))}
                  </span>
                </li>
              );
            })}
          </ol>

          <p aria-live="polite" className="mt-4 min-h-[2.5rem] text-small text-night-muted">
            {round && !round.ok ? (
              <span className="text-night-amber">{round.error}</span>
            ) : round?.busted ? (
              <>The door on floor {climbed.length} was the wrong one. Round over.</>
            ) : round?.finished ? (
              <>
                Took{" "}
                <span className="figure-num text-night-green">
                  {formatCrypto(cryptoAmount(BigInt(round.payout ?? "0"), asset))}
                </span>{" "}
                at {formatMultiplier(current)}.
              </>
            ) : playing ? (
              <>
                Take{" "}
                <span className="figure-num text-night-text">
                  {formatCrypto(cryptoAmount(projected, asset))}
                </span>{" "}
                now, or try floor {floorsCleared + 1} for {formatMultiplier(next)}.
              </>
            ) : (
              "Pick a difficulty, set your stake, and start climbing."
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
          demo={demo}
          action={
            playing ? (
              <Button
                tone="night"
                size="lg"
                full
                onClick={collect}
                disabled={pending || climbed.length === 0}
              >
                {climbed.length === 0
                  ? "Clear a floor first"
                  : `Take ${formatCrypto(cryptoAmount(projected, asset))}`}
              </Button>
            ) : (
              <Button
                tone="night"
                size="lg"
                full
                onClick={begin}
                disabled={pending || stake <= 0n || stake > balance}
              >
                {pending ? "Building…" : round?.finished ? "Climb again" : "Start climbing"}
              </Button>
            )
          }
        >
          <div>
            <span className="label-mono text-night-muted">Difficulty</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(Object.keys(TOWER_RULES) as TowerDifficulty[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setDifficulty(level);
                    play("tick");
                  }}
                  aria-pressed={difficulty === level}
                  disabled={playing || pending}
                  className={cn(
                    "tap flex flex-col items-start justify-center rounded-[6px] border px-2.5 py-1.5 transition-colors",
                    difficulty === level
                      ? "border-night-blue bg-night-blue/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  <span className="text-small capitalize">{level}</span>
                  <span className="text-micro opacity-70">{TOWER_RULES[level].label}</span>
                </button>
              ))}
            </div>

            <dl className="mt-5 space-y-1.5 border-t border-night-rule pt-4">
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">First floor pays</dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">
                  {formatMultiplier(towerMultiplier(difficulty, 1))}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">All eight pays</dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">
                  {formatMultiplier(towerMultiplier(difficulty, TOWER_FLOORS))}
                </dd>
              </div>
            </dl>
          </div>
        </BetPanel>
      }
    />
  );
}
