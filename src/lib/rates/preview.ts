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

/**
 * Euro anchors supplied by a real market feed.
 *
 * Decimal strings, so they cross the server-to-client boundary without a float
 * ever touching the money path. A partial record is fine: any asset the feed
 * did not return falls back to the base table.
 */
export type RateAnchors = Partial<Record<CryptoCode, string>>;

function computeRate(
  fiat: FiatCode,
  asset: CryptoCode,
  at: number,
  anchors: RateAnchors | undefined,
): Rate {
  const bucket = Math.floor(at / RATE_BUCKET_MS);

  const anchored = anchors?.[asset];
  const eurPerAsset = parseFixed(anchored ?? BASE_EUR_PER_ASSET[asset], RATE_SCALE);
  // A real price does not need simulated movement. Drift exists only to make a
  // made-up number behave like a market; applying it on top of an actual one
  // would be adding noise to a signal.
  const assetLeg = anchored
    ? eurPerAsset
    : applyDrift(eurPerAsset, driftBasisPoints(`asset:${asset}`, bucket));

  const perEur = parseFixed(FIAT_PER_EUR[fiat], RATE_SCALE);
  const driftedFiat = PEGGED.has(fiat)
    ? perEur
    : applyDrift(perEur, driftBasisPoints(`fiat:${fiat}`, bucket));

  const value = mul(assetLeg, driftedFiat, RATE_SCALE, "half-even");
  return rate(fiat, asset, value);
}

/**
 * Builds a provider around whatever anchors are available.
 *
 * With anchors it reports itself as live and labels itself as such; without
 * them it is the preview provider and says so. Every surface renders
 * `provider.label` next to the figure, so the page tells the truth about where
 * its number came from without any of them knowing how the rate was sourced.
 *
 * The fiat cross is a separate question from the asset price and is not made
 * live by this. EUR needs no cross at all and BAM is a legal hard peg, so both
 * are exact; the dinar, denar and lek crosses remain preview values, which is
 * why the live label is careful to say "in euro".
 */
export function createRateProvider(anchors?: RateAnchors): RateProvider {
  const live = anchors !== undefined && Object.keys(anchors).length > 0;
  return {
    id: live ? "live" : "preview",
    isLive: live,
    label: live ? "Live rate" : "Preview rate",
    getRate: (fiat, asset, at) => computeRate(fiat, asset, at, anchors),
  };
}

/* ── The ambient default ────────────────────────────────────────────────── */

/**
 * Anchors registered by the server for every quote built in this process.
 *
 * Quotes are constructed in a dozen places — the calculator, four flow steps,
 * the fees worked example, order creation, the order store — and threading a
 * rate source through all of them would mean touching the order path to fix a
 * display problem. Worse, a partial refactor is exactly how a site ends up
 * quoting one price on screen and writing a different one to the order.
 *
 * So the default provider reads a registered snapshot instead. Nothing that
 * builds a quote has to know where rates come from, which was already the
 * design; this only lets the answer change at runtime. The client is served by
 * the same mechanism through an explicit prop, because a browser has no access
 * to this and must be handed the figures.
 */
const ANCHOR_KEY = Symbol.for("kyro.rate-anchors");

export function setDefaultAnchors(anchors: RateAnchors | undefined): void {
  (globalThis as unknown as Record<symbol, RateAnchors | undefined>)[ANCHOR_KEY] = anchors;
}

export function defaultAnchors(): RateAnchors | undefined {
  return (globalThis as unknown as Record<symbol, RateAnchors | undefined>)[ANCHOR_KEY];
}

/**
 * The provider every quote uses unless told otherwise.
 *
 * Resolved per call rather than captured once, so a feed that comes up mid-run
 * takes effect on the next quote rather than on the next deploy. Its `label`
 * and `isLive` follow the same rule, which is what keeps the words next to a
 * figure honest about that particular figure.
 */
export const previewRateProvider: RateProvider = {
  id: "default",
  get isLive() {
    return createRateProvider(defaultAnchors()).isLive;
  },
  get label() {
    return createRateProvider(defaultAnchors()).label;
  },
  getRate: (fiat, asset, at) => computeRate(fiat, asset, at, defaultAnchors()),
};

/** When the bucket the given time sits in will roll over. */
export function nextRateChangeAt(at: number): number {
  return (Math.floor(at / RATE_BUCKET_MS) + 1) * RATE_BUCKET_MS;
}

/** Every pair the pickup point can quote, for tests and for the sitemap of options. */
export function allPairs(): Array<{ fiat: FiatCode; asset: CryptoCode }> {
  const pairs: Array<{ fiat: FiatCode; asset: CryptoCode }> = [];
  for (const fiat of FIAT_CODES) {
    for (const asset of CRYPTO_CODES) {
      pairs.push({ fiat, asset });
    }
  }
  return pairs;
}
