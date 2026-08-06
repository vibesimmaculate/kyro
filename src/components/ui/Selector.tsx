"use client";

import * as Select from "@radix-ui/react-select";
import { cn } from "@/lib/cn";

/**
 * One selector, used for currency, asset, network and location.
 *
 * Radix supplies the keyboard behaviour and the listbox semantics; everything
 * visible is KYRO's. The trigger is a rectangle with a hairline and a small
 * drawn chevron — no rounded pill, no floating panel, no icon library.
 */

export interface SelectorOption {
  readonly value: string;
  /** The primary line — usually a code, set in mono. */
  readonly label: string;
  /** The secondary line, in prose. */
  readonly caption?: string;
  /** Small right-aligned note, e.g. "Low fee". */
  readonly note?: string;
  readonly disabled?: boolean;
  readonly group?: string;
}

export interface SelectorProps {
  readonly id?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectorOption[];
  readonly ariaLabel: string;
  readonly tone?: "day" | "night";
  /** `code` sets the trigger in mono — for EUR, BTC and the like. */
  readonly display?: "code" | "text";
  readonly size?: "md" | "lg";
  readonly className?: string;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly describedBy?: string;
}

function Chevron({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 6"
      className={cn("h-[6px] w-[10px] flex-none", className)}
      fill="none"
    >
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
    </svg>
  );
}

export function Selector({
  id,
  value,
  onValueChange,
  options,
  ariaLabel,
  tone = "day",
  display = "text",
  size = "md",
  className,
  disabled,
  placeholder,
  describedBy,
}: SelectorProps) {
  const night = tone === "night";
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const selected = options.find((o) => o.value === value);

  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        id={id}
        // The field's purpose and its current value, together: a reader
        // announces "Network, Bitcoin, combobox" rather than one or the other.
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        aria-describedby={describedBy}
        className={cn(
          "tap group inline-flex w-full items-center justify-between gap-2 rounded-[8px] border px-3 text-start",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-quiet)]",
          "disabled:pointer-events-none disabled:opacity-50",
          size === "lg" ? "min-h-[3.25rem] text-[1.0625rem]" : "min-h-11 text-[0.9375rem]",
          night
            ? "border-night-rule-strong bg-night-raised text-night-text hover:border-night-muted data-[state=open]:border-night-blue"
            : "border-rule-strong bg-surface text-ink hover:border-ink/40 data-[state=open]:border-blue",
          display === "code" && "font-mono font-medium tracking-[0.01em]",
          className,
        )}
      >
        {/* Rendered directly rather than through Select.Value: the value must
            be legible before the listbox has ever been opened. */}
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            selected.label
          ) : (
            <span className={night ? "text-night-muted" : "text-ink-faint"}>
              {placeholder ?? "Choose"}
            </span>
          )}
        </span>
        <Select.Icon asChild>
          <Chevron
            className={cn(
              "transition-transform duration-[var(--duration-fast)] group-data-[state=open]:rotate-180",
              night ? "text-night-muted" : "text-ink-muted",
            )}
          />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] w-[max(var(--radix-select-trigger-width),15rem)] overflow-hidden rounded-[8px] border",
            "data-[state=open]:animate-[kyro-panel-in_var(--duration-base)_var(--ease-out-quiet)]",
            night
              ? "border-night-rule-strong bg-night-raised text-night-text shadow-[var(--shadow-night)]"
              : "border-rule-strong bg-surface text-ink shadow-[var(--shadow-lift)]",
          )}
        >
          <Select.ScrollUpButton
            className={cn(
              "flex h-6 items-center justify-center border-b",
              night ? "border-night-rule" : "border-rule-faint",
            )}
          >
            <Chevron className="rotate-180" />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1">
            {groups.map((group) => {
              const items = options.filter((o) => (o.group ?? "") === group);
              const body = items.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "relative flex min-h-11 cursor-default select-none items-center gap-3 rounded-[5px] px-2.5 py-1.5 outline-none",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                    night
                      ? "data-[highlighted]:bg-night-rule data-[state=checked]:bg-night-rule"
                      : "data-[highlighted]:bg-paper-sunk data-[state=checked]:bg-blue-wash",
                  )}
                >
                  {/* The brand square marks the selection — no tick icon. */}
                  <Select.ItemIndicator asChild>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute start-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2",
                        night ? "bg-night-blue" : "bg-blue",
                      )}
                    />
                  </Select.ItemIndicator>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <Select.ItemText>
                      <span
                        className={cn(
                          "truncate text-[0.9375rem]",
                          display === "code" && "font-mono font-medium",
                        )}
                      >
                        {option.label}
                      </span>
                    </Select.ItemText>
                    {option.caption ? (
                      <span
                        className={cn(
                          "truncate text-micro",
                          night ? "text-night-muted" : "text-ink-muted",
                        )}
                      >
                        {option.caption}
                      </span>
                    ) : null}
                  </span>

                  {option.note ? (
                    <span
                      className={cn(
                        "label-mono flex-none",
                        night ? "text-night-muted" : "text-ink-faint",
                      )}
                    >
                      {option.note}
                    </span>
                  ) : null}
                </Select.Item>
              ));

              if (!group) return body;
              return (
                <Select.Group key={group}>
                  <Select.Label
                    className={cn(
                      "label-mono px-2.5 pb-1 pt-2.5",
                      night ? "text-night-muted" : "text-ink-faint",
                    )}
                  >
                    {group}
                  </Select.Label>
                  {body}
                </Select.Group>
              );
            })}
          </Select.Viewport>

          <Select.ScrollDownButton
            className={cn(
              "flex h-6 items-center justify-center border-t",
              night ? "border-night-rule" : "border-rule-faint",
            )}
          >
            <Chevron />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
