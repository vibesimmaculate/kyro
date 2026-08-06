import "server-only";
import { RATE_SCALE } from "@/lib/money/amounts";
import { setDefaultAnchors, type RateAnchors } from "@/lib/rates/preview";
import { getMarkets } from "./index";

/**
 * The bridge between the market feed and the quote engine.
 *
 * This exists because of a specific failure the page made obvious: a live
 * ticker across the top of the homepage showing bitcoin at one price, and a
 * calculator directly beneath it quoting a completely different one. Both were
 * internally defensible — one was a market feed, the other a clearly labelled
 * preview — and together they were indefensible. Nobody reads two numbers for
 * the same thing and concludes that one of them is a placeholder.
 *
 * So the quote engine drinks from the same well. When the feed is up, the
 * counter's euro anchor is the market price and every quote says "Live rate".
 * When it is down, both fall back together and both say "Preview rate". What
 * cannot happen any more is the two of them disagreeing.
 */

/** A JS number to a decimal string at full rate precision, without a float. */
function toDecimal(value: number): string {
  return value.toFixed(RATE_SCALE);
}

export async function liveAnchors(): Promise<RateAnchors | undefined> {
  const markets = await getMarkets();
  // Stale is good enough for a ticker with a warning on it, and not good enough
  // to price an order against. A quote built on a fifteen-minute-old figure is
  // exactly the kind of quiet wrongness this product does not ship, so anything
  // short of live falls all the way back to preview — and says so.
  if (markets.status !== "live") {
    setDefaultAnchors(undefined);
    return undefined;
  }

  const anchors: RateAnchors = {};
  for (const row of markets.snapshot.rows) {
    if (Number.isFinite(row.eur) && row.eur > 0) {
      anchors[row.asset] = toDecimal(row.eur);
    }
  }

  const resolved = Object.keys(anchors).length > 0 ? anchors : undefined;
  setDefaultAnchors(resolved);
  return resolved;
}
