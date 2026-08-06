import { AmountReadout } from "@/components/exchange/AmountReadout";
import { FeeReceipt } from "@/components/exchange/FeeReceipt";
import { sampleLocationProvider } from "@/fixtures/locations";
import { CRYPTO, NETWORKS } from "@/lib/money/currencies";
import { formatCrypto, formatRate } from "@/lib/money/format";
import type { Quote } from "@/lib/quote/types";

/**
 * The ticket, held alongside the form.
 *
 * Same receipt as the calculator, minus the controls: at this point the figures
 * are settled and the job of this panel is to stop anyone having to remember
 * what they agreed to two screens ago.
 */
export interface OrderSummaryProps {
  readonly quote: Quote;
  readonly locationSlug?: string;
}

export function OrderSummary({ quote, locationSlug }: OrderSummaryProps) {
  const location = locationSlug ? sampleLocationProvider.bySlug(locationSlug) : undefined;
  const cashToCrypto = quote.direction === "cash-to-crypto";

  return (
    <aside
      aria-label="Your exchange"
      className="rounded-[10px] border border-rule-strong bg-surface"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <h2 className="label-mono text-ink-faint">Your exchange</h2>
        <span className="label-mono text-ink-faint">
          {cashToCrypto ? "Cash → Crypto" : "Crypto → Cash"}
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="label-mono text-ink-muted">You give</p>
        <AmountReadout amount={quote.give} size="md" className="mt-1" />

        <div className="mt-4 border-t border-rule pt-4">
          <p className="label-mono text-ink-muted">
            {cashToCrypto ? "You receive" : "You collect"}
          </p>
          <AmountReadout amount={quote.receive} size="md" className="mt-1" />
        </div>
      </div>

      <div className="border-t border-rule bg-paper-sunk px-4 py-4">
        <FeeReceipt quote={quote} showRate={false} showTotal={false} />
      </div>

      <dl className="border-t border-rule px-4 py-3 text-small">
        <div className="flex items-baseline gap-1.5 py-1">
          <dt className="flex-none text-ink-muted">Coin</dt>
          <span aria-hidden="true" className="leader" />
          <dd className="flex-none">{CRYPTO[quote.asset].name}</dd>
        </div>
        <div className="flex items-baseline gap-1.5 py-1">
          <dt className="flex-none text-ink-muted">Network</dt>
          <span aria-hidden="true" className="leader" />
          <dd className="flex-none">{NETWORKS[quote.network].name}</dd>
        </div>
        {location ? (
          <div className="flex items-baseline gap-1.5 py-1">
            <dt className="flex-none text-ink-muted">Pickup point</dt>
            <span aria-hidden="true" className="leader" />
            <dd className="flex-none text-end">
              {location.city} — {location.branch}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="border-t border-rule px-4 py-3 text-micro text-ink-muted">
        {quote.rateLabel} · {formatRate(quote.rate)}. Network fee{" "}
        {formatCrypto(quote.networkFee)} is a sample value.
      </p>
    </aside>
  );
}
