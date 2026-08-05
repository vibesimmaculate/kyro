/**
 * Seeds two demonstration orders.
 *
 *   pnpm db:seed
 *
 * They are created through the application's own `createOrder`, so their
 * figures come from the same engine that prices a real order — no hand-written
 * numbers that could drift away from the maths. One is left part-way through,
 * the other carried to completion, so /track has something honest to show and
 * the end-to-end tests have a fixed target.
 */

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { orderStore, createOrder } = await import("@/server/orders");
const { hasSupabase } = await import("@/server/env");

const IN_FLIGHT = "part-way through";
const COMPLETE = "finished";

async function main() {
  if (!hasSupabase()) {
    console.log(
      "Supabase is not configured, so orders live in memory and the two demo\n" +
        "orders already exist. Nothing to seed.",
    );
    return;
  }

  const store = orderStore();

  const first = await createOrder({
    direction: "cash-to-crypto",
    fiat: "EUR",
    asset: "BTC",
    network: "bitcoin",
    amount: "1000",
    locationSlug: "sarajevo-bascarsija",
    walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    email: "demo@kyro.example",
  });
  if (!first.ok) throw new Error(`Could not seed the first order: ${first.reason}`);

  const now = Date.now();
  await store.advance(first.order.reference, "identity-confirmed", {
    at: now - 25 * 60 * 1000,
    note: "ID checked against the name on the order.",
  });
  await store.advance(first.order.reference, "awaiting-funds", {
    at: now - 24 * 60 * 1000,
    note: "The cashier is counting and confirming your cash.",
  });

  const second = await createOrder({
    direction: "crypto-to-cash",
    fiat: "EUR",
    asset: "USDT",
    network: "tron",
    amount: "500",
    locationSlug: "belgrade-vracar",
    email: "demo@kyro.example",
  });
  if (!second.ok) throw new Error(`Could not seed the second order: ${second.reason}`);

  await store.patch(second.order.reference, {
    depositAddress: "TQ5NMqJjaVkM5ZGHwCVSTGrhCTPRoLbAsK",
    depositTxHash: "9f2c1b0d7a4e5f8c3b6a1d0e9f8c7b6a5d4e3f2c1b0a9f8e7d6c5b4a3f2e1d0c",
  });
  for (const [status, note, minutesAgo] of [
    ["identity-confirmed", "ID checked at the counter.", 170],
    ["awaiting-funds", "Waiting for 19 confirmations on Tron.", 168],
    ["funds-received", "Transfer confirmed.", 160],
    ["settlement-sent", "Cash counted and ready at the counter.", 155],
    ["complete", "Collected. Thank you.", 120],
  ] as const) {
    await store.advance(second.order.reference, status, {
      at: now - minutesAgo * 60 * 1000,
      note,
    });
  }

  console.log("Seeded two demonstration orders:\n");
  console.log(`  ${first.order.reference}   ${IN_FLIGHT}`);
  console.log(`  ${second.order.reference}   ${COMPLETE}\n`);
  console.log("Try them at /track, or go straight to /orders/<code>.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
