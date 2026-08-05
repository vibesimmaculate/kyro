import "server-only";

import { admin } from "@/server/supabase/admin";
import type { Database } from "@/server/supabase/database.types";
import type { OrderStore } from "./store";
import { statusRank, type Order, type OrderStatus } from "./types";

type EventRow = Database["public"]["Tables"]["order_events"]["Row"];

/**
 * Orders in Postgres.
 *
 * ⚠ The generated types describe `numeric` columns as `number`. They are wrong,
 * and dangerously so: a wei-scale amount is far past 2^53, so letting one
 * become a JS number would silently corrupt it. Two rules follow.
 *
 *   Reading — every amount is selected with `::text` so PostgREST returns the
 *   digits verbatim and `JSON.parse` never sees a number to mangle.
 *
 *   Writing — PostgREST accepts a decimal string for a numeric column. The
 *   `numeric()` helper below carries that past the incorrect generated type, in
 *   one place, on purpose.
 */

const numeric = (value: string): number => value as unknown as number;

/** Amount columns come back as text; the rest keep their generated types. */
const ORDER_SELECT = [
  "reference",
  "direction",
  "fiat",
  "asset",
  "network",
  "location_slug",
  "wallet_address",
  "deposit_address",
  "email",
  "status",
  "tx_hash",
  "deposit_tx_hash",
  "created_at",
  "expires_at",
  "service_fee_bp",
  "give_units::text",
  "gross_minor::text",
  "service_fee_minor::text",
  "network_fee_base::text",
  "receive_units::text",
  "rate_units::text",
].join(",");

interface OrderRow {
  reference: string;
  direction: Order["direction"];
  fiat: Order["fiat"];
  asset: Order["asset"];
  network: Order["network"];
  location_slug: string;
  wallet_address: string | null;
  deposit_address: string | null;
  email: string | null;
  status: OrderStatus;
  tx_hash: string | null;
  deposit_tx_hash: string | null;
  created_at: string;
  expires_at: string;
  service_fee_bp: number;
  give_units: string;
  gross_minor: string;
  service_fee_minor: string;
  network_fee_base: string;
  receive_units: string;
  rate_units: string;
}

function toOrder(row: OrderRow, events: readonly EventRow[]): Order {
  return {
    reference: row.reference,
    direction: row.direction,
    fiat: row.fiat,
    asset: row.asset,
    network: row.network,
    giveUnits: String(row.give_units),
    grossMinor: String(row.gross_minor),
    serviceFeeMinor: String(row.service_fee_minor),
    serviceFeeBp: row.service_fee_bp,
    networkFeeBase: String(row.network_fee_base),
    receiveUnits: String(row.receive_units),
    rateUnits: String(row.rate_units),
    locationSlug: row.location_slug,
    walletAddress: row.wallet_address ?? undefined,
    depositAddress: row.deposit_address ?? undefined,
    email: row.email ?? undefined,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    txHash: row.tx_hash ?? undefined,
    depositTxHash: row.deposit_tx_hash ?? undefined,
    events: events
      .map((e) => ({
        status: e.status,
        at: new Date(e.at).getTime(),
        note: e.note ?? undefined,
        actor: e.actor ?? undefined,
      }))
      .sort((a, b) => a.at - b.at),
  };
}

function toRow(order: Order): Database["public"]["Tables"]["orders"]["Insert"] {
  return {
    reference: order.reference,
    direction: order.direction,
    fiat: order.fiat,
    asset: order.asset,
    network: order.network,
    give_units: numeric(order.giveUnits),
    gross_minor: numeric(order.grossMinor),
    service_fee_minor: numeric(order.serviceFeeMinor),
    service_fee_bp: order.serviceFeeBp,
    network_fee_base: numeric(order.networkFeeBase),
    receive_units: numeric(order.receiveUnits),
    rate_units: numeric(order.rateUnits),
    location_slug: order.locationSlug,
    wallet_address: order.walletAddress ?? null,
    deposit_address: order.depositAddress ?? null,
    email: order.email ?? null,
    status: order.status,
    tx_hash: order.txHash ?? null,
    deposit_tx_hash: order.depositTxHash ?? null,
    created_at: new Date(order.createdAt).toISOString(),
    expires_at: new Date(order.expiresAt).toISOString(),
  };
}

