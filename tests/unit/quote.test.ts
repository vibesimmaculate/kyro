import { describe, expect, it } from "vitest";
import {
  buildQuote,
  defaultQuoteDependencies,
  grossCryptoOf,
  isQuoteExpired,
  msRemaining,
  netCashOf,
  normaliseAmountInput,
} from "@/lib/quote/engine";
import { SERVICE_FEE_BP, type QuoteRequest } from "@/lib/quote/types";
import { formatCrypto, formatMoney } from "@/lib/money/format";
import { addMoney, parseCrypto, subCrypto } from "@/lib/money/amounts";

import { allPairs, previewRateProvider, QUOTE_TTL_MS } from "@/lib/rates/preview";
import { FIAT, FIAT_CODES } from "@/lib/money/currencies";

/** NBSP — the group separator the formatter emits. */
const S = " ";

/** Fixed instant so every assertion below is reproducible. */
const AT = Date.UTC(2026, 2, 14, 11, 0, 0);

const base: QuoteRequest = {
  direction: "cash-to-crypto",
  give: "1000",
  fiat: "EUR",
  asset: "BTC",
  network: "bitcoin",
  at: AT,
};

const ok = (req: Partial<QuoteRequest> = {}) => {
  const result = buildQuote({ ...base, ...req });
  if (!result.ok) throw new Error(`Expected a quote, got issues: ${JSON.stringify(result.issues)}`);
  return result.quote;
};

const fail = (req: Partial<QuoteRequest> = {}) => {
  const result = buildQuote({ ...base, ...req });
  if (result.ok) throw new Error("Expected issues, got a quote");
  return result.issues;
};

