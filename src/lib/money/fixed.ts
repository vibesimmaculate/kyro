/**
 * Fixed-point decimal arithmetic on bigint.
 *
 * Every monetary value in KYRO passes through this module. Nothing here uses
 * `number` for a value — only for scales (digit counts), which are small
 * integers. That is the whole point: 0.1 + 0.2 must be 0.3, and a 4% fee on
 * €1,000 must be €40.00 exactly, on every machine, forever.
 */

export type RoundingMode =
  /** Round half away from zero. The default for fees and fiat. */
  | "half-up"
  /** Round half to even. Lowest bias across many operations. */
  | "half-even"
  /** Toward negative infinity. */
  | "floor"
  /** Toward positive infinity. */
  | "ceil"
  /** Toward zero. For positive amounts, identical to floor. */
  | "trunc";

export interface Fixed {
  /** The unscaled value: the real number is `v / 10^s`. */
  readonly v: bigint;
  /** Number of decimal places. Always >= 0. */
  readonly s: number;
}

const MAX_SCALE = 40;

export function fixed(v: bigint, s: number): Fixed {
  if (!Number.isInteger(s) || s < 0 || s > MAX_SCALE) {
    throw new RangeError(`Fixed scale must be an integer in [0, ${MAX_SCALE}], received ${s}`);
  }
  return { v, s };
}

const POW10_CACHE = new Map<number, bigint>();

export function pow10(n: number): bigint {
  if (n < 0) throw new RangeError(`pow10 requires n >= 0, received ${n}`);
  const hit = POW10_CACHE.get(n);
  if (hit !== undefined) return hit;
  const value = 10n ** BigInt(n);
  POW10_CACHE.set(n, value);
  return value;
}

/**
 * Integer division with an explicit rounding decision.
 *
 * All rounding in the product funnels through here, so there is exactly one
 * place where a half-way case is resolved.
 */