function patchToRow(patch: Partial<Order>): Database["public"]["Tables"]["orders"]["Update"] {
  const row: Database["public"]["Tables"]["orders"]["Update"] = {};
  if (patch.walletAddress !== undefined) row.wallet_address = patch.walletAddress;
  if (patch.depositAddress !== undefined) row.deposit_address = patch.depositAddress;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.txHash !== undefined) row.tx_hash = patch.txHash;
  if (patch.depositTxHash !== undefined) row.deposit_tx_hash = patch.depositTxHash;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.locationSlug !== undefined) row.location_slug = patch.locationSlug;
  return row;
}

async function loadEvents(references: readonly string[]): Promise<Map<string, EventRow[]>> {
  const map = new Map<string, EventRow[]>();
  if (references.length === 0) return map;
  const { data } = await admin()
    .from("order_events")
    .select("*")
    .in("reference", references as string[]);
  for (const event of data ?? []) {
    const list = map.get(event.reference) ?? [];
    list.push(event);
    map.set(event.reference, list);
  }
  return map;
}

export const supabaseOrderStore: OrderStore = {
  id: "supabase",
  isDurable: true,

  async create(order) {
    const { error } = await admin().from("orders").insert(toRow(order));
    if (error) throw new Error(`Could not create order: ${error.message}`);

    if (order.events.length > 0) {
      const { error: eventError } = await admin()
        .from("order_events")
        .insert(
          order.events.map((e) => ({
            reference: order.reference,
            status: e.status,
            note: e.note ?? null,
            at: new Date(e.at).toISOString(),
          })),
        );
      if (eventError) throw new Error(`Could not record order events: ${eventError.message}`);
    }
    return order;
  },

  async byReference(reference) {
    const key = reference.toUpperCase();
    const { data } = await admin()
      .from("orders")
      .select(ORDER_SELECT)
      .eq("reference", key)
      .maybeSingle()
      .returns<OrderRow | null>();
    if (!data) return undefined;
    const events = await loadEvents([key]);
    return toOrder(data, events.get(key) ?? []);
  },

  async advance(reference, status, event, patch) {
    const key = reference.toUpperCase();
    const existing = await supabaseOrderStore.byReference(key);
    if (!existing) return undefined;

    // Never move an order backwards. An operator misclick should not rewrite
    // a history that a customer has already been shown.
    if (statusRank(status) !== -1 && statusRank(status) < statusRank(existing.status)) {
      return existing;
    }

    const { error } = await admin()
      .from("orders")
      .update({ ...patchToRow(patch ?? {}), status })
      .eq("reference", key);
    if (error) throw new Error(`Could not advance order: ${error.message}`);

    const { error: eventError } = await admin().from("order_events").insert({
      reference: key,
      status,
      note: event.note ?? null,
      actor: event.actor ?? null,
      at: new Date(event.at).toISOString(),
    });
    if (eventError) throw new Error(`Could not record order event: ${eventError.message}`);

    return supabaseOrderStore.byReference(key);
  },

  async patch(reference, patch) {
    const key = reference.toUpperCase();
    const { error } = await admin().from("orders").update(patchToRow(patch)).eq("reference", key);
    if (error) throw new Error(`Could not update order: ${error.message}`);
    return supabaseOrderStore.byReference(key);
  },

  async list(options) {
    let query = admin()
      .from("orders")
      .select(ORDER_SELECT)
      .order("created_at", { ascending: false });
    if (options?.status) query = query.eq("status", options.status);
    if (options?.limit) query = query.limit(options.limit);

    const { data } = await query.returns<OrderRow[]>();
    const rows = data ?? [];
    const events = await loadEvents(rows.map((r) => r.reference));
    return rows.map((row) => toOrder(row, events.get(row.reference) ?? []));
  },
};

export type { OrderStatus };
