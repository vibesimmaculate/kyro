"use client";

import { cn } from "@/lib/cn";
import { play, unlockSound } from "@/lib/sound";

/**
 * A row of mutually exclusive choices.
 *
 * Radio semantics rather than buttons, so a keyboard user gets arrow keys and a
 * screen reader is told it is one choice among several — which a row of
 * `<button>`s does not communicate however it is styled.
 */

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Optional second line, for an odds or payout hint. */
  readonly hint?: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
  className,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly name: string;
  readonly className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="label-mono mb-2 text-night-muted">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "tap relative flex min-w-0 cursor-pointer flex-col items-center justify-center",
                "rounded-[8px] border px-2 py-2 text-center transition-all",
                "duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)]/14 text-night-text"
                  : "border-night-rule-strong bg-night-sunk text-night-muted hover:border-night-muted hover:text-night-text",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => {
                  unlockSound();
                  play("select");
                  onChange(option.value);
                }}
                className="sr-only"
              />
              <span className="text-small leading-tight font-medium">{option.label}</span>
              {option.hint ? (
                <span className="figure-num mt-0.5 text-[0.625rem] leading-none opacity-70">
                  {option.hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
