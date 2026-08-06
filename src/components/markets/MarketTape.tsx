import Link from "next/link";
import { Sparkline } from "@/components/markets/Sparkline";
import { cn } from "@/lib/cn";
import { directionOf, formatChange, formatPrice } from "@/lib/markets/format";
import { getMarkets } from "@/server/prices";

/**
 * The tape.
 *
 * Five prices along the top of the homepage, each a link into the calculator
 * for that asset. It exists because the first question anyone arriving here has
 * is "what is bitcoin worth today", and making them navigate to find out is
 * making them work for something the page already knows.
 *
 * It does not scroll, blink, flash green on tick, or animate. A ticker that
 * moves is a ticker that pulls the eye away from whatever the visitor was
 * actually reading, and this one has to sit above a calculator without
 * competing with it.
 *
 * When the feed is down it renders nothing at all — no skeleton, no placeholder
 * dashes. An empty strip is honest and invisible; a row of em-dashes looks
 * broken and still occupies the space.
 */

export async function MarketTape({ className }: { readonly className?: string }) {
  const markets = await getMarkets();
  if (!markets.snapshot) return null;

  return (
    <div className={cn("border-y border-rule bg-paper-sunk", className)}>
      <div className="shell">
        {/* Scrolls on a phone, where five prices genuinely do not fit; becomes a
            fitted row from `lg` up, where a strip that clipped mid-figure at a
            width with room to spare would just look broken. */}
        <ul
          className={cn(
            "scrollbar-none -mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto py-2.5",
            "lg:justify-between lg:overflow-visible",
          )}
        >
          {markets.snapshot.rows.map((row) => {
            const direction = directionOf(row.changePercent24h);
            return (
              <li key={row.asset} className="min-w-0 flex-none snap-start">
                <Link
                  href={`/prices/${row.asset.toLowerCase()}`}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-[7px] px-3 py-1.5 xl:gap-3",
                    "transition-colors duration-[var(--duration-fast)] hover:bg-paper",
                  )}
                >
                  <span className="label-mono text-ink-faint">{row.asset}</span>
                  <span className="figure-num text-[0.9375rem] text-ink tabular-nums">
                    {formatPrice(row.eur)}
                  </span>
                  <span
                    className={cn(
                      "figure-num text-micro tabular-nums",
                      direction === "up"
                        ? "text-green"
                        : direction === "down"
                          ? "text-red"
                          : "text-ink-muted",
                    )}
                  >
                    {formatChange(row.changePercent24h)}
                  </span>
                  <span className="hidden sm:block lg:hidden xl:block">
                    <Sparkline
                      series={row.sparkline}
                      direction={direction}
                      width={48}
                      height={18}
                      label=""
                    />
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="flex-none snap-start">
            <Link
              href="/prices"
              className={cn(
                "flex h-full items-center rounded-[7px] px-3 text-small text-ink-muted",
                "underline decoration-rule-strong underline-offset-4",
                "transition-colors duration-[var(--duration-fast)] hover:text-ink",
              )}
            >
              All prices
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
