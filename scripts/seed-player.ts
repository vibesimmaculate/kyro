/**
 * Creates a player with a credited balance, for exercising the games locally.
 *
 *   pnpm db:player
 *
 * The credit goes through the same `creditDeposit` the chain watcher uses, so
 * the ledger ends up in exactly the state a real confirmed deposit would leave
 * it in — balanced postings, an idempotency key, the house account carrying the
 * matching obligation. No shortcut, no special case.
 */

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { admin } = await import("@/server/supabase/admin");
const { creditDeposit, balanceOf } = await import("@/server/ledger");

const EMAIL = process.env.PLAYER_EMAIL ?? "player@kyro.test";
const PASSWORD = process.env.PLAYER_PASSWORD ?? "counter-fixture-2026";
/** 1 000.00 USDT, in base units (6 dp). */
const CREDIT = 1_000_000_000n;

async function main() {
  const db = admin();

  const { data: existing } = await db.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === EMAIL);

  let userId: string;
  if (found) {
    userId = found.id;
    console.log(`Player already exists: ${EMAIL}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Could not create player: ${error?.message}`);
    userId = data.user.id;
    console.log(`Created player: ${EMAIL}`);
  }

  await db
    .from("profiles")
    .upsert(
      { id: userId, display_name: "Test player", age_confirmed_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  const before = await balanceOf({ kind: "user", userId, asset: "USDT" });
  if (before < CREDIT) {
    await creditDeposit({
      userId,
      asset: "USDT",
      amount: CREDIT,
      // A distinct id each run, so topping up is possible without the
      // idempotency key silently swallowing it.
      depositId: randomUUID(),
    });
  }

  const after = await balanceOf({ kind: "user", userId, asset: "USDT" });

  console.log(`\n  email     ${EMAIL}`);
  console.log(`  password  ${PASSWORD}`);
  console.log(`  balance   ${Number(after) / 1e6} USDT`);
  console.log(`\nSign in at /sign-in and play at /games.\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
