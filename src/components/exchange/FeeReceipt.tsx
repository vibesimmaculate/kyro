import { cn } from "@/lib/cn";
import {
  formatBasisPoints,
  formatCrypto,
  formatMoney,
  formatRate,
} from "@/lib/money/format";
import { grossCryptoOf, netCashOf } from "@/lib/quote/engine";
import type { Quote } from "@/lib/quote/types";

/**
 * The printed half of the ticket.
 *
 * Label on the left, figure on the right, a dotted leader carrying the eye
 * between them — the way a bill has always worked. Every line is legible on its
 * own; nothing is hidden behind a tooltip, because a fee you have to hover to
 * discover is a fee you are hiding.
 */

export interface ReceiptRowProps {
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly emphasis?: "normal" | "strong" | "total";
  readonly tone?: "day" | "night";
  readonly signed?: "minus" | "plus";
  readonly muted?: boolean;
}

export function ReceiptRow({
  label,
  value,
  caption,
  emphasis = "normal",
  tone = "day",
  signed,
  muted,
}: ReceiptRowProps) {
  const night = tone === "night";
  const total = emphasis === "total";

  return (
    <div className={cn(total && "pt-1")}>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "flex-none",
            total ? "text-[0.9375rem] font-medium" : "text-small",
            muted
              ? night
                ? "text-night-muted"
                : "text-ink-muted"
              : night
                ? "text-night-text"
                : "text-ink",
          )}
        >
          {label}
        </span>
        <span aria-hidden="true" className={night ? "leader-night" : "leader"} />
        <span
          className={cn(
            "figure-num flex-none whitespace-nowrap tabular-nums",
            total
              ? "text-[1.0625rem] font-medium"
              : emphasis === "strong"
                ? "text-[0.9375rem] font-medium"
                : "text-small",
            muted
              ? night
                ? "text-night-muted"
                : "text-ink-muted"
              : night
                ? "text-night-text"
                : "text-ink",
          )}
        >
          {signed === "minus" ? "−" : signed === "plus" ? "+" : ""}
          {value}
        </span>
      </div>
      {caption ? (
        <p
          className={cn(
            "mt-0.5 text-micro",
            night ? "text-night-muted" : "text-ink-muted",
          )}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export interface FeeReceiptProps {
  readonly quote: Quote;
  readonly tone?: "day" | "night";
  /** Adds the rate line at the top. Off inside the flow, where it is above. */
  readonly showRate?: boolean;
  /**
   * Off where a large readout of the same figure follows immediately, so the
   * final number is stated once and lands with full weight.
   */
  readonly showTotal?: boolean;
  readonly className?: string;
}

export function FeeReceipt({
  quote,
  tone = "day",
  showRate = true,
  showTotal = true,
  className,
}: FeeReceiptProps) {
  const night = tone === "night";
  const cashToCrypto = quote.direction === "cash-to-crypto";

  return (
    <div className={cn("space-y-2.5", className)}>
      {showRate ? (
        <ReceiptRow
          tone={tone}
          muted
          label={quote.rateLabel}
          value={formatRate(quote.rate).replace(/^1 \w+ = /, "")}
          caption={`Per 1 ${quote.asset}. Held for the life of this quote.`}
        />
      ) : null}

      <ReceiptRow
        tone={tone}
        label={cashToCrypto ? "You exchange" : "Value at this rate"}
        value={formatMoney(quote.gross)}
      />

      <ReceiptRow
        tone={tone}
        label={`Service fee ${formatBasisPoints(quote.serviceFeeBp)}`}
        value={formatMoney(quote.serviceFee)}
        signed="minus"
      />

      {cashToCrypto ? (
        <>
          <ReceiptRow
            tone={tone}
            muted
            label="Converted"
            value={formatCrypto(grossCryptoOf(quote))}
            caption={`${formatMoney(netCashOf(quote))} after the fee, at the rate above.`}
          />
          <ReceiptRow
            tone={tone}
            label="Network fee"
            value={formatCrypto(quote.networkFee)}
            signed="minus"
            caption={`Paid by KYRO to move your ${quote.asset} on ${quote.network}. Sample value.`}
          />
        </>
      ) : (
        <ReceiptRow
          tone={tone}
          muted
          label="Network fee"
          value={formatCrypto(quote.networkFee)}
          caption="Charged by the network to your own wallet when you send. KYRO does not deduct it. Sample value."
        />
      )}

      {showTotal ? (
        <div className={cn("border-t pt-2.5", night ? "border-night-rule" : "border-rule")}>
          <ReceiptRow
            tone={tone}
            emphasis="total"
            label="You receive"
            value={
              quote.receive.kind === "fiat"
                ? formatMoney(quote.receive)
                : formatCrypto(quote.receive)
            }
          />
        </div>
      ) : null}
    </div>
  );
}
