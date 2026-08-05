/**
 * Preview rates.
 *
 * These are NOT live prices and are never described as such. They are a fixed
 * base table with a small, deterministic drift keyed to a sixty-second bucket,
 * so a quote behaves like a real one — it moves, it expires, it can be
 * refreshed — without KYRO claiming a market feed it does not have.
 *
 * Every surface that shows one of these labels it "Preview rate".
 *
 * Replacing this with a real provider means implementing `RateProvider` and
 * swapping the export in `./index.ts`. Nothing else in the product knows where
 * a rate came from.
 */

import {
  CRYPTO_CODES,
  FIAT_CODES,
  type CryptoCode,
  type FiatCode,
} from "@/lib/money/currencies";
import { RATE_SCALE, rate, type Rate } from "@/lib/money/amounts";
import { div, mul, parseFixed, type Fixed } from "@/lib/money/fixed";

/** Euro per one whole unit of the asset. */
const BASE_EUR_PER_ASSET: Record<CryptoCode, string> = {
  BTC: "92400.00",
  ETH: "3180.00",
  SOL: "168.00",
  USDT: "0.923",
  USDC: "0.923",
};

/**
 * Units of each currency per euro.
 *
 * BAM is a hard peg at 1.95583 by currency board — that figure is fixed by law,
 * not a market quote, so it carries no drift. The rest are round preview
 * numbers.
 */
const FIAT_PER_EUR: Record<FiatCode, string> = {
  EUR: "1",
  BAM: "1.95583",
  RSD: "117.15",
  MKD: "61.50",
  ALL: "97.40",
};

const PEGGED: ReadonlySet<FiatCode> = new Set<FiatCode>(["EUR", "BAM"]);

/** How long a quote stands before it must be refreshed. */
export const QUOTE_TTL_MS = 120_000;

/** The bucket a timestamp falls into. Rates hold still inside one bucket. */
export const RATE_BUCKET_MS = 60_000;

/** FNV-1a, 32-bit. Deterministic across machines; no Math.random anywhere. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Drift in basis points, within ±0.4%, stable for the whole bucket. */
function driftBasisPoints(key: string, bucket: number): number {
  const h = hash32(`${key}@${bucket}`);
  return (h % 81) - 40;
}

/** value × (10000 + bp) / 10000, kept in exact integer arithmetic throughout. */
function applyDrift(value: Fixed, bp: number): Fixed {
  const numerator = parseFixed(String(10_000 + bp), 0);
  const denominator = parseFixed("10000", 0);
  return div(
    mul(value, numerator, RATE_SCALE + 4, "half-even"),
    denominator,
    RATE_SCALE,
    "half-even",
  );
}

export interface RateProvider {
  readonly id: string;
  /** True only when the figures come from a real market source. */
  readonly isLive: boolean;
  /** Human label rendered next to every figure this provider produces. */
  readonly label: string;
  getRate(fiat: FiatCode, asset: CryptoCode, at: number): Rate;
}

function computePreviewRate(fiat: FiatCode, asset: CryptoCode, at: number): Rate {
  const bucket = Math.floor(at / RATE_BUCKET_MS);

  const eurPerAsset = parseFixed(BASE_EUR_PER_ASSET[asset], RATE_SCALE);
  const driftedAsset = applyDrift(eurPerAsset, driftBasisPoints(`asset:${asset}`, bucket));

  const perEur = parseFixed(FIAT_PER_EUR[fiat], RATE_SCALE);
  const driftedFiat = PEGGED.has(fiat)
    ? perEur
    : applyDrift(perEur, driftBasisPoints(`fiat:${fiat}`, bucket));

  const value = mul(driftedAsset, driftedFiat, RATE_SCALE, "half-even");
  return rate(fiat, asset, value);
}

export const previewRateProvider: RateProvider = {
  id: "preview",
  isLive: false,
  label: "Preview rate",
  getRate: computePreviewRate,
};

/** When the bucket the given time sits in will roll over. */
export function nextRateChangeAt(at: number): number {
  return (Math.floor(at / RATE_BUCKET_MS) + 1) * RATE_BUCKET_MS;
}

/** Every pair the counter can quote, for tests and for the sitemap of options. */
export function allPairs(): Array<{ fiat: FiatCode; asset: CryptoCode }> {
  const pairs: Array<{ fiat: FiatCode; asset: CryptoCode }> = [];
  for (const fiat of FIAT_CODES) {
    for (const asset of CRYPTO_CODES) {
      pairs.push({ fiat, asset });
    }
  }
  return pairs;
}
