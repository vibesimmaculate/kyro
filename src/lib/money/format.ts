/**
 * Formatting.
 *
 * Groups are separated by a non-breaking space rather than a comma or a dot.
 * In a monospaced face a NBSP occupies exactly one cell, so figures stacked in
 * a column align on the decimal point down the whole receipt — which is the
 * entire reason KYRO sets its numbers in mono. It also sidesteps the
 * comma-versus-dot ambiguity between English and Balkan conventions.
 */

import {
  CRYPTO,
  FIAT,
  type CryptoCode,
  type FiatCode,
} from "./currencies";
import {
  cryptoToFixed,
  moneyToFixed,
  type Amount,
  type CryptoAmount,
  type Money,
  type Rate,
} from "./amounts";
import { toDecimalString, type Fixed } from "./fixed";

export const GROUP_SEPARATOR = " ";
export const DECIMAL_SEPARATOR = ".";

/** The pieces of a formatted figure, so the fraction can be set differently. */
export interface FigureParts {
  readonly sign: string;
  readonly whole: string;
  readonly fraction: string;
  readonly code: string;
  readonly symbol: string;
  /** Everything joined — the plain-text form, used for aria-label and tests. */
  readonly plain: string;
}

function groupWhole(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += GROUP_SEPARATOR;
    out += digits[i];
  }
  return out;
}

/** Fractions read in threes too: 0.024 917 rather than 0.024917. */
function groupFraction(digits: string): string {
  if (digits.length <= 3) return digits;
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && i % 3 === 0) out += GROUP_SEPARATOR;
    out += digits[i];
  }
  return out;
}

/**
 * Avoids a group of one digit dangling off the end — "0.010 407 3" reads as a
 * mistake where "0.010 407 30" reads as a number. A trailing zero after the
 * decimal point changes nothing about the value, so this is a typographic
 * decision with no arithmetic consequence. Never pads past the asset's real
 * precision.
 */
function avoidOrphanDigit(digits: string, cap: number): string {
  if (digits.length > 3 && digits.length % 3 === 1 && digits.length < cap) {
    return `${digits}0`;
  }
  return digits;
}

function splitFixed(f: Fixed): { sign: string; whole: string; fraction: string } {
  const raw = toDecimalString(f);
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  return {
    sign: negative ? "-" : "",
    whole: dot === -1 ? body : body.slice(0, dot),
    fraction: dot === -1 ? "" : body.slice(dot + 1),
  };
}

export interface MoneyFormatOptions {
  /** Trailing "EUR". Default true. */
  readonly code?: boolean;
  /** Leading "€". Default false — the code carries it on receipts. */
  readonly symbol?: boolean;
  /** Show ".00" on whole amounts. Default true; fiat receipts want it. */
  readonly trailingZeros?: boolean;
}

export function moneyParts(m: Money, options: MoneyFormatOptions = {}): FigureParts {
  const { code = true, symbol = false, trailingZeros = true } = options;
  const currency = FIAT[m.currency];
  const { sign, whole, fraction } = splitFixed(moneyToFixed(m));

  const keepFraction = trailingZeros || /[1-9]/.test(fraction);
  const shownFraction = keepFraction ? fraction : "";

  const numeric = `${sign}${groupWhole(whole)}${
    shownFraction ? DECIMAL_SEPARATOR + shownFraction : ""
  }`;

  const plain = [symbol ? currency.symbol : "", numeric, code ? currency.code : ""]
    .filter(Boolean)
    .join(symbol && !code ? "" : " ")
    .trim();

  return {
    sign,
    whole: groupWhole(whole),
    fraction: shownFraction,
    code: code ? currency.code : "",
    symbol: symbol ? currency.symbol : "",
    plain,
  };
}

export function formatMoney(m: Money, options?: MoneyFormatOptions): string {
  return moneyParts(m, options).plain;
}

