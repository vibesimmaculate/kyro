"use client";

import { useState, useTransition } from "react";
import { AnimatedNumber } from "@/components/games/AnimatedNumber";
import { BetPanel, PlayButton } from "@/components/games/BetPanel";
import { BoardHeader, GameBoard, type HistoryEntry } from "@/components/games/GameBoard";
import { GameLayout } from "@/components/games/GameLayout";
import { pushHistory } from "@/components/games/GameHistory";
import { cn } from "@/lib/cn";
import {
  MULTIPLIER_SCALE,
  TOWER_FLOORS,
  TOWER_RULES,
  formatMultiplier,
  towerMultiplier,
  type TowerDifficulty,
} from "@/lib/games";
import { runDemoTower } from "@/lib/games/demo";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import type { CryptoCode } from "@/lib/money/currencies";
import { celebrate, feedback, play as playSound, unlockSound } from "@/lib/sound";
import { recordRound } from "@/lib/sound/intensity";
import { useGameBalance } from "@/lib/games/use-balance";
import { climbTower, cashOutTower, openTowerRound, type TowerState } from "@/server/games/tower";

/**
 * Tower.
 *
 * Drawn top-down so the climb reads upward. Each cleared floor plays the next
 * note of a rising pentatonic scale — the pitch climbs because the multiplier
 * climbs, which is the whole point of the game and the reason it feels good.
 *
 * The multiplier ladder is visible from the start, so the decision to stop is
 * always made against a number you can already see rather than one revealed
 * after you commit.
 */

const REVEAL_MS = 180;

