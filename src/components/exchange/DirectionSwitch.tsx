"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/quote/types";

/**
 * Two states, both always visible, both always readable. A segmented control
 * rather than a toggle, because a toggle makes you work out which way it is
 * pointing and this is the first decision anyone makes on the site.
 */

const OPTIONS: ReadonlyArray<{ value: Direction; label: string; sub: string }> = [
  { value: "cash-to-crypto", label: "Cash → Crypto", sub: "You bring cash" },
  { value: "crypto-to-cash", label: "Crypto → Cash", sub: "You send crypto" },
];

export interface DirectionSwitchProps {
  readonly value: Direction;
  readonly onValueChange: (value: Direction) => void;
  readonly tone?: "day" | "night";
  readonly className?: string;
}

export function DirectionSwitch({
  value,
  onValueChange,
  tone = "day",
  className,
}: DirectionSwitchProps) {
  const night = tone === "night";

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as Direction)}
      aria-label="Exchange direction"
      className={cn(
        "grid grid-cols-2 gap-px rounded-[8px] border p-px",
        night ? "border-night-rule-strong bg-night-rule" : "border-rule-strong bg-rule-faint",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              "tap flex flex-col items-center justify-center gap-0.5 rounded-[6px] px-2 py-2",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
              night
                ? selected
                  ? "bg-night-sunk text-night-text"
                  : "bg-night-raised text-night-muted hover:text-night-text"
                : selected
                  ? "bg-surface text-ink"
                  : "bg-paper-sunk text-ink-muted hover:text-ink",
            )}
          >
            <span
              className={cn(
                "text-[0.9375rem] leading-tight",
                selected ? "font-medium" : "font-normal",
              )}
            >
              {option.label}
            </span>
            {/* No opacity here: dimming an already-muted colour is what pushed
                this under the contrast threshold. The tier is carried by size. */}
            <span className="text-micro leading-tight">{option.sub}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
