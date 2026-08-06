/**
 * Money and CryptoAmount — the two value types that cross every boundary.
 *
 * Both are integers in their smallest unit. Serialisation is a decimal string,
 * never a JS number, so a value survives the trip to the browser and back
 * without ever being approximated.
 */

import {
  CRYPTO,
  FIAT,
  isCryptoCode,
  isFiatCode,
  type CryptoCode,
  type FiatCode,
} from "./currencies";
import {
  div,
  divRound,
  fixed,
  mul,
  parseFixed,
  pow10,
  rescale,
  toDecimalString,
  type Fixed,
  type RoundingMode,
} from "./fixed";

export interface Money {
  readonly kind: "fiat";
  /** Integer count of the currency's smallest cash unit. */
  readonly minor: bigint;
  readonly currency: FiatCode;
}

export interface CryptoAmount {
  readonly kind: "crypto";
  /** Integer count of the chain's base unit (satoshi, wei, lamport…). */
  readonly base: bigint;
  readonly asset: CryptoCode;
}

export type Amount = Money | CryptoAmount;

/* ── Construction ──────────────────────────────────────────────────────── */

export function money(minor: bigint, currency: FiatCode): Money {
  return { kind: "fiat", minor, currency };
}

export function crypto(base: bigint, asset: CryptoCode): CryptoAmount {
  return { kind: "crypto", base, asset };
}

export function zeroMoney(currency: FiatCode): Money {
  return money(0n, currency);
}

export function zeroCrypto(asset: CryptoCode): CryptoAmount {
  return crypto(0n, asset);
}

/** Parse a plain decimal string such as "1000" or "1234.56". */
export function parseMoney(input: string, currency: FiatCode): Money {
  const f = parseFixed(input, FIAT[currency].decimals);
  return money(f.v, currency);
}

export function parseCrypto(input: string, asset: CryptoCode): CryptoAmount {
  const f = parseFixed(input, CRYPTO[asset].decimals);
  return crypto(f.v, asset);
}

/* ── Bridging to Fixed ─────────────────────────────────────────────────── */

export function moneyToFixed(m: Money): Fixed {
  return fixed(m.minor, FIAT[m.currency].decimals);
}

export function cryptoToFixed(c: CryptoAmount): Fixed {
  return fixed(c.base, CRYPTO[c.asset].decimals);
}

export function toFixedAmount(a: Amount): Fixed {
  return a.kind === "fiat" ? moneyToFixed(a) : cryptoToFixed(a);
}

export function fixedToMoney(f: Fixed, currency: FiatCode, mode: RoundingMode = "half-up"): Money {
  return money(rescale(f, FIAT[currency].decimals, mode).v, currency);
}

export function fixedToCrypto(
  f: Fixed,
  asset: CryptoCode,
  mode: RoundingMode = "floor",
): CryptoAmount {
  return crypto(rescale(f, CRYPTO[asset].decimals, mode).v, asset);
}

/* ── Arithmetic ────────────────────────────────────────────────────────── */

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

