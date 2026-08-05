import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Ledger invariants, checked against a real Postgres.
 *
 * These are the assertions that matter most in the whole codebase — an
 * arithmetic bug in the money maths is caught by a unit test, but a ledger that
 * lets value be conjured or a balance be double-spent only shows up here.
 *
 * Skipped, loudly, when local Supabase is not running:
 *
 *   pnpm db:start && pnpm test
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let db: SupabaseClient;
let reachable = false;

async function ping(): Promise<boolean> {
  if (!KEY) return false;
  try {
    const response = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(2500),
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  reachable = await ping();
  if (!reachable) {
    console.warn(
      "\n  ⚠ Local Supabase is not reachable — ledger integration tests skipped." +
        "\n    Start it with `pnpm db:start`, then re-run.\n",
    );
    return;
  }
  db = createClient(URL, KEY, { auth: { persistSession: false } });
});

/** A throwaway user, created through auth so the profiles FK is satisfied. */
async function makeUser(): Promise<string> {
  const email = `ledger-${Date.now()}-${Math.floor(performance.now() * 1000)}@kyro.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: "test-password-12345",
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Could not create test user: ${error?.message}`);

  await db.from("profiles").insert({ id: data.user.id, display_name: "Ledger test" });
  return data.user.id;
}

async function accountFor(kind: string, asset: string, userId?: string): Promise<string> {
  const query = db.from("accounts").select("id").eq("kind", kind).eq("asset", asset);
  const scoped = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  const { data } = await scoped.maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await db
    .from("accounts")
    .insert({ kind, asset, user_id: userId ?? null } as never)
    .select("id")
    .single();
  if (error || !created) throw new Error(`Could not open account: ${error?.message}`);
  return created.id;
}

async function balance(accountId: string): Promise<bigint> {
  const { data } = await db
    .from("ledger_postings")
    .select("delta::text")
    .eq("account_id", accountId)
    .returns<Array<{ delta: string }>>();
  return (data ?? []).reduce((total, row) => total + BigInt(row.delta), 0n);
}

async function writeTransaction(
  key: string,
  legs: ReadonlyArray<{ accountId: string; asset: string; delta: string }>,
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await db
    .from("ledger_transactions")
    .insert({ kind: "test", idempotency_key: key })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message };

  const { error: postingError } = await db.from("ledger_postings").insert(
    legs.map((leg) => ({
      transaction_id: data.id,
      account_id: leg.accountId,
      asset: leg.asset,
      delta: leg.delta as never,
    })),
  );

  if (postingError) {
    await db.from("ledger_transactions").delete().eq("id", data.id);
    return { ok: false, message: postingError.message };
  }
  return { ok: true };
}

