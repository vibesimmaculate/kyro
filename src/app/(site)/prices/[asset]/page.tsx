import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChart } from "@/components/markets/PriceChart";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  directionOf,
  formatAge,
  formatChange,
  formatCompact,
  formatPrice,
} from "@/lib/markets/format";
import { CRYPTO, isCryptoCode, NETWORKS } from "@/lib/money/currencies";
import { requestNow } from "@/server/clock";
import { CHART_RANGES, getHistory, getMarkets, type ChartRange } from "@/server/prices";

/**
 * One asset, in full.
 *
 * Reached by tapping a row on /prices, which is the obvious thing to do to a
 * row of numbers and did nothing at all until now.
 *
 * The chart is here because "is this a reasonable moment to change money" is a
 * fair question and a single spot price cannot answer it. What is not here is
 * anything that would make this a trading screen: no indicators, no order book,
 * no depth, no leverage. A shape, a range, and what it costs at the counter.
 */

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ asset: string }>;
}): Promise<Metadata> {
  const { asset } = await params;
  const code = asset.toUpperCase();
  if (!isCryptoCode(code)) return {};

  const name = CRYPTO[code].name;
  return {
    alternates: { canonical: `/prices/${asset.toLowerCase()}` },
    title: `${name} price`,
    description: `The ${name} (${code}) price in euro, with the 24-hour move, the day's range and charts over 24 hours to a year. Attributed and timestamped.`,
  };
}

export default async function AssetPricePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ asset: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { asset } = await params;
  const code = asset.toUpperCase();
  if (!isCryptoCode(code)) notFound();

  const query = await searchParams;
  const requested = Array.isArray(query.range) ? query.range[0] : query.range;
  const range: ChartRange = CHART_RANGES.some((option) => option.days === requested)
    ? (requested as ChartRange)
    : "30";

  const [markets, history] = await Promise.all([getMarkets(), getHistory(code, range)]);
  const row = markets.snapshot?.rows.find((entry) => entry.asset === code);
  const meta = CRYPTO[code];
  const now = requestNow();
  const direction = directionOf(row?.changePercent24h);
  const rangeLabel = CHART_RANGES.find((option) => option.days === range)?.label ?? "30 days";

  return (
    <>
      <PageHeader
        eyebrow={`${code} · ${meta.name}`}
        title={row ? formatPrice(row.eur) : "Price unavailable"}
        lead={
          row ? (
            <>
              <span
                className={cn(
                  "figure-num",
                  direction === "up"
                    ? "text-green"
                    : direction === "down"
                      ? "text-red"
                      : "text-ink-muted",
                )}
              >
                {formatChange(row.changePercent24h)}
              </span>{" "}
              over 24 hours. This is a market mid-price, shown for reference —
              nobody, KYRO included, transacts at it. What you pay is a quote,
              fixed when you book.
            </>
          ) : (
            "The market feed did not respond. Rather than show a figure that might be hours old, this page shows none."
          )
        }
        aside={
          <dl className="border-t border-rule pt-4">
            {[
              ["24h high", row?.high24h === undefined ? "—" : formatPrice(row.high24h)],
              ["24h low", row?.low24h === undefined ? "—" : formatPrice(row.low24h)],
              ["24h volume", formatCompact(row?.volume24h)],
              ["Market cap", formatCompact(row?.marketCap)],
              [
                "Updated",
                markets.snapshot ? formatAge(now - markets.snapshot.fetchedAt) : "—",
              ],
            ].map(([term, value]) => (
              <div key={term} className="flex items-baseline gap-1.5 not-first:mt-2">
                <dt className="flex-none text-small text-ink-muted">{term}</dt>
                <span aria-hidden="true" className="leader" />
                <dd className="figure-num flex-none text-small text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        }
      />

      <Section
        index="01"
        title={`${meta.name} over ${rangeLabel.toLowerCase()}`}
        lead="Euro, from a public market feed. The shape, not a signal — a chart of the past is not a forecast, and this one is not offered as one."
      >
        <div className="grid gap-5">
          {/* Plain links rather than a client-side toggle: each range is its
              own cached page, so switching is a navigation the server has
              already done the work for. */}
          <nav aria-label="Chart range">
            <ul className="flex flex-wrap gap-1.5">
              {CHART_RANGES.map((option) => {
                const selected = option.days === range;
                return (
                  <li key={option.days}>
                    <Link
                      href={`/prices/${code.toLowerCase()}?range=${option.days}`}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "tap flex min-h-11 items-center rounded-[8px] border px-3.5 text-small transition-colors",
                        selected
                          ? "border-ink bg-ink text-paper"
                          : "border-rule-strong text-ink-muted hover:border-ink-muted hover:text-ink",
                      )}
                    >
                      {option.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {history ? (
            <PriceChart
              history={history}
              label={`${meta.name} price in euro over ${rangeLabel.toLowerCase()}`}
            />
          ) : (
            <p
              role="status"
              className="rounded-[8px] border border-rule-strong bg-paper-sunk px-4 py-3 text-small text-ink"
            >
              <strong className="font-medium">No chart available.</strong> The history
              feed did not respond.
            </p>
          )}
        </div>
      </Section>

      <Section
        index="02"
        title={`Exchanging ${meta.name}`}
        lead="What KYRO actually does with this asset."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <dl className="border-t border-rule pt-4">
            {[
              ["Ticker", code],
              ["Decimals", String(meta.decimals)],
              [
                "Networks",
                meta.networks.map((network) => NETWORKS[network].name).join(", "),
              ],
            ].map(([term, value]) => (
              <div key={term} className="flex items-baseline gap-1.5 not-first:mt-2">
                <dt className="flex-none text-small text-ink-muted">{term}</dt>
                <span aria-hidden="true" className="leader" />
                <dd className="flex-none text-end text-small text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="max-w-[46ch] text-small text-ink-muted">
              Bring cash to a pickup point and leave with {meta.name} in your own
              wallet, or send {code} and collect cash. One fee of 4% on the cash
              side, the network fee shown separately, and a quote that holds until
              its timer runs out.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href={`/exchange?asset=${code}`}>Exchange {code}</ButtonLink>
              <ButtonLink href="/prices" variant="secondary">
                All prices
              </ButtonLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
