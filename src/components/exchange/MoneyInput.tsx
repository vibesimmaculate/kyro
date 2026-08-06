"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { normaliseAmountInput } from "@/lib/quote/engine";

/**
 * The amount field.
 *
 * Accepts what people type — "1 000,50", "€1000", "1000.5" — and tidies it on
 * blur rather than fighting the caret mid-keystroke. Set in mono at figure size
 * so the number is the loudest thing in the ticket, which it should be.
 */

export interface MoneyInputProps {
  readonly id?: string;
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly suffix?: React.ReactNode;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly tone?: "day" | "night";
  readonly autoFocus?: boolean;
  readonly placeholder?: string;
}

export function MoneyInput({
  id,
  label,
  value,
  onValueChange,
  suffix,
  invalid,
  describedBy,
  tone = "day",
  autoFocus,
  placeholder = "0",
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const night = tone === "night";

  return (
    <div>
      <label
        htmlFor={inputId}
        className={cn("label-mono block", night ? "text-night-muted" : "text-ink-muted")}
      >
        {label}
      </label>

      <div
        className={cn(
          "mt-2 flex items-stretch gap-2 rounded-[8px] border transition-colors duration-[var(--duration-fast)]",
          night ? "border-night-rule-strong bg-night-sunk" : "border-rule-strong bg-surface",
          focused && (night ? "border-night-blue" : "border-blue"),
          invalid && (night ? "border-night-red" : "border-red"),
        )}
      >
        <input
          id={inputId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const tidy = normaliseAmountInput(value);
            if (tidy !== value) onValueChange(tidy);
          }}
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn(
            "figure-num min-w-0 flex-1 bg-transparent px-3 py-2.5 text-figure outline-none",
            "min-h-[3.25rem] placeholder:text-ink-faint",
            night ? "text-night-text placeholder:text-night-muted" : "text-ink",
          )}
        />
        {suffix ? (
          <div
            className={cn(
              "flex flex-none items-center border-s ps-1 pe-1",
              night ? "border-night-rule" : "border-rule",
            )}
          >
            {suffix}
          </div>
        ) : null}
      </div>
    </div>
  );
}
