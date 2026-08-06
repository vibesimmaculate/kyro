import type { Metadata } from "next";
import Link from "next/link";
import { MarketTable } from "@/components/markets/MarketTable";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { formatAge } from "@/lib/markets/format";
import { SERVICE_FEE_BP } from "@/lib/quote/types";
import { getMarkets } from "@/server/prices";
import { requestNow } from "@/server/clock";

/**
 * Prices.
 *
 * The only page on the site that shows a live market figure, and the reasoning
 * behind that limit is worth stating: a price you can look at is a different
 * promise from a price you can trade on. What KYRO can honestly publish is what
 * the market is doing right now, attributed and timestamped. What it charges is
 * fixed at the pickup point, on a quote with an expiry, and that quote is built
 * elsewhere.
 *
 * So this page reports, and links to the calculator. It does not quote.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/prices" },
  title: "Crypto prices",
  description:
    "Live euro prices for Bitcoin, Ethereum, Solana, USDT and USDC, with the 24-hour move and a seven-day trend. Attributed and timestamped.",
};

export default async function PricesPage() {
  const markets = await getMarkets();
  const now = requestNow();
  const feePercent = SERVICE_FEE_BP / 100;

  return (
    <>
      <PageHeader
        eyebrow="Prices"
        title="What the market is doing."
        lead={
          <>
            Euro prices for the five assets KYRO handles, straight from a public
            market feed. This page reports; it does not quote. The rate you
            actually get is fixed when you book, on the{" "}
            <Link href="/exchange" className="underline underline-offset-4">
              calculator
            </Link>
            , and holds until the timer runs out.
          </>
        }
        aside={
          <dl className="border-t border-rule pt-4">
            <div className="flex items-baseline gap-1.5">
              <dt className="flex-none text-small text-ink-muted">Source</dt>
              <span aria-hidden="true" className="leader" />
              <dd className="flex-none text-small text-ink">
                {markets.snapshot?.source ?? "Unavailable"}
              </dd>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <dt className="flex-none text-small text-ink-muted">Updated</dt>
              <span aria-hidden="true" className="leader" />
              <dd className="figure-num flex-none text-small text-ink">
                {markets.snapshot
                  ? formatAge(now - markets.snapshot.fetchedAt)
                  : "—"}
              </dd>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <dt className="flex-none text-small text-ink-muted">KYRO fee</dt>
              <span aria-hidden="true" className="leader" />
              <dd className="figure-num flex-none text-small text-ink">{feePercent}%</dd>
            </div>
          </dl>
        }
      />

      <Section
        index="01"
        title="Markets"
        lead={
          markets.status === "stale"
            ? "The feed is not responding. These are the last figures KYRO received, and they are old enough to be wrong."
            : markets.status === "unavailable"
              ? undefined
              : "Prices in euro. Seven-day trend on the right; the marker in the day range shows where the current price sits between today's low and high."
        }
      >
        {markets.snapshot ? (
          <div className="grid gap-6">
            {markets.status === "stale" ? (
              <p
                role="status"
                className="rounded-[8px] border border-amber/40 bg-amber-wash px-4 py-3 text-small text-ink"
              >
                <strong className="font-medium">Stale.</strong> Last updated{" "}
                {formatAge(now - markets.snapshot.fetchedAt)}. Do not rely on these
                figures until the feed recovers.
              </p>
            ) : null}

            <MarketTable rows={markets.snapshot.rows} />

            <p className="max-w-[68ch] text-small text-ink-muted">
              Figures are supplied by {markets.snapshot.source} and are shown for
              reference. They are a market mid-price: no exchange, KYRO included,
              trades at exactly this number. Volume and capitalisation cover the
              whole market for the asset, not KYRO.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <p
              role="status"
              className="rounded-[8px] border border-rule-strong bg-paper-sunk px-4 py-3 text-small text-ink"
            >
              <strong className="font-medium">Prices are unavailable.</strong> The
              market feed did not respond. Rather than show you a number that might
              be hours old, this page shows nothing.
            </p>
            <p className="max-w-[68ch] text-small text-ink-muted">
              The pickup point is unaffected. Exchange quotes are built independently and
              carry their own expiry, so you can still book an order.
            </p>
          </div>
        )}
      </Section>

      <Section
        index="02"
        title="What you actually pay"
        lead="A market price is not an offer. Here is the difference, stated plainly."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-[1.0625rem] font-medium text-ink">The market price</h3>
            <p className="mt-2 max-w-[46ch] text-small text-ink-muted">
              A mid-point between what buyers are bidding and what sellers are
              asking, averaged across venues. Nobody transacts at it. It moves every
              second and carries no commitment from anyone.
            </p>
          </div>
          <div>
            <h3 className="text-[1.0625rem] font-medium text-ink">KYRO&rsquo;s price</h3>
            <p className="mt-2 max-w-[46ch] text-small text-ink-muted">
              A quote, built when you ask for one, with {feePercent}% of the cash side
              as the fee and the network fee shown separately. It holds for a stated
              time and then expires. What you see on the receipt is what changes
              hands at the pickup point.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/exchange">Get a quote</ButtonLink>
              <ButtonLink href="/fees" variant="secondary">
                How the fee works
              </ButtonLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