export function divRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");

  // Normalise the sign onto the numerator so the branches below stay readable.
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;

  const negative = n < 0n;
  const twiceRemainder = (r < 0n ? -r : r) * 2n;

  switch (mode) {
    case "trunc":
      return q;
    case "floor":
      return negative ? q - 1n : q;
    case "ceil":
      return negative ? q : q + 1n;
    case "half-up": {
      if (twiceRemainder >= d) return negative ? q - 1n : q + 1n;
      return q;
    }
    case "half-even": {
      if (twiceRemainder > d) return negative ? q - 1n : q + 1n;
      if (twiceRemainder < d) return q;
      // Exactly half: move to the even neighbour.
      return q % 2n === 0n ? q : negative ? q - 1n : q + 1n;
    }
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown rounding mode: ${String(exhaustive)}`);
    }
  }
}

/** Restate a value at a different number of decimal places. */
export function rescale(a: Fixed, s: number, mode: RoundingMode = "half-up"): Fixed {
  if (s === a.s) return a;
  if (s > a.s) return fixed(a.v * pow10(s - a.s), s);
  return fixed(divRound(a.v, pow10(a.s - s), mode), s);
}

function align(a: Fixed, b: Fixed): [Fixed, Fixed, number] {
  const s = Math.max(a.s, b.s);
  return [rescale(a, s), rescale(b, s), s];
}

export function add(a: Fixed, b: Fixed): Fixed {
  const [x, y, s] = align(a, b);
  return fixed(x.v + y.v, s);
}

export function sub(a: Fixed, b: Fixed): Fixed {
  const [x, y, s] = align(a, b);
  return fixed(x.v - y.v, s);
}

/** Exact product. The result carries the sum of both scales — no rounding. */
export function mulExact(a: Fixed, b: Fixed): Fixed {
  const s = a.s + b.s;
  if (s > MAX_SCALE) {
    // Trim the inputs' trailing zeros before giving up on precision.
    return rescale(fixed(a.v * b.v, s > MAX_SCALE ? MAX_SCALE : s), MAX_SCALE, "half-even");
  }
  return fixed(a.v * b.v, s);
}

export function mul(a: Fixed, b: Fixed, s: number, mode: RoundingMode = "half-up"): Fixed {
  return rescale(mulExact(a, b), s, mode);
}

/** Quotient at an explicit output scale, so precision is always a decision. */
export function div(a: Fixed, b: Fixed, s: number, mode: RoundingMode = "half-up"): Fixed {
  if (b.v === 0n) throw new RangeError("Division by zero");
  // (a.v / 10^a.s) / (b.v / 10^b.s) at scale s
  //   = a.v * 10^(s + b.s - a.s) / b.v
  const shift = s + b.s - a.s;
  const numerator = shift >= 0 ? a.v * pow10(shift) : a.v;
  const denominator = shift >= 0 ? b.v : b.v * pow10(-shift);
  return fixed(divRound(numerator, denominator, mode), s);
}

export function cmp(a: Fixed, b: Fixed): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  if (x.v < y.v) return -1;
  if (x.v > y.v) return 1;
  return 0;
}

export const eq = (a: Fixed, b: Fixed): boolean => cmp(a, b) === 0;
export const lt = (a: Fixed, b: Fixed): boolean => cmp(a, b) < 0;
export const lte = (a: Fixed, b: Fixed): boolean => cmp(a, b) <= 0;
export const gt = (a: Fixed, b: Fixed): boolean => cmp(a, b) > 0;
export const gte = (a: Fixed, b: Fixed): boolean => cmp(a, b) >= 0;
export const isZero = (a: Fixed): boolean => a.v === 0n;
export const isNegative = (a: Fixed): boolean => a.v < 0n;
export const isPositive = (a: Fixed): boolean => a.v > 0n;
export const neg = (a: Fixed): Fixed => fixed(-a.v, a.s);
export const abs = (a: Fixed): Fixed => fixed(a.v < 0n ? -a.v : a.v, a.s);

export function min(a: Fixed, b: Fixed): Fixed {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Fixed, b: Fixed): Fixed {
  return cmp(a, b) >= 0 ? a : b;
}

/** Clamp to zero. Used where a fee could otherwise exceed the amount. */
export function clampZero(a: Fixed): Fixed {
  return a.v < 0n ? fixed(0n, a.s) : a;
}

const DECIMAL_PATTERN = /^-?(?:\d+)(?:\.\d+)?$/;

/**
 * Parse a plain decimal string. Deliberately strict: no exponents, no thousands
 * separators, no `Number` round-trip. Digits beyond the target scale are
 * rounded with the given mode rather than silently dropped.
 */
export function parseFixed(input: string, s: number, mode: RoundingMode = "half-up"): Fixed {
  const trimmed = input.trim();
  if (trimmed === "" || !DECIMAL_PATTERN.test(trimmed)) {
    throw new SyntaxError(`Not a plain decimal string: ${JSON.stringify(input)}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const dot = unsigned.indexOf(".");
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? "" : unsigned.slice(dot + 1);

  const digits = `${whole}${frac}`;
  const raw = fixed(BigInt(digits === "" ? "0" : digits), frac.length);
  const scaled = rescale(raw, s, mode);
  return negative ? neg(scaled) : scaled;
}

/** Accepts a decimal string, integer, or existing Fixed. */
export function toFixed(value: string | number | bigint | Fixed, s: number): Fixed {
  if (typeof value === "bigint") return rescale(fixed(value, 0), s);
  if (typeof value === "string") return parseFixed(value, s);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `Refusing to build a Fixed from the non-integer number ${value}. Pass a decimal string instead — floats cannot represent money exactly.`,
      );
    }
    return rescale(fixed(BigInt(value), 0), s);
  }
  return rescale(value, s);
}

/** Canonical unformatted decimal string. Round-trips through parseFixed. */
export function toDecimalString(a: Fixed): string {
  const negative = a.v < 0n;
  const digits = (negative ? -a.v : a.v).toString().padStart(a.s + 1, "0");
  const whole = digits.slice(0, digits.length - a.s) || "0";
  const frac = a.s === 0 ? "" : digits.slice(digits.length - a.s);
  const body = frac === "" ? whole : `${whole}.${frac}`;
  return negative ? `-${body}` : body;
}

export const ZERO = (s: number): Fixed => fixed(0n, s);