function assertSameAsset(a: CryptoAmount, b: CryptoAmount): void {
  if (a.asset !== b.asset) {
    throw new TypeError(`Cannot combine ${a.asset} with ${b.asset}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function addCrypto(a: CryptoAmount, b: CryptoAmount): CryptoAmount {
  assertSameAsset(a, b);
  return crypto(a.base + b.base, a.asset);
}

export function subCrypto(a: CryptoAmount, b: CryptoAmount): CryptoAmount {
  assertSameAsset(a, b);
  return crypto(a.base - b.base, a.asset);
}

export const cmpMoney = (a: Money, b: Money): -1 | 0 | 1 => {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
};

export const cmpCrypto = (a: CryptoAmount, b: CryptoAmount): -1 | 0 | 1 => {
  assertSameAsset(a, b);
  return a.base < b.base ? -1 : a.base > b.base ? 1 : 0;
};

export const isZeroAmount = (a: Amount): boolean =>
  a.kind === "fiat" ? a.minor === 0n : a.base === 0n;

export const isNegativeAmount = (a: Amount): boolean =>
  a.kind === "fiat" ? a.minor < 0n : a.base < 0n;

export const maxZeroMoney = (m: Money): Money =>
  m.minor < 0n ? zeroMoney(m.currency) : m;

export const maxZeroCrypto = (c: CryptoAmount): CryptoAmount =>
  c.base < 0n ? zeroCrypto(c.asset) : c;

/**
 * Apply a rate given in basis points (1 bp = 0.01%).
 *
 * The 4% service fee is 400 bp. Kept in integer bp so the fee can never drift:
 * 4% of €1,000 is `100000n * 400n / 10000n` = `4000n` minor units = €40.00.
 */
export function applyBasisPoints(
  m: Money,
  bp: number,
  mode: RoundingMode = "half-up",
): Money {
  if (!Number.isInteger(bp) || bp < 0) {
    throw new RangeError(`Basis points must be a non-negative integer, received ${bp}`);
  }
  return money(divRound(m.minor * BigInt(bp), 10_000n, mode), m.currency);
}

export function applyBasisPointsCrypto(
  c: CryptoAmount,
  bp: number,
  mode: RoundingMode = "floor",
): CryptoAmount {
  if (!Number.isInteger(bp) || bp < 0) {
    throw new RangeError(`Basis points must be a non-negative integer, received ${bp}`);
  }
  return crypto(divRound(c.base * BigInt(bp), 10_000n, mode), c.asset);
}

/**
 * Floor a crypto amount to the precision KYRO quotes at, so the printed figure
 * and the transferred figure are the same number.
 */
export function floorToQuotePrecision(c: CryptoAmount): CryptoAmount {
  const asset = CRYPTO[c.asset];
  const drop = asset.decimals - asset.quotePrecision;
  if (drop <= 0) return c;
  const step = pow10(drop);
  return crypto((c.base / step) * step, c.asset);
}

/* ── Conversion ────────────────────────────────────────────────────────── */

/** Rates are held at twelve decimal places: fiat units per one whole coin. */
export const RATE_SCALE = 12;

export interface Rate {
  readonly fiat: FiatCode;
  readonly asset: CryptoCode;
  /** Fiat per one whole unit of the asset, at RATE_SCALE. */
  readonly value: Fixed;
}

export function rate(fiat: FiatCode, asset: CryptoCode, value: Fixed): Rate {
  return { fiat, asset, value: rescale(value, RATE_SCALE) };
}

export function rateFromString(fiat: FiatCode, asset: CryptoCode, value: string): Rate {
  return { fiat, asset, value: parseFixed(value, RATE_SCALE) };
}

/** Crypto → fiat. Rounded half-up: the pickup point pays whole cash units. */
export function convertCryptoToFiat(c: CryptoAmount, r: Rate): Money {
  if (r.asset !== c.asset) throw new TypeError(`Rate is for ${r.asset}, amount is ${c.asset}`);
  const productScale = RATE_SCALE + 4;
  const product = mul(cryptoToFixed(c), r.value, productScale, "half-even");
  return fixedToMoney(product, r.fiat, "half-up");
}

/** Fiat → crypto. Floored: KYRO never promises more than it will send. */
export function convertFiatToCrypto(m: Money, r: Rate): CryptoAmount {
  if (r.fiat !== m.currency) throw new TypeError(`Rate is for ${r.fiat}, amount is ${m.currency}`);
  const quotient = div(moneyToFixed(m), r.value, CRYPTO[r.asset].decimals + 2, "floor");
  return fixedToCrypto(quotient, r.asset, "floor");
}

/* ── Serialisation ─────────────────────────────────────────────────────── */

export interface AmountWire {
  readonly kind: "fiat" | "crypto";
  readonly code: string;
  /** Exact decimal string. Never a JS number. */
  readonly value: string;
  /** Raw integer in the smallest unit, also as a string. */
  readonly units: string;
}

export function toWire(a: Amount): AmountWire {
  if (a.kind === "fiat") {
    return {
      kind: "fiat",
      code: a.currency,
      value: toDecimalString(moneyToFixed(a)),
      units: a.minor.toString(),
    };
  }
  return {
    kind: "crypto",
    code: a.asset,
    value: toDecimalString(cryptoToFixed(a)),
    units: a.base.toString(),
  };
}

export function fromWire(w: AmountWire): Amount {
  if (w.kind === "fiat") {
    if (!isFiatCode(w.code)) throw new TypeError(`Unknown fiat code ${w.code}`);
    return money(BigInt(w.units), w.code);
  }
  if (!isCryptoCode(w.code)) throw new TypeError(`Unknown crypto code ${w.code}`);
  return crypto(BigInt(w.units), w.code);
}

export type { Fixed, RoundingMode };
