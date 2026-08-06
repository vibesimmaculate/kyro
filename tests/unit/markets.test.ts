import { afterEach, describe, expect, it } from "vitest";
import {
  directionOf,
  formatChange,
  formatCompact,
  formatPrice,
  resample,
} from "@/lib/markets/format";
import {
  createRateProvider,
  previewRateProvider,
  setDefaultAnchors,
} from "@/lib/rates/preview";
import { buildQuote } from "@/lib/quote/engine";

const AT = Date.UTC(2026, 7, 6, 12, 0, 0);

/** Narrow no-break space. Spelled out, because it is invisible in a diff. */
const GROUP = " ";

/** A rate as a plain decimal string, for readable assertions. */
const value = (fixed: { v: bigint; s: number }): string => {
  const digits = fixed.v.toString().padStart(fixed.s + 1, "0");
  const whole = digits.slice(0, digits.length - fixed.s);
  return `${whole}.${digits.slice(digits.length - fixed.s)}`;
};

afterEach(() => {
  setDefaultAnchors(undefined);
});

describe("market formatting", () => {
  it("scales precision to magnitude", () => {
    // Cents on a €55 000 asset are noise; four places on a stablecoin are the
    // only way its peg is legible at all.
    expect(formatPrice(55810)).toBe(`€55${GROUP}810`);
    expect(formatPrice(1641.123)).toBe(`€1${GROUP}641.12`);
    expect(formatPrice(63.5504)).toBe("€63.550");
    expect(formatPrice(0.86482)).toBe("€0.8648");
  });

  it("groups thousands with a narrow no-break space", () => {
    expect(formatPrice(1120000)).toBe(`€1${GROUP}120${GROUP}000`);
  });

  it("refuses to invent a figure it does not have", () => {
    expect(formatPrice(Number.NaN)).toBe("—");
    expect(formatCompact(undefined)).toBe("—");
    expect(formatChange(undefined)).toBe("—");
  });

  it("abbreviates large figures", () => {
    expect(formatCompact(1.12e12)).toBe("€1.12tn");
    expect(formatCompact(1.94e10)).toBe("€19.4bn");
    expect(formatCompact(8.45e8)).toBe("€845m");
  });

  it("always signs a change, so a flat day is unambiguous", () => {
    expect(formatChange(1.3)).toBe("+1.30%");
    expect(formatChange(-0.9)).toBe("−0.90%");
    expect(formatChange(0)).toBe("0.00%");
  });

  it("treats an imperceptible move as flat", () => {
    expect(directionOf(0.001)).toBe("flat");
    expect(directionOf(0.4)).toBe("up");
    expect(directionOf(-0.4)).toBe("down");
  });

  it("averages rather than samples when reducing a series", () => {
    // Sampling every nth point can drop a spike entirely and draw a calm week
    // that never happened; averaging cannot.
    const spiky = [1, 1, 1, 9, 1, 1, 1, 1];
    const reduced = resample(spiky, 4);
    expect(reduced).toHaveLength(4);
    expect(Math.max(...reduced)).toBeGreaterThan(1);
  });

  it("leaves a short series alone", () => {
    expect(resample([1, 2, 3], 96)).toEqual([1, 2, 3]);
  });
});

describe("live rate anchors", () => {
  it("prices against the feed when one is registered", () => {
    const live = createRateProvider({ BTC: "55810.000000000000" });
    const rate = live.getRate("EUR", "BTC", AT);
    expect(value(rate.value)).toContain("55810");
    expect(live.isLive).toBe(true);
    expect(live.label).toBe("Live rate");
  });

  it("falls back to preview, and says so, with no feed", () => {
    const provider = createRateProvider();
    expect(provider.isLive).toBe(false);
    expect(provider.label).toBe("Preview rate");
  });

  it("holds a live price still instead of drifting it", () => {
    // Drift exists to make an invented number behave like a market. Applying it
    // on top of a real one would be adding noise to a signal.
    const live = createRateProvider({ ETH: "1641.120000000000" });
    const a = live.getRate("EUR", "ETH", AT);
    const b = live.getRate("EUR", "ETH", AT + 65_000);
    expect(value(a.value)).toBe(value(b.value));
  });

  it("still drifts an asset the feed did not return", () => {
    const partial = createRateProvider({ BTC: "55810.000000000000" });
    const a = partial.getRate("EUR", "SOL", AT);
    const b = partial.getRate("EUR", "SOL", AT + 65_000);
    expect(value(a.value)).not.toBe(value(b.value));
  });

  it("keeps the mark peg exact, live feed or not", () => {
    // 1.95583 is fixed by currency board, not quoted by a market, so it must
    // not move under either provider.
    const live = createRateProvider({ USDC: "0.865200000000" });
    const a = live.getRate("BAM", "USDC", AT);
    const b = live.getRate("BAM", "USDC", AT + 65_000);
    expect(value(a.value)).toBe(value(b.value));
  });

  it("routes registered anchors through every quote built by default", () => {
    // The whole point of the ambient default: a ticker and a calculator on the
    // same screen must never show two different prices for the same asset.
    const before = buildQuote({
      direction: "cash-to-crypto",
      give: "1000",
      fiat: "EUR",
      asset: "BTC",
      network: "bitcoin",
      at: AT,
    });

    setDefaultAnchors({ BTC: "55810.000000000000" });
    expect(previewRateProvider.isLive).toBe(true);
    expect(previewRateProvider.label).toBe("Live rate");

    const after = buildQuote({
      direction: "cash-to-crypto",
      give: "1000",
      fiat: "EUR",
      asset: "BTC",
      network: "bitcoin",
      at: AT,
    });

    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    expect(value(after.quote.rate.value)).not.toBe(value(before.quote.rate.value));
    expect(value(after.quote.rate.value)).toContain("55810");
  });

  it("goes back to preview the moment the feed is withdrawn", () => {
    setDefaultAnchors({ BTC: "55810.000000000000" });
    expect(previewRateProvider.isLive).toBe(true);
    setDefaultAnchors(undefined);
    expect(previewRateProvider.isLive).toBe(false);
    expect(previewRateProvider.label).toBe("Preview rate");
  });
});
