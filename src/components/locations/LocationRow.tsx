import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  availabilityOf,
  MINUTES_LABEL,
  type Availability,
  type LocalClock,
  type Location,
} from "@/fixtures/locations";

/**
 * One branch, as a row on a printed list.
 *
 * Availability is carried by a word first and a mark second — "Open now" reads
 * the same to someone who cannot tell the green square from the amber one.
 */

const MARK: Record<Availability["state"], string> = {
  open: "bg-green",
  "closing-soon": "bg-amber",
  closed: "bg-ink-faint",
  "opening-soon": "bg-blue",
};

export interface LocationRowProps {
  readonly location: Location;
  readonly clock: LocalClock;
  readonly className?: string;
  readonly compact?: boolean;
}

export function LocationRow({ location, clock, className, compact }: LocationRowProps) {
  const availability = availabilityOf(location, clock);
  const today = location.hours[clock.day] ?? null;
  const both = location.directions.length === 2;

  return (
    <li className={cn("border-t border-rule first:border-t-0", className)}>
      <Link
        href={`/locations/${location.slug}`}
        className={cn(
          "group grid gap-x-6 gap-y-2 py-4 transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-sunk focus-visible:bg-paper-sunk",
          "sm:grid-cols-12 sm:items-baseline",
          compact ? "sm:py-4" : "sm:py-5",
        )}
      >
        <div className="sm:col-span-4">
          <p className="flex items-baseline gap-2 text-subhead font-medium">
            {location.city}
            <span className="text-small font-normal text-ink-muted">{location.branch}</span>
          </p>
          <p className="mt-0.5 text-small text-ink-muted">{location.street}</p>
        </div>

        <div className="sm:col-span-3">
          <p className="label-mono text-ink-faint sm:hidden">Hours</p>
          <p className="figure-num text-small text-ink">
            {today ? `${MINUTES_LABEL(today.open)}–${MINUTES_LABEL(today.close)}` : "Closed today"}
          </p>
          <p className="mt-0.5 text-micro text-ink-muted">{availability.detail}</p>
        </div>

        <div className="sm:col-span-3">
          <p className="label-mono text-ink-faint sm:hidden">Handles</p>
          <p className="text-small text-ink">
            {both
              ? "Cash ↔ crypto"
              : location.directions[0] === "cash-to-crypto"
                ? "Cash → crypto only"
                : "Crypto → cash only"}
          </p>
          <p className="mt-0.5 text-micro text-ink-muted">
            {location.currencies.join(" · ")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:col-span-2 sm:justify-end">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 flex-none", MARK[availability.state])}
            />
            <span className="text-small text-ink">{availability.label}</span>
          </span>
          <span
            aria-hidden="true"
            className="text-ink-faint transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:text-ink"
          >
            →
          </span>
        </div>
      </Link>
    </li>
  );
}
