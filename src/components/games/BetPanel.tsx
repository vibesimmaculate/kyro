"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { CRYPTO, type CryptoCode } from "@/lib/money/currencies";
import { crypto as cryptoAmount, parseCrypto } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import { formatMultiplier, payoutFor } from "@/lib/games";
import { play, unlockSound } from "@/lib/sound";

/**
 * The stake controls.
 *
 * Modelled on the panel every game of this kind uses, because the convention is
 * genuinely good: stake at the top, quick adjustments beneath it, the projected
 * payout stated, and one large primary action at the bottom that is the same
 * shape on every game. Someone who has played one of these can play all six
 * without reading anything.
 *
 * Halving and doubling are integer operations, so repeatedly halving a stake
 * can never drift a unit — the same reason the rest of the product refuses
 * floats.
 */

export interface BetPanelProps {
  readonly asset: CryptoCode;
  readonly balance: bigint;
  readonly stake: bigint;
  readonly onStakeChange: (stake: bigint) => void;
  readonly multiplier?: number;
  readonly disabled?: boolean;
  readonly children?: React.ReactNode;
  readonly action: React.ReactNode;
  readonly demo?: boolean;
  /** Extra rows under the projected payout — odds, targets, whatever fits. */
  readonly summary?: React.ReactNode;
}

export function BetPanel({
  asset,
  balance,
  stake,
  onStakeChange,
  multiplier,
  disabled,
  children,
  action,
  demo,
  summary,
}: BetPanelProps) {
  const decimals = CRYPTO[asset].decimals;
  const [text, setText] = useState(() => formatStake(stake, decimals));

  const projected = useMemo(
    () => (multiplier ? payoutFor(stake, multiplier) : undefined),
    [stake, multiplier],
  );

  const tooBig = stake > balance;

  function commit(next: bigint) {
    const clamped = next < 0n ? 0n : next > balance ? balance : next;
    onStakeChange(clamped);
    setText(formatStake(clamped, decimals));
    unlockSound();
    play("tick");
  }

  return (
    <div className="rounded-[12px] border border-night-rule bg-night-raised p-4 sm:p-5">
      {/* ── Stake ──────────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="stake" className="label-mono text-night-muted">
          Stake
        </label>
        <span className="text-micro text-night-muted">
          {demo ? "Demo balance" : "Balance"}{" "}
          <span className="figure-num text-night-text">
            {formatCrypto(cryptoAmount(balance, asset))}
          </span>
        </span>
      </div>

      <div
        className={cn(
          "mt-2 flex items-stretch overflow-hidden rounded-[10px] border transition-colors",
          tooBig ? "border-night-red/60" : "border-night-rule-strong",
          "bg-night-sunk focus-within:border-[var(--accent)]",
        )}
      >
        <input
          id="stake"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            try {
              onStakeChange(parseCrypto(event.target.value || "0", asset).base);
            } catch {
              // Mid-typing values like "0." are not parseable yet; the field
              // keeps what was typed and the stake holds its last good value.
            }
          }}
          onBlur={() => commit(stake)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className={cn(
            "figure-num min-h-[3.5rem] min-w-0 flex-1 bg-transparent px-3.5",
            "text-[1.5rem] text-night-text outline-none disabled:opacity-50",
          )}
        />
        <span className="label-mono flex flex-none items-center border-s border-night-rule px-3.5 text-night-muted">
          {asset}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(
          [
            ["½", () => stake / 2n],
            ["2×", () => stake * 2n],
            ["10%", () => balance / 10n],
            ["Max", () => balance],
          ] as const
        ).map(([label, next]) => (
          <button
            key={label}
            type="button"
            onClick={() => commit(next())}
            disabled={disabled}
            className={cn(
              "tap rounded-[7px] border border-night-rule-strong bg-night-sunk text-small",
              "text-night-muted transition-colors hover:border-night-muted hover:text-night-text",
              "active:translate-y-px disabled:opacity-40",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tooBig ? (
        <p role="alert" className="mt-2 text-micro text-night-red">
          More than your balance.
        </p>
      ) : null}

      {/* ── Game-specific controls ─────────────────────────────────────── */}
      {children ? <div className="mt-5">{children}</div> : null}

      {/* ── What it pays ───────────────────────────────────────────────── */}
      {projected !== undefined && multiplier ? (
        <dl className="mt-5 border-t border-night-rule pt-4">
          <div className="flex items-baseline gap-1.5">
            <dt className="flex-none text-small text-night-muted">
              Pays {formatMultiplier(multiplier)}
            </dt>
            <span aria-hidden="true" className="leader-night" />
            <dd className="figure-num flex-none text-[1.0625rem] font-medium text-night-text">
              {formatCrypto(cryptoAmount(projected, asset))}
            </dd>
          </div>
        </dl>
      ) : null}

      {summary ? <div className="mt-4">{summary}</div> : null}

      <div className="mt-5">{action}</div>
    </div>
  );
}

/**
 * The one primary action, identical on every game.
 *
 * Its own component so the shape, height and press behaviour cannot drift
 * between six separately written boards.
 */
export function PlayButton({
  children,
  onClick,
  disabled,
  variant = "play",
  className,
}: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** `cash` is the take-the-money action: green, and visually distinct. */
  readonly variant?: "play" | "cash";
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[3.5rem] w-full items-center justify-center rounded-[10px] px-5",
        "text-[1.0625rem] font-semibold transition-[transform,filter,background-color]",
        "duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
        "active:translate-y-px active:brightness-95",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "cash"
          ? "bg-night-green text-night-sunk shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28),0_8px_22px_-8px_var(--color-night-green)]"
          : "btn-play",
        className,
      )}
    >
      {children}
    </button>
  );
}

function formatStake(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
