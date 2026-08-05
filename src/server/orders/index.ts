import "server-only";

import { CRYPTO, FIAT, type CryptoCode, type FiatCode, type NetworkId } from "@/lib/money/currencies";
import { buildQuote } from "@/lib/quote/engine";
import type { Direction, Quote } from "@/lib/quote/types";
import { hasSupabase } from "@/server/env";
import { sampleLocationProvider } from "@/fixtures/locations";
import { memoryOrderStore } from "./memory-store";
import { generateReference } from "./reference";
import type { OrderStore } from "./store";
import { supabaseOrderStore } from "./supabase-store";
import { ORDER_HOLD_MS, type CreateOrderInput, type Order } from "./types";

/**
 * Picks the durable store when Supabase is configured, and the in-process one
 * otherwise so the site is demonstrable without a database. Nothing above this
 * line knows which is in play.
 */
export function orderStore(): OrderStore {
  return hasSupabase() ? supabaseOrderStore : memoryOrderStore;
}

export type CreateOrderResult =
  | { readonly ok: true; readonly order: Order; readonly quote: Quote }
  | { readonly ok: false; readonly reason: string };

/**
 * Creates an order.
 *
 * The quote is rebuilt here, on the server, from the raw inputs — the figures
 * the browser showed are never trusted. If the rate has moved since the
 * customer saw it, this is where the difference appears, and the caller shows
 * the new number rather than honouring a stale one.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const at = Date.now();

  const location = sampleLocationProvider.bySlug(input.locationSlug);
  if (!location) {
    return { ok: false, reason: "That location is not one of ours." };
  }
  if (!location.directions.includes(input.direction)) {
    return { ok: false, reason: `${location.city} — ${location.branch} does not handle that direction.` };
  }
  if (!location.assets.includes(input.asset)) {
    return { ok: false, reason: `${location.city} — ${location.branch} does not handle ${input.asset}.` };
  }
  if (!location.currencies.includes(input.fiat)) {
    return { ok: false, reason: `${location.city} — ${location.branch} does not hold ${FIAT[input.fiat].name}.` };
  }

  const result = buildQuote({
    direction: input.direction,
    give: input.amount,
    fiat: input.fiat,
    asset: input.asset,
    network: input.network,
    at,
  });

  if (!result.ok) {
    return { ok: false, reason: result.issues[0]?.message ?? "That exchange cannot be priced." };
  }

  const quote = result.quote;
  const store = orderStore();

  // Collisions are vanishingly unlikely but cheap to rule out entirely.
  let reference = generateReference();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!(await store.byReference(reference))) break;
    reference = generateReference();
  }

  const order: Order = {
    reference,
    direction: quote.direction,
    fiat: quote.fiat,
    asset: quote.asset,
    network: quote.network,
    giveUnits:
      quote.give.kind === "fiat" ? quote.give.minor.toString() : quote.give.base.toString(),
    grossMinor: quote.gross.minor.toString(),
    serviceFeeMinor: quote.serviceFee.minor.toString(),
    serviceFeeBp: quote.serviceFeeBp,
    networkFeeBase: quote.networkFee.base.toString(),
    receiveUnits:
      quote.receive.kind === "fiat"
        ? quote.receive.minor.toString()
        : quote.receive.base.toString(),
    rateUnits: quote.rate.value.v.toString(),
    locationSlug: input.locationSlug,
    walletAddress: input.walletAddress,
    email: input.email,
    status: "created",
    createdAt: at,
    expiresAt: at + ORDER_HOLD_MS,
    events: [
      {
        status: "created",
        at,
        note:
          quote.direction === "cash-to-crypto"
            ? "Rate held. The counter is expecting you."
            : "Deposit address issued for this order.",
      },
    ],
  };

  const saved = await store.create(order);
  return { ok: true, order: saved, quote };
}

/** Rebuilds the priced quote an order was created from, for display. */
export function quoteOf(order: Order): Quote | undefined {
  const result = buildQuote(
    {
      direction: order.direction,
      give: order.direction === "cash-to-crypto" ? decimalise(order.giveUnits, order.fiat) : decimaliseCrypto(order.giveUnits, order.asset),
      fiat: order.fiat,
      asset: order.asset,
      network: order.network,
      at: order.createdAt,
    },
  );
  return result.ok ? result.quote : undefined;
}

function decimalise(units: string, fiat: FiatCode): string {
  const decimals = FIAT[fiat].decimals;
  return shiftDecimal(units, decimals);
}

function decimaliseCrypto(units: string, asset: CryptoCode): string {
  return shiftDecimal(units, CRYPTO[asset].decimals);
}

function shiftDecimal(units: string, decimals: number): string {
  const negative = units.startsWith("-");
  const digits = (negative ? units.slice(1) : units).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals === 0 ? "" : digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export { generateReference, isValidReference, normaliseReference } from "./reference";
export type { Order, OrderStatus, OrderEvent, CreateOrderInput } from "./types";
export { ORDER_HOLD_MS, isTerminal, statusRank, STATUS_SEQUENCE } from "./types";
export type { Direction, CryptoCode, FiatCode, NetworkId };