export function TowerGame({
  asset,
  balance: initialBalance,
  demo,
}: {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  readonly demo?: boolean;
}) {
  const [balance, setBalance] = useGameBalance(initialBalance, demo);
  const [stake, setStake] = useState<bigint>(() => initialBalance / 20n || 1_000_000n);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>("medium");
  const [round, setRound] = useState<TowerState | undefined>();
  const [pending, start] = useTransition();
  const [busyDoor, setBusyDoor] = useState<number | undefined>();
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [shake, setShake] = useState(false);

  const [runner] = useState(() => (demo ? runDemoTower() : undefined));

  const rules = TOWER_RULES[difficulty];
  const playing = Boolean(round?.ok && round.roundId && !round.finished);
  const climbed = round?.climbed ?? [];
  const floorsCleared = round?.busted ? climbed.length - 1 : climbed.length;
  const current = round?.multiplier ?? MULTIPLIER_SCALE;
  const next = round?.nextMultiplier ?? towerMultiplier(difficulty, 1);
  const finished = Boolean(round?.finished);

  const projected = (stake * BigInt(Math.max(current, MULTIPLIER_SCALE))) / BigInt(MULTIPLIER_SCALE);

  function record(state: TowerState) {
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
      if (!state.ok) playSound("lose");
    });
  }

  function applyStep(state: TowerState) {
    setRound(state);
    setBusyDoor(undefined);
    if (state.balance) setBalance(BigInt(state.balance));
    record(state);

    if (state.busted) {
      feedback("break", 0, [45, 30, 70]);
      setShake(true);
      window.setTimeout(() => setShake(false), 700);
    } else if (state.finished) {
      celebrate(state.multiplier ?? 0);
    } else {
      feedback("step", (state.climbed?.length ?? 1) - 1, 10);
    }
  }

  function pick(door: number) {
    if (!playing || !round?.roundId || busyDoor !== undefined) return;
    unlockSound();
    setBusyDoor(door);

    if (demo && runner) {
      // A held beat before the door opens. Without it the answer arrives in the
      // same frame as the tap, and there is no moment to feel.
      window.setTimeout(() => applyStep(runner.climb(door)), REVEAL_MS);
      return;
    }

    start(async () => {
      applyStep(await climbTower(round.roundId as string, door));
    });
  }

  function collect() {
    if (!round?.roundId) return;
    unlockSound();

    const settle = (state: TowerState) => {
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
      settle(await cashOutTower(round.roundId as string));
    });
  }

  // Rendered top-first: floor 8 at the top of the screen.
  const floors = Array.from({ length: TOWER_FLOORS }, (_, i) => TOWER_FLOORS - 1 - i);

  return (
    <GameLayout
      game="tower"
      board={
        <GameBoard
          game="tower"
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
              <>The door on floor {climbed.length} was the wrong one.</>
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
                , or try floor {floorsCleared + 1} for {formatMultiplier(next)}.
              </>
            ) : (
              "Pick a difficulty, set your stake, and start climbing."
            )
          }
        >
          <BoardHeader
            label={
              playing
                ? `Floor ${floorsCleared + 1} of ${TOWER_FLOORS}`
                : finished
                  ? round?.busted
                    ? `Fell on floor ${climbed.length}`
                    : `Cleared ${floorsCleared} ${floorsCleared === 1 ? "floor" : "floors"}`
                  : rules.label
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

          <ol className="mt-4 space-y-1.5" aria-label="Tower floors, highest first">
            {floors.map((floor) => {
              const cleared = floor < floorsCleared;
              const isCurrent = playing && floor === floorsCleared;
              const takenDoor = climbed[floor];
              const trapsHere = round?.traps?.[floor];
              const bustFloor = round?.busted && floor === climbed.length - 1;

              return (
                <li
                  key={floor}
                  className={cn(
                    "flex items-center gap-2 rounded-[8px] px-1.5 py-1 transition-colors",
                    isCurrent && "bg-[var(--accent)]/8",
                  )}
                >
                  <span
                    className={cn(
                      "figure-num w-7 flex-none text-micro",
                      isCurrent ? "text-[var(--accent)]" : "text-night-muted",
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
                      const opening = busyDoor === door && isCurrent;

                      return (
                        <button
                          key={door}
                          type="button"
                          onClick={() => pick(door)}
                          disabled={!isCurrent || busyDoor !== undefined}
                          aria-label={`Floor ${floor + 1}, door ${door + 1}`}
                          className={cn(
                            "flex h-10 items-center justify-center rounded-[7px] border text-[0.8125rem]",
                            "transition-[transform,border-color,background-color,box-shadow]",
                            "duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
                            "disabled:cursor-default",
                            isBustDoor && "glow-lose border-night-red bg-night-red/25 text-night-red",
                            !isBustDoor &&
                              isTaken &&
                              "glow-win border-night-green/60 bg-night-green/18 text-night-green",
                            !isBustDoor &&
                              !isTaken &&
                              isTrap &&
                              finished &&
                              "border-night-rule bg-night-sunk text-night-muted opacity-60",
                            !isTaken &&
                              !isTrap &&
                              isCurrent &&
                              "tile-idle border-[var(--accent)]/50 hover:tile-idle-hover hover:-translate-y-0.5 hover:border-[var(--accent)]",
                            !isTaken && !isCurrent && !finished && "tile-idle opacity-40",
                            !isTaken && !isTrap && finished && "border-night-rule bg-night-sunk opacity-55",
                            opening && "border-[var(--accent)] bg-[var(--accent)]/30",
                          )}
                          style={
                            opening
                              ? { animation: "kyro-flip-out 180ms var(--ease-out-quiet) forwards" }
                              : isTaken || isBustDoor
                                ? { animation: "kyro-pop var(--duration-base) var(--ease-out-quiet)" }
                                : undefined
                          }
                        >
                          <span aria-hidden="true">
                            {isBustDoor ? "✕" : isTaken ? "✓" : isTrap && finished ? "✕" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <span
                    className={cn(
                      "figure-num w-16 flex-none text-end text-micro transition-colors",
                      cleared
                        ? "text-night-green"
                        : isCurrent
                          ? "text-night-text"
                          : "text-night-muted",
                    )}
                  >
                    {formatMultiplier(towerMultiplier(difficulty, floor + 1))}
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
          disabled={playing || pending}
          demo={demo}
          summary={
            <dl className="space-y-1.5 border-t border-night-rule pt-4">
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">
                  {playing ? "Take now" : "First floor pays"}
                </dt>
                <span aria-hidden="true" className="leader-night" />
                <dd
                  className={cn(
                    "figure-num flex-none text-small",
                    playing && "text-night-green",
                  )}
                >
                  {formatMultiplier(playing ? current : towerMultiplier(difficulty, 1))}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="flex-none text-small text-night-muted">
                  {playing ? "One more floor" : "All eight pays"}
                </dt>
                <span aria-hidden="true" className="leader-night" />
                <dd className="figure-num flex-none text-small">
                  {formatMultiplier(playing ? next : towerMultiplier(difficulty, TOWER_FLOORS))}
                </dd>
              </div>
            </dl>
          }
          action={
            playing ? (
              <PlayButton
                variant="cash"
                onClick={collect}
                disabled={pending || climbed.length === 0}
              >
                {climbed.length === 0
                  ? "Clear a floor first"
                  : `Take ${formatCrypto(cryptoAmount(projected, asset))}`}
              </PlayButton>
            ) : (
              <PlayButton onClick={begin} disabled={pending || stake <= 0n || stake > balance}>
                {pending ? "Building…" : finished ? "Climb again" : "Start climbing"}
              </PlayButton>
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
                    unlockSound();
                    playSound("tick");
                  }}
                  aria-pressed={difficulty === level}
                  disabled={playing || pending}
                  className={cn(
                    "tap flex flex-col items-start justify-center rounded-[8px] border px-3 py-2",
                    "transition-colors active:translate-y-px",
                    difficulty === level
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-night-text"
                      : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
                  )}
                >
                  <span className="text-small capitalize">{level}</span>
                  <span className="text-micro opacity-70">{TOWER_RULES[level].label}</span>
                </button>
              ))}
            </div>
          </div>
        </BetPanel>
      }
    />
  );
}
