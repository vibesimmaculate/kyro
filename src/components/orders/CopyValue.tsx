"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A value someone has to check character by character, and probably copy.
 *
 * Set in mono, broken into groups of four, and copyable in one tap. The
 * confirmation is a word rather than a fleeting icon, and it is announced, so
 * the feedback reaches someone who cannot see the button change.
 */
export interface CopyValueProps {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
  readonly compact?: boolean;
  readonly tone?: "day" | "night";
}

export function CopyValue({ value, label, className, compact, tone = "day" }: CopyValueProps) {
  const night = tone === "night";
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard access refused — the value is on screen and selectable, so
      // there is nothing to recover from and nothing worth alarming anyone with.
    }
  }

  const groups = value.match(/.{1,4}/g) ?? [value];

  return (
    <div className={className}>
      <div
        className={cn(
          "rounded-[8px] border p-3",
          night ? "border-night-rule bg-night-sunk" : "border-rule bg-paper-sunk",
          compact && "p-2.5",
        )}
      >
        <p
          className={cn(
            "figure-num flex flex-wrap gap-x-2 gap-y-1 break-all",
            compact ? "text-small" : "text-[0.9375rem]",
          )}
        >
          {groups.map((chunk, i) => (
            <span key={`${chunk}-${i}`}>{chunk}</span>
          ))}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className={cn(
            "tap inline-flex items-center rounded-[6px] border px-3 text-small",
            "transition-colors duration-[var(--duration-fast)] active:translate-y-px",
            night
              ? "border-night-rule-strong bg-night-raised text-night-text hover:border-night-muted"
              : "border-rule-strong bg-surface text-ink hover:bg-paper-sunk",
          )}
        >
          {copied ? "Copied" : `Copy ${label.toLowerCase()}`}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? `${label} copied to the clipboard` : ""}
        </span>
      </div>
    </div>
  );
}