describe.runIf(await ping())("ledger invariants", () => {
  it("accepts a transaction whose postings sum to zero", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "USDT", userId);
    const house = await accountFor("house", "USDT");

    const result = await writeTransaction(`balanced-${userId}`, [
      { accountId: user, asset: "USDT", delta: "1000000" },
      { accountId: house, asset: "USDT", delta: "-1000000" },
    ]);

    expect(result.ok, result.message).toBe(true);
    expect(await balance(user)).toBe(1_000_000n);
  });

  it("refuses to let value be conjured", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "USDT", userId);
    const house = await accountFor("house", "USDT");

    // One unit more credited than debited. The database must reject the whole
    // transaction, not the offending row.
    const result = await writeTransaction(`unbalanced-${userId}`, [
      { accountId: user, asset: "USDT", delta: "1000001" },
      { accountId: house, asset: "USDT", delta: "-1000000" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Unbalanced ledger transaction/);
    expect(await balance(user)).toBe(0n);
  });

  it("balances each asset independently", async () => {
    const userId = await makeUser();
    const usdt = await accountFor("user", "USDT", userId);
    const btc = await accountFor("user", "BTC", userId);
    const houseUsdt = await accountFor("house", "USDT");

    // USDT balances; BTC does not. The transaction must still be refused.
    const result = await writeTransaction(`per-asset-${userId}`, [
      { accountId: usdt, asset: "USDT", delta: "500" },
      { accountId: houseUsdt, asset: "USDT", delta: "-500" },
      { accountId: btc, asset: "BTC", delta: "700" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/BTC/);
    expect(await balance(btc)).toBe(0n);
  });

  it("keeps a wei-scale amount exact through a full round trip", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "ETH", userId);
    const house = await accountFor("house", "ETH");

    // 12.345678901234567891 ETH — well past what a double can hold.
    const wei = "12345678901234567891";
    await writeTransaction(`wei-${userId}`, [
      { accountId: user, asset: "ETH", delta: wei },
      { accountId: house, asset: "ETH", delta: `-${wei}` },
    ]);

    expect(await balance(user)).toBe(BigInt(wei));
  });

  it("credits a deposit only once, however many times it is replayed", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "USDT", userId);
    const house = await accountFor("house", "USDT");
    const key = `idempotent-${userId}`;

    const first = await writeTransaction(key, [
      { accountId: user, asset: "USDT", delta: "250000" },
      { accountId: house, asset: "USDT", delta: "-250000" },
    ]);
    const second = await writeTransaction(key, [
      { accountId: user, asset: "USDT", delta: "250000" },
      { accountId: house, asset: "USDT", delta: "-250000" },
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await balance(user)).toBe(250_000n);
  });
});

describe.runIf(await ping())("bet settlement", () => {
  it("refuses a stake the player cannot cover", async () => {
    const userId = await makeUser();

    const { error } = await db.rpc("place_bet", {
      p_user_id: userId,
      p_asset: "USDT",
      p_stake: "1000" as never,
      p_idempotency_key: `broke-${userId}`,
      p_reference_id: "round-1",
    });

    expect(error?.message).toMatch(/Insufficient balance/);
  });

  it("cannot be made to pay out twice for one round", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "USDT", userId);
    const house = await accountFor("house", "USDT");

    await writeTransaction(`fund-${userId}`, [
      { accountId: user, asset: "USDT", delta: "1000000" },
      { accountId: house, asset: "USDT", delta: "-1000000" },
    ]);

    const roundId = `round-${userId}`;
    await db.rpc("place_bet", {
      p_user_id: userId,
      p_asset: "USDT",
      p_stake: "100000" as never,
      p_idempotency_key: `bet:${roundId}`,
      p_reference_id: roundId,
    });
    expect(await balance(user)).toBe(900_000n);

    // The same payout key twice — a retried webhook, a double-clicked button.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await db.rpc("settle_round", {
        p_user_id: userId,
        p_asset: "USDT",
        p_payout: "198000" as never,
        p_idempotency_key: `payout:${roundId}`,
        p_reference_id: roundId,
      });
    }

    // Staked 100 000, won 198 000, so exactly one payout landed.
    expect(await balance(user)).toBe(1_098_000n);
  });

  it("survives concurrent bets without letting the balance go negative", async () => {
    const userId = await makeUser();
    const user = await accountFor("user", "USDT", userId);
    const house = await accountFor("house", "USDT");

    await writeTransaction(`race-fund-${userId}`, [
      { accountId: user, asset: "USDT", delta: "100000" },
      { accountId: house, asset: "USDT", delta: "-100000" },
    ]);

    // Ten simultaneous bets of 20 000 against a balance of 100 000. Exactly
    // five may succeed; the advisory lock in place_bet is what makes that true.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.rpc("place_bet", {
          p_user_id: userId,
          p_asset: "USDT",
          p_stake: "20000" as never,
          p_idempotency_key: `race-${userId}-${i}`,
          p_reference_id: `race-${i}`,
        }),
      ),
    );

    const accepted = attempts.filter((a) => !a.error).length;
    expect(accepted).toBe(5);
    expect(await balance(user)).toBe(0n);
  });
});
