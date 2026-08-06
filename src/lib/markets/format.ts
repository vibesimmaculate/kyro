/**
 * Formatting for market figures.
 *
 * These are display numbers from a price feed, not money KYRO owes anyone, so
 * they are plain JS numbers rather than the fixed-point types the rest of the
 * product insists on. That distinction is the whole reason this file is
 * separate from `lib/money`: nothing here may ever reach a ledger, and keeping
 * the two sets of helpers apart is what stops it happening by accident.
 */

const SPACE = " "; // narrow no-break space, the group separator used throughout

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, SPACE);
}

/**
 * A price in euro, at a precision that suits its magnitude.
 *
 * Five figures is the point at which cents stop carrying information about
 * bitcoin and start being noise; below a euro, four decimals are the only way a
 * stablecoin's peg is legible at all.
 */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const decimals = value >= 10_000 ? 0 : value >= 100 ? 2 : value >= 1 ? 3 : 4;
  const fixed = value.toFixed(decimals);
  const [whole = "0", fraction] = fixed.split(".");
  return `€${group(whole)}${fraction ? `.${fraction}` : ""}`;
}

/** Compact euro, for volume and capitalisation: €1.12tn, €19.4bn, €845m. */
export function formatCompact(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";

  const tiers = [
    { at: 1e12, suffix: "tn" },
    { at: 1e9, suffix: "bn" },
    { at: 1e6, suffix: "m" },
    { at: 1e3, suffix: "k" },
  ] as const;

  for (const tier of tiers) {
    if (value >= tier.at) {
      const scaled = value / tier.at;
      return `€${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}${tier.suffix}`;
    }
  }
  return `€${value.toFixed(0)}`;
}

/** A signed percentage, always with its sign, so a flat day is unambiguous. */
export function formatChange(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export type Direction = "up" | "down" | "flat";

export function directionOf(value: number | undefined): Direction {
  if (value === undefined || !Number.isFinite(value) || Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "up" : "down";
}

/** "2 minutes ago", for the as-of stamp. Coarse on purpose. */
export function formatAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/**
 * Reduces a series to `count` points by averaging within buckets.
 *
 * A week of hourly closes is 168 points drawn into about 120 pixels, which is
 * more path data than the shape can carry. Averaging rather than sampling keeps
 * the line honest — sampling every nth point can drop a spike entirely and draw
 * a calm week that never happened.
 */
export function resample(series: readonly number[], count: number): number[] {
  if (series.length <= count) return [...series];

  const out: number[] = [];
  const size = series.length / count;
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let sum = 0;
    let n = 0;
    for (let j = from; j < to && j < series.length; j += 1) {
      sum += series[j] ?? 0;
      n += 1;
    }
    out.push(n > 0 ? sum / n : (series[from] ?? 0));
  }
  return out;
}
