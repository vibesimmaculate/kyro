"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { CRYPTO, type CryptoCode } from "@/lib/money/currencies";
import { crypto as cryptoAmount, parseCrypto } from "@/lib/money/amounts";
import { formatCrypto } from "@/lib/money/format";
import { formatMultiplier, payoutFor } from "@/lib/games";

/**
 * The stake controls.
 *
 * Halve and double are there because they are what people actually reach for,
 * and doing the arithmetic in integers means repeatedly halving a stake can
 * never drift a unit. The projected payout updates as the stake does, so the
 * number is on screen before the bet is placed rather than after.
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
}: BetPanelProps) {
  const decimals = CRYPTO[asset].decimals;
  const [text, setText] = useState(() => formatStake(stake, decimals));

  const projected = useMemo(
    () => (multiplier ? payoutFor(stake, multiplier) : undefined),
    [stake, multiplier],
  );

  function commit(next: bigint) {
    const clamped = next < 0n ? 0n : next > balance ? balance : next;
    onStakeChange(clamped);
    setText(formatStake(clamped, decimals));
  }

  return (
    <div className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="stake" className="label-mono text-night-muted">
          Stake
        </label>
        <span className="text-micro text-night-muted">
          Balance{" "}
          <span className="figure-num text-night-text">
            {formatCrypto(cryptoAmount(balance, asset))}
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-stretch gap-2">
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
            "figure-num min-h-[3.25rem] min-w-0 flex-1 rounded-[8px] border border-night-rule-strong",
            "bg-night-sunk px-3 text-[1.375rem] text-night-text outline-none",
            "transition-colors focus:border-night-blue disabled:opacity-50",
          )}
        />
        <span className="label-mono flex flex-none items-center rounded-[8px] border border-night-rule bg-night-sunk px-3 text-night-muted">
          {asset}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <StakeButton onClick={() => commit(stake / 2n)} disabled={disabled}>
          ½
        </StakeButton>
        <StakeButton onClick={() => commit(stake * 2n)} disabled={disabled}>
          2×
        </StakeButton>
        <StakeButton onClick={() => commit(balance / 10n)} disabled={disabled}>
          10%
        </StakeButton>
        <StakeButton onClick={() => commit(balance)} disabled={disabled}>
          Max
        </StakeButton>
      </div>

      {children ? <div className="mt-5">{children}</div> : null}

      {projected !== undefined && multiplier ? (
        <dl className="mt-5 border-t border-night-rule pt-4">
          <div className="flex items-baseline gap-1.5">
            <dt className="flex-none text-small text-night-muted">
              Pays {formatMultiplier(multiplier)}
            </dt>
            <span aria-hidden="true" className="leader-night" />
            <dd className="figure-num flex-none text-[1.0625rem] font-medium">
              {formatCrypto(cryptoAmount(projected, asset))}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-5">{action}</div>
    </div>
  );
}

function StakeButton({
  onClick,
  disabled,
  children,
}: {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="secondary" tone="night" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

function formatStake(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
