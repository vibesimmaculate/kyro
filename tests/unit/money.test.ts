import { describe, expect, it } from "vitest";
import {
  applyBasisPoints,
  convertCryptoToFiat,
  convertFiatToCrypto,
  floorToQuotePrecision,
  fromWire,
  parseCrypto,
  parseMoney,
  rateFromString,
  toWire,
} from "@/lib/money/amounts";
import {
  countdownLabel,
  formatBasisPoints,
  formatCountdown,
  formatCrypto,
  formatMoney,
  formatRate,
  truncateAddress,
} from "@/lib/money/format";
import { SERVICE_FEE_BP } from "@/lib/quote/types";

/** NBSP — the group separator, spelled out so the tests read honestly. */
const S = " ";

describe("the 4% service fee", () => {
  it("is exactly four percent at the amounts the counter actually sees", () => {
    const cases: Array<[string, string]> = [
      ["100", "4.00"],
      ["1000", "40.00"],
      ["10000", "400.00"],
      ["250", "10.00"],
      ["12345.67", "493.83"], // 493.8268 → half-up
    ];
    for (const [amount, expected] of cases) {
      const fee = applyBasisPoints(parseMoney(amount, "EUR"), SERVICE_FEE_BP);
      expect(formatMoney(fee, { code: false }), `4% of ${amount}`).toBe(expected);
    }
  });

  it("resolves half-way cases upward, never in KYRO's favour by accident", () => {
    // 33.33 × 4% = 1.3332 → 1.33
    expect(formatMoney(applyBasisPoints(parseMoney("33.33", "EUR"), 400), { code: false })).toBe(
      "1.33",
    );
    // 0.125 → the .5 case at two places: 12.50 × 4% = 0.50 exactly
    expect(formatMoney(applyBasisPoints(parseMoney("12.50", "EUR"), 400), { code: false })).toBe(
      "0.50",
    );
    // 6.25 × 4% = 0.25 exactly
    expect(formatMoney(applyBasisPoints(parseMoney("6.25", "EUR"), 400), { code: false })).toBe(
      "0.25",
    );
    // 0.62 × 4% = 0.0248 → 0.02
    expect(formatMoney(applyBasisPoints(parseMoney("0.62", "EUR"), 400), { code: false })).toBe(
      "0.02",
    );
    // 0.63 × 4% = 0.0252 → 0.03
    expect(formatMoney(applyBasisPoints(parseMoney("0.63", "EUR"), 400), { code: false })).toBe(
      "0.03",
    );
  });

  it("is exact on a currency with no minor unit", () => {
    // RSD is quoted whole. 100 000 × 4% = 4 000, no rounding involved.
    const fee = applyBasisPoints(parseMoney("100000", "RSD"), 400);
    expect(fee.minor).toBe(4000n);
    expect(formatMoney(fee)).toBe(`4${S}000 RSD`);
  });

  it("holds at absurd size without drifting a single minor unit", () => {
    const fee = applyBasisPoints(parseMoney("999999", "EUR"), 400);
    expect(fee.minor).toBe(3_999_996n); // €39 999.96
    expect(formatMoney(fee, { code: false })).toBe(`39${S}999.96`);
  });

  it("rejects a negative or fractional fee rate", () => {
    expect(() => applyBasisPoints(parseMoney("100", "EUR"), -1)).toThrow(RangeError);
    expect(() => applyBasisPoints(parseMoney("100", "EUR"), 4.5)).toThrow(RangeError);
  });
});

describe("conversion", () => {
  const btcEur = rateFromString("EUR", "BTC", "92400.000000000000");

  it("floors fiat → crypto so the payout is never overstated", () => {
    const out = convertFiatToCrypto(parseMoney("960.00", "EUR"), btcEur);
    // 960 / 92400 = 0.010389610389… → floored at 8 places
    expect(out.base).toBe(1_038_961n);
    expect(formatCrypto(out)).toBe(`0.010${S}389${S}61 BTC`);
  });

  it("rounds crypto → fiat to the cash the cashier can physically count", () => {
    const out = convertCryptoToFiat(parseCrypto("0.05", "BTC"), btcEur);
    expect(formatMoney(out)).toBe(`4${S}620.00 EUR`);
  });

  it("refuses a rate for the wrong pair", () => {
    expect(() => convertFiatToCrypto(parseMoney("100", "BAM"), btcEur)).toThrow(/BAM|EUR/);
    expect(() => convertCryptoToFiat(parseCrypto("1", "ETH"), btcEur)).toThrow(/BTC|ETH/);
  });

  it("floors to quote precision so the printed figure is the sent figure", () => {
    // ETH holds 18 places on-chain but KYRO quotes and pays six.
    const messy = parseCrypto("1.234567891234567891", "ETH");
    const floored = floorToQuotePrecision(messy);
    // Six places kept, twelve zeroed: nothing survives below what is printed.
    expect(floored.base).toBe(1_234_567_000_000_000_000n);
    expect(floored.base % 10n ** 12n).toBe(0n);
    expect(formatCrypto(floored)).toBe(`1.234${S}567 ETH`);
  });
});

