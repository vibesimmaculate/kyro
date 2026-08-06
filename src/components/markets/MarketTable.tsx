import Link from "next/link";
import { RangeBar } from "@/components/markets/RangeBar";
import { Sparkline } from "@/components/markets/Sparkline";
import { cn } from "@/lib/cn";
import {
  directionOf,
  formatChange,
  formatCompact,
  formatPrice,
} from "@/lib/markets/format";
import { CRYPTO } from "@/lib/money/currencies";
import type { MarketRow } from "@/server/prices";

/**
 * The market table.
 *
 * Built as a table because it is one — a screen reader should be able to say
 * "Bitcoin, price, fifty-five thousand" and mean it, which a grid of divs
 * cannot do however it is labelled. Hairline rules between rows rather than
 * cards, figures right-aligned on a shared decimal axis, and one colour with a
 * job: green up, red down, and nothing else on the page tinted at all.
 *
 * On a phone the secondary columns are dropped rather than scrolled. Volume and
 * capitalisation are context; the price and the day's move are the point, and
 * they should not be pushed off-screen by figures nobody came for.
 */

export function MarketTable({ rows }: { readonly rows: readonly MarketRow[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Live prices in euro for the assets KYRO exchanges, with the 24-hour move
        and a seven-day trend.
      </caption>
      <thead>
        <tr className="border-b border-rule">
          <th scope="col" className="label-mono pb-2 pe-3 text-ink-faint">
            Asset
          </th>
          <th scope="col" className="label-mono pb-2 pe-3 text-end text-ink-faint">
            Price
          </th>
          <th scope="col" className="label-mono pb-2 pe-3 text-end text-ink-faint">
            24h
          </th>
          <th scope="col" className="label-mono hidden pb-2 pe-3 sm:table-cell sm:w-[9.5rem]">
            <span className="text-ink-faint">Day range</span>
          </th>
          <th scope="col" className="label-mono hidden pb-2 pe-3 text-end text-ink-faint md:table-cell">
            Volume
          </th>
          <th scope="col" className="label-mono hidden pb-2 pe-3 text-end text-ink-faint lg:table-cell">
            Market cap
          </th>
          <th scope="col" className="label-mono pb-2 pe-3 text-end text-ink-faint">
            <span className="hidden sm:inline">7 days</span>
            <span className="sm:hidden">7d</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
          const direction = directionOf(row.changePercent24h);
          const asset = CRYPTO[row.asset];

          return (
            <tr key={row.asset} className="border-b border-rule-faint last:border-0">
              <th scope="row" className="py-3.5 pe-3 align-middle font-normal">
                <Link
                  href={`/prices/${row.asset.toLowerCase()}`}
                  className="group inline-flex min-w-0 items-baseline gap-2 rounded-[4px]"
                >
                  <span className="figure-num text-[0.9375rem] font-medium text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">
                    {row.asset}
                  </span>
                  <span className="truncate text-small text-ink-muted">{asset.name}</span>
                </Link>
              </th>

              <td className="figure-num py-3.5 pe-3 text-end align-middle text-[1.0625rem] text-ink">
                {formatPrice(row.eur)}
              </td>

              <td
                className={cn(
                  "figure-num py-3.5 pe-3 text-end align-middle text-[0.9375rem]",
                  direction === "up"
                    ? "text-green"
                    : direction === "down"
                      ? "text-red"
                      : "text-ink-muted",
                )}
              >
                {formatChange(row.changePercent24h)}
              </td>

              <td className="hidden py-3.5 pe-3 align-middle sm:table-cell">
                <RangeBar
                  low={row.low24h}
                  high={row.high24h}
                  current={row.eur}
                  label={
                    row.low24h !== undefined && row.high24h !== undefined
                      ? `24-hour range ${formatPrice(row.low24h)} to ${formatPrice(row.high24h)}, now ${formatPrice(row.eur)}`
                      : "24-hour range unavailable"
                  }
                />
              </td>

              <td className="figure-num hidden py-3.5 pe-3 text-end align-middle text-small text-ink-muted md:table-cell">
                {formatCompact(row.volume24h)}
              </td>

              <td className="figure-num hidden py-3.5 pe-3 text-end align-middle text-small text-ink-muted lg:table-cell">
                {formatCompact(row.marketCap)}
              </td>

              <td className="py-3.5 text-end align-middle">
                <div className="flex justify-end">
                  <Sparkline
                    series={row.sparkline}
                    direction={direction}
                    label={`${asset.name}, seven-day trend, ${
                      direction === "up" ? "up" : direction === "down" ? "down" : "flat"
                    }`}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
