import { describe, expect, it } from "vitest";
import {
  add,
  div,
  divRound,
  fixed,
  mul,
  parseFixed,
  rescale,
  sub,
  toDecimalString,
  toFixed,
  type RoundingMode,
} from "@/lib/money/fixed";

const dec = (s: string, scale: number) => toDecimalString(parseFixed(s, scale));

describe("fixed-point core", () => {
  it("does what floating point cannot", () => {
    const a = parseFixed("0.1", 2);
    const b = parseFixed("0.2", 2);
    expect(toDecimalString(add(a, b))).toBe("0.30");
    // The reason this module exists at all:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("round-trips decimal strings exactly", () => {
    expect(dec("1000", 2)).toBe("1000.00");
    expect(dec("1234.56", 2)).toBe("1234.56");
    expect(dec("0.00000001", 8)).toBe("0.00000001");
    expect(dec("-42.5", 2)).toBe("-42.50");
    expect(dec("0", 0)).toBe("0");
  });

  it("rejects anything that is not a plain decimal", () => {
    for (const bad of ["", " ", "1e5", "1,000", "abc", "1.2.3", "--1", "0x10", "Infinity", "NaN"]) {
      expect(() => parseFixed(bad, 2), `should reject ${JSON.stringify(bad)}`).toThrow();
    }
  });

  it("refuses to build a value from a non-integer JS number", () => {
    expect(() => toFixed(10.5, 2)).toThrow(/floats cannot represent money/);
    expect(toDecimalString(toFixed(10, 2))).toBe("10.00");
    expect(toDecimalString(toFixed(10n, 2))).toBe("10.00");
  });

  describe("rounding", () => {
    const cases: Array<[bigint, bigint, RoundingMode, bigint]> = [
      // Exact halves, positive
      [5n, 2n, "half-up", 3n],
      [5n, 2n, "half-even", 2n],
      [5n, 2n, "floor", 2n],
      [5n, 2n, "ceil", 3n],
      [5n, 2n, "trunc", 2n],
      // Exact halves, negative — half-up means away from zero
      [-5n, 2n, "half-up", -3n],
      [-5n, 2n, "half-even", -2n],
      [-5n, 2n, "floor", -3n],
      [-5n, 2n, "ceil", -2n],
      [-5n, 2n, "trunc", -2n],
      // half-even alternates toward the even neighbour
      [15n, 10n, "half-even", 2n],
      [25n, 10n, "half-even", 2n],
      [35n, 10n, "half-even", 4n],
    ];

    it.each(cases)("divRound(%s, %s, %s) === %s", (n, d, mode, expected) => {
      expect(divRound(n, d, mode)).toBe(expected);
    });

    it("throws on division by zero", () => {
      expect(() => divRound(1n, 0n, "half-up")).toThrow(/zero/i);
    });

    it("normalises a negative denominator", () => {
      expect(divRound(10n, -4n, "half-up")).toBe(-3n);
    });
  });

  it("multiplies without losing precision, then rounds on request", () => {
    const price = parseFixed("92400.123456789012", 12);
    const qty = parseFixed("0.00012345", 8);
    // Exact product carries 20 places; asking for 2 rounds once, at the end.
    expect(toDecimalString(mul(price, qty, 2, "half-up"))).toBe("11.41");
  });

  it("divides at an explicit output scale", () => {
    const cash = parseFixed("960.00", 2);
    const rate = parseFixed("92400.000000000000", 12);
    expect(toDecimalString(div(cash, rate, 8, "floor"))).toBe("0.01038961");
  });

  it("keeps repeating decimals from silently growing", () => {
    const one = parseFixed("1", 0);
    const three = parseFixed("3", 0);
    expect(toDecimalString(div(one, three, 10, "floor"))).toBe("0.3333333333");
    expect(toDecimalString(div(one, three, 10, "ceil"))).toBe("0.3333333334");
  });

  it("rescales down with the mode it is given", () => {
    const v = parseFixed("1.005", 3);
    expect(toDecimalString(rescale(v, 2, "half-up"))).toBe("1.01");
    expect(toDecimalString(rescale(v, 2, "half-even"))).toBe("1.00");
    expect(toDecimalString(rescale(v, 2, "floor"))).toBe("1.00");
  });

  it("adds and subtracts across different scales", () => {
    const a = parseFixed("1.5", 1);
    const b = parseFixed("0.005", 3);
    expect(toDecimalString(add(a, b))).toBe("1.505");
    expect(toDecimalString(sub(a, b))).toBe("1.495");
  });

  it("survives amounts far beyond any real order", () => {
    const huge = parseFixed("999999999999.99", 2);
    expect(toDecimalString(add(huge, parseFixed("0.01", 2)))).toBe("1000000000000.00");
  });

  it("rejects a nonsensical scale", () => {
    expect(() => fixed(1n, -1)).toThrow(RangeError);
    expect(() => fixed(1n, 1.5)).toThrow(RangeError);
  });
});
