import "server-only";

import { LOCATIONS } from "@/fixtures/locations";
import { buildQuote } from "@/lib/quote/engine";
import type { OrderStore } from "./store";
import { ORDER_HOLD_MS, statusRank, type Order, type OrderEvent, type OrderStatus } from "./types";

/**
 * In-process order store.
 *
 * Used when no Supabase credentials are configured, so the site is fully
 * usable — and fully testable — without a database. It is explicitly not
 * durable: a restart empties it. `isDurable` says so, and the operator console
 * shows a notice rather than pretending otherwise.
 *
 * Held on globalThis so Next's dev-time module reloading does not silently
 * discard orders mid-session.
 */

interface MemoryState {
  orders: Map<string, Order>;
  seeded: boolean;
}

const KEY = Symbol.for("kyro.order-store.memory");

function state(): MemoryState {
  const globals = globalThis as unknown as Record<symbol, MemoryState | undefined>;
  let existing = globals[KEY];
  if (!existing) {
    existing = { orders: new Map(), seeded: false };
    globals[KEY] = existing;
  }
  if (!existing.seeded) {
    existing.seeded = true;
    for (const order of demoOrders()) existing.orders.set(order.reference, order);
  }
  return existing;
}

/**
 * Two orders that always exist, so /track can be tried without first creating
 * one. Both are clearly marked as demonstration orders in the UI.
 */
export const DEMO_REFERENCES = {
  inFlight: "KYR-4H2N-8QX1",
  complete: "KYR-7PMC-3TDW",
} as const;

function demoOrders(): Order[] {
  const now = Date.now();
  const location = LOCATIONS[0]?.slug ?? "sarajevo-bascarsija";

  const priced = buildQuote({
    direction: "cash-to-crypto",
    give: "1000",
    fiat: "EUR",
    asset: "BTC",
    network: "bitcoin",
    at: now - 40 * 60 * 1000,
  });

  const settled = buildQuote({
    direction: "crypto-to-cash",
    give: "500",
    fiat: "EUR",
    asset: "USDT",
    network: "tron",
    at: now - 3 * 60 * 60 * 1000,
  });

  const orders: Order[] = [];

  if (priced.ok) {
    const q = priced.quote;
    const created = now - 40 * 60 * 1000;
    orders.push({
      reference: DEMO_REFERENCES.inFlight,
      direction: q.direction,
      fiat: q.fiat,
      asset: q.asset,
      network: q.network,
      giveUnits: q.give.kind === "fiat" ? q.give.minor.toString() : q.give.base.toString(),
      grossMinor: q.gross.minor.toString(),
      serviceFeeMinor: q.serviceFee.minor.toString(),
      serviceFeeBp: q.serviceFeeBp,
      networkFeeBase: q.networkFee.base.toString(),
      receiveUnits:
        q.receive.kind === "fiat" ? q.receive.minor.toString() : q.receive.base.toString(),
      rateUnits: q.rate.value.v.toString(),
      locationSlug: location,
      walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      email: "demo@kyro.example",
      status: "awaiting-funds",
      createdAt: created,
      expiresAt: created + ORDER_HOLD_MS,
      events: [
        { status: "created", at: created, note: "Rate held. The pickup point is expecting you." },
        {
          status: "identity-confirmed",
          at: created + 12 * 60 * 1000,
          note: "ID checked against the name on the order.",
        },
        {
          status: "awaiting-funds",
          at: created + 13 * 60 * 1000,
          note: "The cashier is counting and confirming your cash.",
        },
      ],
    });
  }

  if (settled.ok) {
    const q = settled.quote;
    const created = now - 3 * 60 * 60 * 1000;
    orders.push({
      reference: DEMO_REFERENCES.complete,
      direction: q.direction,
      fiat: q.fiat,
      asset: q.asset,
      network: q.network,
      giveUnits: q.give.kind === "fiat" ? q.give.minor.toString() : q.give.base.toString(),
      grossMinor: q.gross.minor.toString(),
      serviceFeeMinor: q.serviceFee.minor.toString(),
      serviceFeeBp: q.serviceFeeBp,
      networkFeeBase: q.networkFee.base.toString(),
      receiveUnits:
        q.receive.kind === "fiat" ? q.receive.minor.toString() : q.receive.base.toString(),
      rateUnits: q.rate.value.v.toString(),
      locationSlug: LOCATIONS[4]?.slug ?? location,
      depositAddress: "TQ5NMqJjaVkM5ZGHwCVSTGrhCTPRoLbAsK",
      email: "demo@kyro.example",
      status: "complete",
      depositTxHash: "9f2c1b0d7a4e5f8c3b6a1d0e9f8c7b6a5d4e3f2c1b0a9f8e7d6c5b4a3f2e1d0c",
      createdAt: created,
      expiresAt: created + ORDER_HOLD_MS,
      events: [
        { status: "created", at: created, note: "Deposit address issued for this order." },
        { status: "identity-confirmed", at: created + 9 * 60 * 1000 },
        {
          status: "awaiting-funds",
          at: created + 10 * 60 * 1000,
          note: "Waiting for 19 confirmations on Tron.",
        },
        { status: "funds-received", at: created + 14 * 60 * 1000, note: "Transfer confirmed." },
        {
          status: "settlement-sent",
          at: created + 16 * 60 * 1000,
          note: "Cash counted and ready at the pickup point.",
        },
        { status: "complete", at: created + 52 * 60 * 1000, note: "Collected. Thank you." },
      ],
    });
  }

  return orders;
}

export const memoryOrderStore: OrderStore = {
  id: "memory",
  isDurable: false,

  async create(order) {
    state().orders.set(order.reference, order);
    return order;
  },

  async byReference(reference) {
    return state().orders.get(reference.toUpperCase());
  },

  async advance(reference, status, event, patch) {
    const store = state();
    const existing = store.orders.get(reference.toUpperCase());
    if (!existing) return undefined;

    // Refuse to move an order backwards; an operator misclick should not
    // rewrite history.
    if (statusRank(status) !== -1 && statusRank(status) < statusRank(existing.status)) {
      return existing;
    }

    const next: Order = {
      ...existing,
      ...patch,
      status,
      events: [...existing.events, { ...event, status } satisfies OrderEvent],
    };
    store.orders.set(next.reference, next);
    return next;
  },

  async patch(reference, patch) {
    const store = state();
    const existing = store.orders.get(reference.toUpperCase());
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    store.orders.set(next.reference, next);
    return next;
  },

  async list(options) {
    const all = [...state().orders.values()].sort((a, b) => b.createdAt - a.createdAt);
    const filtered: readonly Order[] = options?.status
      ? all.filter((o) => o.status === options.status)
      : all;
    return options?.limit ? filtered.slice(0, options.limit) : filtered;
  },
};

export type { OrderStatus };