export interface CryptoFormatOptions {
  readonly code?: boolean;
  /** Trim trailing zeros down to this many places. Default: keep 2. */
  readonly minFractionDigits?: number;
  /** Cap at the asset's quote precision rather than its chain precision. */
  readonly full?: boolean;
}

export function cryptoParts(c: CryptoAmount, options: CryptoFormatOptions = {}): FigureParts {
  const { code = true, minFractionDigits = 2, full = false } = options;
  const asset = CRYPTO[c.asset];
  const { sign, whole, fraction } = splitFixed(cryptoToFixed(c));

  const cap = full ? asset.decimals : asset.quotePrecision;
  let shown = fraction.slice(0, cap);
  // Trim trailing zeros, but never below the readable floor.
  while (shown.length > minFractionDigits && shown.endsWith("0")) {
    shown = shown.slice(0, -1);
  }
  shown = avoidOrphanDigit(shown.padEnd(Math.min(minFractionDigits, cap), "0"), cap);

  const numeric = `${sign}${groupWhole(whole)}${
    shown ? DECIMAL_SEPARATOR + groupFraction(shown) : ""
  }`;

  return {
    sign,
    whole: groupWhole(whole),
    fraction: shown ? groupFraction(shown) : "",
    code: code ? asset.code : "",
    symbol: "",
    plain: [numeric, code ? asset.code : ""].filter(Boolean).join(" "),
  };
}

export function formatCrypto(c: CryptoAmount, options?: CryptoFormatOptions): string {
  return cryptoParts(c, options).plain;
}

export function amountParts(a: Amount, options?: MoneyFormatOptions & CryptoFormatOptions) {
  return a.kind === "fiat" ? moneyParts(a, options) : cryptoParts(a, options);
}

export function formatAmount(a: Amount, options?: MoneyFormatOptions & CryptoFormatOptions): string {
  return amountParts(a, options).plain;
}

/**
 * "1 BTC = 92 431.28 EUR" — always stated in full, because an unlabelled rate
 * is the easiest place in a product like this to mislead someone.
 */
export function formatRate(r: Rate): string {
  const { sign, whole, fraction } = splitFixed(r.value);
  const decimals = rateDisplayDecimals(r.fiat, r.asset);
  let shown = fraction.slice(0, decimals);
  while (shown.length > 2 && shown.endsWith("0")) shown = shown.slice(0, -1);
  shown = shown.padEnd(Math.min(2, decimals), "0");
  const numeric = `${sign}${groupWhole(whole)}${shown ? DECIMAL_SEPARATOR + shown : ""}`;
  return `1 ${r.asset} = ${numeric} ${r.fiat}`;
}

/** Stablecoins need more places than bitcoin: 0.92 EUR moves in the hundredths. */
function rateDisplayDecimals(fiat: FiatCode, asset: CryptoCode): number {
  if (CRYPTO[asset].kind === "stablecoin") return FIAT[fiat].decimals === 0 ? 2 : 4;
  return FIAT[fiat].decimals === 0 ? 0 : 2;
}

/** 400 bp → "4%". Whole percentages stay whole; the fee is exactly 4%. */
export function formatBasisPoints(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return `${whole}%`;
  const frac = String(rest).padStart(2, "0").replace(/0$/, "");
  return `${whole}${DECIMAL_SEPARATOR}${frac}%`;
}

/** mm:ss for the quote countdown. */
export function formatCountdown(msRemaining: number): string {
  const clamped = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Reads the countdown aloud properly instead of "colon". */
export function countdownLabel(msRemaining: number): string {
  const clamped = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  if (clamped === 0) return "Quote expired";
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds > 0) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  return `${parts.join(" ")} remaining on this quote`;
}

/** Order codes are read aloud at a pickup point, so they are grouped: KYR-4H2N-8QX1 */
export function formatReference(reference: string): string {
  return reference.toUpperCase();
}

/** Truncates a chain address for display without hiding the ends people check. */
export function truncateAddress(address: string, lead = 8, tail = 6): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
