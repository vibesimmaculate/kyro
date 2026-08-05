import { cn } from "@/lib/cn";

/**
 * KYRO.
 *
 * The full stop is a blue square. That is the whole mark — the brand's
 * plainspoken punctuation made visible, and the same square that marks the
 * active step in the order flow and the bullets in a list. It is never drawn
 * larger than the type it terminates, and it is the only ornament KYRO owns.
 */

const SIZES = {
  sm: { text: "text-[1.0625rem]", square: "h-[0.3125rem] w-[0.3125rem]", gap: "ms-[0.22em]" },
  md: { text: "text-[1.375rem]", square: "h-[0.375rem] w-[0.375rem]", gap: "ms-[0.24em]" },
  lg: { text: "text-[2rem]", square: "h-[0.5rem] w-[0.5rem]", gap: "ms-[0.26em]" },
} as const;

export interface WordmarkProps {
  readonly size?: keyof typeof SIZES;
  readonly tone?: "ink" | "night";
  readonly className?: string;
  /** Hide the square where the mark sits next to other blue elements. */
  readonly showMark?: boolean;
}

export function Wordmark({
  size = "sm",
  tone = "ink",
  className,
  showMark = true,
}: WordmarkProps) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-semibold tracking-[-0.045em] select-none",
        tone === "night" ? "text-night-text" : "text-ink",
        s.text,
        className,
      )}
    >
      KYRO
      {showMark ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block flex-none",
            tone === "night" ? "bg-night-blue" : "bg-blue",
            s.square,
            s.gap,
          )}
        />
      ) : null}
    </span>
  );
}