describe("formatting", () => {
  it("groups with a non-breaking space so mono columns align", () => {
    expect(formatMoney(parseMoney("1000", "EUR"))).toBe(`1${S}000.00 EUR`);
    expect(formatMoney(parseMoney("1234567.89", "EUR"))).toBe(`1${S}234${S}567.89 EUR`);
    expect(formatMoney(parseMoney("999", "EUR"))).toBe("999.00 EUR");
  });

  it("omits a minor unit that does not exist in circulation", () => {
    expect(formatMoney(parseMoney("100000", "RSD"))).toBe(`100${S}000 RSD`);
    expect(formatMoney(parseMoney("50000", "MKD"))).toBe(`50${S}000 MKD`);
  });

  it("reads long crypto fractions in threes", () => {
    expect(formatCrypto(parseCrypto("0.02491733", "BTC"))).toBe(`0.024${S}917${S}33 BTC`);
    expect(formatCrypto(parseCrypto("1", "BTC"))).toBe("1.00 BTC");
    expect(formatCrypto(parseCrypto("1250.5", "USDT"))).toBe(`1${S}250.50 USDT`);
  });

  it("states a rate in full rather than as a bare number", () => {
    expect(formatRate(rateFromString("EUR", "BTC", "92431.28"))).toBe(
      `1 BTC = 92${S}431.28 EUR`,
    );
    expect(formatRate(rateFromString("EUR", "USDT", "0.9231"))).toBe("1 USDT = 0.9231 EUR");
  });

  it("prints the fee rate as a plain percentage", () => {
    expect(formatBasisPoints(400)).toBe("4%");
    expect(formatBasisPoints(450)).toBe("4.5%");
    expect(formatBasisPoints(25)).toBe("0.25%");
  });

  it("counts down in mm:ss and says so aloud", () => {
    expect(formatCountdown(120_000)).toBe("2:00");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5_000)).toBe("0:00");
    expect(countdownLabel(0)).toBe("Quote expired");
    expect(countdownLabel(65_000)).toMatch(/1 minute 5 seconds remaining/);
  });

  it("keeps both ends of an address visible", () => {
    const addr = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
    expect(truncateAddress(addr)).toBe("0x71C765…d8976F");
    expect(truncateAddress("short")).toBe("short");
  });
});

describe("the wire format", () => {
  it("never puts a JS number on the wire", () => {
    const m = parseMoney("1234.56", "EUR");
    const wire = toWire(m);
    expect(wire).toEqual({ kind: "fiat", code: "EUR", value: "1234.56", units: "123456" });
    expect(JSON.parse(JSON.stringify(wire)).value).toBe("1234.56");
  });

  it("round-trips both kinds without loss", () => {
    for (const original of [parseMoney("0.01", "EUR"), parseCrypto("0.00000001", "BTC")]) {
      expect(fromWire(toWire(original))).toEqual(original);
    }
  });

  it("rejects an unknown code coming back off the wire", () => {
    expect(() => fromWire({ kind: "fiat", code: "XXX", value: "1", units: "100" })).toThrow();
  });
});

describe("fraction grouping", () => {
  it("never leaves a single digit dangling off the end", () => {
    // 0.0104073 is seven fractional digits: grouped naively it reads
    // "0.010 407 3", which looks like a typing error rather than a number.
    expect(formatCrypto(parseCrypto("0.0104073", "BTC"))).toBe(`0.010${S}407${S}30 BTC`);
    // Two-digit tails are fine and are left alone.
    expect(formatCrypto(parseCrypto("0.02491733", "BTC"))).toBe(`0.024${S}917${S}33 BTC`);
    // Padding never runs past the asset's real precision.
    expect(formatCrypto(parseCrypto("1.234567", "ETH"))).toBe(`1.234${S}567 ETH`);
  });

  it("pads only with zeros, so the value never changes", () => {
    const original = parseCrypto("0.0104073", "BTC");
    const printed = formatCrypto(original, { code: false }).replace(/\u00a0/g, "");
    expect(parseCrypto(printed, "BTC")).toEqual(original);
  });
});