describe("cash → crypto", () => {
  it("takes exactly 4% and shows the arithmetic that follows", () => {
    const q = ok({ give: "1000" });
    expect(q.serviceFeeBp).toBe(SERVICE_FEE_BP);
    expect(formatMoney(q.serviceFee, { code: false })).toBe("40.00");
    expect(formatMoney(netCashOf(q), { code: false })).toBe("960.00");

    // receive = (gross − fee) ÷ rate − network fee, and the lines must agree.
    expect(subCrypto(grossCryptoOf(q), q.networkFee)).toEqual(q.receive);
    expect(q.networkFeeDeducted).toBe(true);
  });

  it("holds together at €100, €1 000 and €10 000", () => {
    for (const [give, fee] of [
      ["100", "4.00"],
      ["1000", "40.00"],
      ["10000", "400.00"],
    ] as const) {
      const q = ok({ give });
      expect(formatMoney(q.serviceFee, { code: false }), `fee on ${give}`).toBe(fee);
      expect(addMoney(netCashOf(q), q.serviceFee)).toEqual(q.gross);
      expect(q.receive.kind).toBe("crypto");
      if (q.receive.kind === "crypto") expect(q.receive.base).toBeGreaterThan(0n);
    }
  });

  it("never promises more than it will send", () => {
    const q = ok({ give: "1000", asset: "ETH", network: "base" });
    if (q.receive.kind !== "crypto") throw new Error("expected crypto");
    // Floored to ETH's six-place quote precision: the printed figure IS the
    // transferred figure, with no hidden eighteen-decimal tail.
    expect(q.receive.base % 10n ** 12n).toBe(0n);
    expect(formatCrypto(q.receive)).toMatch(/^\d+\.\d{3} \d{3} ETH$/);
  });

  it("refuses rather than quoting a payout the network fee would swallow", () => {
    // The counter minimum keeps this unreachable in practice, so the guard is
    // exercised directly with a deliberately extortionate fee.
    const result = buildQuote(
      { ...base, give: "100", asset: "USDT", network: "ethereum" },
      {
        ...defaultQuoteDependencies,
        networkFees: {
          id: "test",
          isLive: false,
          label: "Test fee",
          getFee: () => parseCrypto("500", "USDT"),
        },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues[0]?.code).toBe("fee-exceeds-amount");
    expect(result.issues[0]?.message).toMatch(/cheaper network/);
  });
});

describe("crypto → cash", () => {
  const cryptoToCash: Partial<QuoteRequest> = {
    direction: "crypto-to-cash",
    give: "0.05",
    asset: "BTC",
    network: "bitcoin",
  };

  it("charges the 4% on the cash side and hands over the rest", () => {
    const q = ok(cryptoToCash);
    expect(q.give.kind).toBe("crypto");
    expect(q.receive.kind).toBe("fiat");
    if (q.receive.kind !== "fiat") throw new Error("expected fiat");
    expect(addMoney(q.receive, q.serviceFee)).toEqual(q.gross);
  });

  it("does not deduct a network fee it does not pay", () => {
    const q = ok(cryptoToCash);
    expect(q.networkFeeDeducted).toBe(false);
    // The line is still present, so the customer knows their wallet will be
    // charged something on top of what they send.
    expect(q.networkFee.base).toBeGreaterThan(0n);
  });

  it("applies the counter limits to the cash value, not the coin count", () => {
    // 0.0001 BTC is a tiny coin amount but the limit is about the cash.
    const issues = fail({ ...cryptoToCash, give: "0.0001" });
    expect(issues[0]?.code).toBe("amount-too-small");
    expect(issues[0]?.message).toMatch(/counter minimum/);
  });
});

describe("input handling", () => {
  it("accepts what people actually type", () => {
    expect(normaliseAmountInput("1 000,50")).toBe("1000.50");
    expect(normaliseAmountInput("€1000")).toBe("1000");
    expect(normaliseAmountInput(" 1234.5 ")).toBe("1234.5");
    expect(normaliseAmountInput("2 000 KM")).toBe("2000");
  });

  it("says something useful when the amount is missing or malformed", () => {
    expect(fail({ give: "" })[0]?.code).toBe("amount-missing");
    expect(fail({ give: "abc" })[0]?.code).toBe("amount-invalid");
    expect(fail({ give: "1e5" })[0]?.code).toBe("amount-invalid");
    for (const issue of fail({ give: "" })) {
      expect(issue.message).toMatch(/^[A-Z]/);
      expect(issue.message).toMatch(/\.$/);
    }
  });

  it("holds the limits at both ends and explains them in money", () => {
    const small = fail({ give: "5" });
    expect(small[0]?.code).toBe("amount-too-small");
    expect(small[0]?.message).toContain("20.00 EUR");

    const large = fail({ give: "20000" });
    expect(large[0]?.code).toBe("amount-too-large");
    expect(large[0]?.message).toContain(`15${S}000.00 EUR`);
  });

  it("rejects an asset and network that do not go together", () => {
    const issues = fail({ asset: "BTC", network: "solana" });
    expect(issues[0]?.code).toBe("network-unsupported");
    expect(issues[0]?.field).toBe("network");
  });
});

describe("quote lifetime", () => {
  it("expires two minutes after it was struck", () => {
    const q = ok();
    expect(q.expiresAt - q.createdAt).toBe(QUOTE_TTL_MS);
    expect(isQuoteExpired(q, AT)).toBe(false);
    expect(isQuoteExpired(q, AT + QUOTE_TTL_MS - 1)).toBe(false);
    expect(isQuoteExpired(q, AT + QUOTE_TTL_MS)).toBe(true);
    expect(msRemaining(q, AT + QUOTE_TTL_MS + 5_000)).toBe(0);
  });

  it("labels its rate as preview and never as live", () => {
    const q = ok();
    expect(q.rateIsLive).toBe(false);
    expect(q.rateLabel).toBe("Preview rate");
  });
});

describe("preview rates", () => {
  it("are identical for the same second and move between minutes", () => {
    const a = previewRateProvider.getRate("EUR", "BTC", AT);
    const b = previewRateProvider.getRate("EUR", "BTC", AT + 1_000);
    const c = previewRateProvider.getRate("EUR", "BTC", AT + 65_000);
    expect(a.value).toEqual(b.value);
    expect(a.value).not.toEqual(c.value);
  });

  it("hold the convertible mark at its legal peg, with no drift", () => {
    // BAM is fixed at 1.95583 to the euro by currency board, so a BAM quote is
    // exactly the EUR quote times the peg at every instant.
    for (const offset of [0, 60_000, 3_600_000]) {
      const eur = previewRateProvider.getRate("EUR", "BTC", AT + offset);
      const bam = previewRateProvider.getRate("BAM", "BTC", AT + offset);
      const ratio = (bam.value.v * 100_000n) / eur.value.v;
      expect(ratio).toBe(195_583n);
    }
  });

  it("quote every supported pair without falling over", () => {
    for (const { fiat, asset } of allPairs()) {
      const r = previewRateProvider.getRate(fiat, asset, AT);
      expect(r.value.v).toBeGreaterThan(0n);
    }
  });
});

describe("every currency the counter accepts", () => {
  it.each(FIAT_CODES)("quotes %s coherently at its own default amount", (fiat) => {
    const q = ok({
      fiat,
      give: FIAT[fiat].defaultAmount,
      asset: "USDT",
      network: "tron",
    });

    // The fee is 4% of the cash side, whichever currency that side is in.
    expect(q.serviceFee.minor * 25n).toBe(q.gross.minor);
    expect(q.receive.kind).toBe("crypto");
    if (q.receive.kind === "crypto") expect(q.receive.base).toBeGreaterThan(0n);
  });

  it.each(FIAT_CODES)("quotes %s the other way round too", (fiat) => {
    const q = ok({
      direction: "crypto-to-cash",
      fiat,
      give: "500",
      asset: "USDT",
      network: "tron",
    });
    expect(addMoney(q.receive as typeof q.gross, q.serviceFee)).toEqual(q.gross);
  });
});
