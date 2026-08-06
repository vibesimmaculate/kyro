import { z } from "zod";
import { CRYPTO_CODES, type CryptoCode } from "@/lib/money/currencies";

/**
 * The market feed.
 *
 * One request to a public endpoint returns, for every asset KYRO handles, the
 * spot price in euro, the 24-hour move, the day's range, traded volume, market
 * capitalisation and a week of hourly closes. That last field is what makes a
 * real chart possible without a second call per asset.
 *
 * No key is required and none is stored. If the request fails — offline, rate
 * limited, provider down — the caller falls back to preview rates and *says
 * so*. A stale number presented as a live one is the single most damaging
 * thing a page like this can do, so staleness is surfaced rather than hidden.
 */

const COINGECKO = "https://api.coingecko.com/api/v3/coins/markets";

/** Their identifiers for the five assets, in the order the page lists them. */
const IDS: Record<CryptoCode, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
};

const BY_ID = new Map<string, CryptoCode>(
  CRYPTO_CODES.map((code) => [IDS[code], code] as const),
);

const RowSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: z.number().positive(),
  market_cap: z.number().nonnegative().nullable(),
  total_volume: z.number().nonnegative().nullable(),
  high_24h: z.number().nullable(),
  low_24h: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  last_updated: z.string().nullable(),
  sparkline_in_7d: z.object({ price: z.array(z.number()) }).nullable().optional(),
});

const ResponseSchema = z.array(RowSchema);

export interface MarketRow {
  readonly asset: CryptoCode;
  readonly name: string;
  /** Euro per whole unit. A JS number — display only, never money maths. */
  readonly eur: number;
  readonly changePercent24h: number | undefined;
  readonly high24h: number | undefined;
  readonly low24h: number | undefined;
  readonly volume24h: number | undefined;
  readonly marketCap: number | undefined;
  /** Hourly closes over the last seven days, oldest first. */
  readonly sparkline: readonly number[];
}

export interface MarketSnapshot {
  readonly rows: readonly MarketRow[];
  /** When KYRO fetched it, not when the provider computed it. */
  readonly fetchedAt: number;
  readonly source: string;
}

export async function fetchMarkets(signal?: AbortSignal): Promise<MarketSnapshot> {
  const url = new URL(COINGECKO);
  url.searchParams.set("vs_currency", "eur");
  url.searchParams.set("ids", CRYPTO_CODES.map((code) => IDS[code]).join(","));
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("sparkline", "true");
  url.searchParams.set("price_change_percentage", "24h");

  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json" },
    // Next caches this for a minute; see `getMarkets`. Anything longer and the
    // "as of" stamp on the page starts telling a small lie.
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Market feed returned ${response.status}`);
  }

  const parsed = ResponseSchema.parse(await response.json());

  const rows: MarketRow[] = [];
  for (const code of CRYPTO_CODES) {
    const row = parsed.find((entry) => BY_ID.get(entry.id) === code);
    if (!row) continue;
    rows.push({
      asset: code,
      name: row.name,
      eur: row.current_price,
      changePercent24h: row.price_change_percentage_24h ?? undefined,
      high24h: row.high_24h ?? undefined,
      low24h: row.low_24h ?? undefined,
      volume24h: row.total_volume ?? undefined,
      marketCap: row.market_cap ?? undefined,
      sparkline: row.sparkline_in_7d?.price ?? [],
    });
  }

  if (rows.length === 0) {
    throw new Error("Market feed returned no rows for the listed assets");
  }

  return { rows, fetchedAt: Date.now(), source: "CoinGecko" };
}

/* ── History, for the per-asset chart ───────────────────────────────────── */

export type ChartRange = "1" | "7" | "30" | "365";

export const CHART_RANGES: readonly { readonly days: ChartRange; readonly label: string }[] = [
  { days: "1", label: "24 hours" },
  { days: "7", label: "7 days" },
  { days: "30", label: "30 days" },
  { days: "365", label: "1 year" },
];

export interface PriceHistory {
  readonly asset: CryptoCode;
  readonly days: ChartRange;
  /** [epoch ms, euro price], oldest first. */
  readonly points: readonly (readonly [number, number])[];
  readonly fetchedAt: number;
}

const HistorySchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])),
});

export async function fetchHistory(
  asset: CryptoCode,
  days: ChartRange,
  signal?: AbortSignal,
): Promise<PriceHistory> {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${IDS[asset]}/market_chart`);
  url.searchParams.set("vs_currency", "eur");
  url.searchParams.set("days", days);

  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json" },
    // A day of history changes by the minute; a year of it does not.
    next: { revalidate: days === "1" ? 120 : 900 },
  });

  if (!response.ok) throw new Error(`History feed returned ${response.status}`);

  const parsed = HistorySchema.parse(await response.json());
  if (parsed.prices.length < 2) throw new Error("History feed returned no usable points");

  return { asset, days, points: parsed.prices, fetchedAt: Date.now() };
}
