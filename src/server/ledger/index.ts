import "server-only";

import type { CryptoCode } from "@/lib/money/currencies";
import { admin } from "@/server/supabase/admin";
import type { Database } from "@/server/supabase/database.types";

/**
 * The ledger.
 *
 * Money is only ever moved, never created: every transaction writes postings
 * that sum to zero per asset, and a deferred database constraint refuses the
 * whole transaction if they do not. Balances are derived by summing postings,
 * so there is no balance column that can drift out of step with its history.
 *
 * Every writer supplies an idempotency key. A retried request — a webhook
 * delivered twice, a scanner re-reading a block, a user double-clicking —
 * returns the original transaction rather than moving the money again.
 *
 * As with orders, `numeric` amounts are read with `::text` and written as
 * strings. A wei value is past 2^53 and JSON.parse would round it.
 */

export type AccountKind = Database["public"]["Enums"]["kyro_account_kind"];

const numeric = (value: bigint | string): number => String(value) as unknown as number;

export interface Posting {
  readonly account: AccountRef;
  readonly delta: bigint;
}

export type AccountRef =
  | { readonly kind: "user"; readonly userId: string; readonly asset: CryptoCode }
  | { readonly kind: Exclude<AccountKind, "user">; readonly asset: CryptoCode };

export interface TransferInput {
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly postings: readonly Posting[];
  readonly referenceType?: string;
  readonly referenceId?: string;
}

/** Finds or creates the account, so callers never juggle account ids. */
export async function accountId(ref: AccountRef): Promise<string> {
  const db = admin();

  const query = db.from("accounts").select("id").eq("kind", ref.kind).eq("asset", ref.asset);
  const scoped = ref.kind === "user" ? query.eq("user_id", ref.userId) : query.is("user_id", null);

  const { data: existing } = await scoped.maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await db
    .from("accounts")
    .insert({
      kind: ref.kind,
      asset: ref.asset,
      user_id: ref.kind === "user" ? ref.userId : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    // A concurrent request may have created it between the read and the write;
    // the unique index makes that safe, so read it back rather than failing.
    const { data: raced } = await (ref.kind === "user"
      ? db
          .from("accounts")
          .select("id")
          .eq("kind", ref.kind)
          .eq("asset", ref.asset)
          .eq("user_id", ref.userId)
      : db
          .from("accounts")
          .select("id")
          .eq("kind", ref.kind)
          .eq("asset", ref.asset)
          .is("user_id", null)
    ).maybeSingle();
    if (raced) return raced.id;
    throw new Error(`Could not open a ${ref.kind} account: ${error?.message ?? "unknown"}`);
  }

  return created.id;
}

/**
 * Writes one balanced transaction.
 *
 * Returns the existing transaction id when the idempotency key has been seen
 * before, without writing anything.
 */
export async function transfer(input: TransferInput): Promise<string> {
  const db = admin();

  const { data: existing } = await db
    .from("ledger_transactions")
    .select("id")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing.id;

  // Caught here as well as in the database: a clear message beats a constraint
  // violation when the mistake is in our own code.
  const totals = new Map<CryptoCode, bigint>();
  for (const posting of input.postings) {
    const asset = posting.account.asset;
    totals.set(asset, (totals.get(asset) ?? 0n) + posting.delta);
  }
  for (const [asset, total] of totals) {
    if (total !== 0n) {
      throw new Error(
        `Refusing to write an unbalanced transaction: ${asset} postings sum to ${total}, must be 0.`,
      );
    }
  }

  const ids = await Promise.all(input.postings.map((p) => accountId(p.account)));

  const { data: transaction, error } = await db
    .from("ledger_transactions")
    .insert({
      kind: input.kind,
      idempotency_key: input.idempotencyKey,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
    })
    .select("id")
    .single();

  if (error || !transaction) {
    // Lost a race on the unique key: the other writer's transaction is the one.
    const { data: raced } = await db
      .from("ledger_transactions")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (raced) return raced.id;
    throw new Error(`Could not open a ledger transaction: ${error?.message ?? "unknown"}`);
  }

  const { error: postingError } = await db.from("ledger_postings").insert(
    input.postings.map((posting, index) => ({
      transaction_id: transaction.id,
      account_id: ids[index] as string,
      asset: posting.account.asset,
      delta: numeric(posting.delta),
    })),
  );

  if (postingError) {
    // The balance constraint is deferred, so this is where an imbalance
    // surfaces. The transaction row is orphaned rather than left half-posted.
    await db.from("ledger_transactions").delete().eq("id", transaction.id);
    throw new Error(`Ledger rejected the postings: ${postingError.message}`);
  }

  return transaction.id;
}

/** Current balance of an account, in the asset's base units. */
export async function balanceOf(ref: AccountRef): Promise<bigint> {
  const db = admin();
  const id = await accountId(ref);
  const { data } = await db
    .from("ledger_postings")
    .select("delta::text")
    .eq("account_id", id)
    .returns<Array<{ delta: string }>>();

  return (data ?? []).reduce((total, row) => total + BigInt(row.delta), 0n);
}

/** Every asset a user holds, for the wallet screen. */
export async function balancesFor(userId: string): Promise<Map<CryptoCode, bigint>> {
  const db = admin();
  const { data } = await db
    .from("account_balances")
    .select("asset,balance::text")
    .eq("user_id", userId)
    .eq("kind", "user")
    .returns<Array<{ asset: CryptoCode; balance: string }>>();

  const balances = new Map<CryptoCode, bigint>();
  for (const row of data ?? []) balances.set(row.asset, BigInt(row.balance));
  return balances;
}

/* ── The movements the product actually makes ───────────────────────────── */

/**
 * Sign convention, stated once because everything below depends on it.
 *
 * The ledger tracks claims, not coins. A customer's account holds a positive
 * balance — what KYRO owes them — and `house` is its mirror, so it runs
 * negative by roughly the size of total customer deposits. That is not a
 * problem; it is the obligation, made visible.
 *
 * What KYRO actually controls on chain is a separate fact, recorded in the
 * `deposits` and `withdrawals` tables. Reconciling the two — on-chain hot
 * wallet balance against `-house` — is an operational check, shown in the
 * operator console. Deliberately kept apart: conflating "what we hold" with
 * "what we owe" inside one transaction is how ledgers stop balancing.
 */

/** An on-chain deposit, confirmed and credited to the customer. */
export async function creditDeposit(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly amount: bigint;
  readonly depositId: string;
}): Promise<string> {
  return transfer({
    kind: "deposit",
    idempotencyKey: `deposit:${options.depositId}`,
    referenceType: "deposit",
    referenceId: options.depositId,
    postings: [
      {
        account: { kind: "user", userId: options.userId, asset: options.asset },
        delta: options.amount,
      },
      { account: { kind: "house", asset: options.asset }, delta: -options.amount },
    ],
  });
}

/** Moves a withdrawal out of the spendable balance and into reserve. */
export async function reserveWithdrawal(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly amount: bigint;
  readonly withdrawalId: string;
}): Promise<string> {
  return transfer({
    kind: "withdrawal-reserve",
    idempotencyKey: `withdrawal-reserve:${options.withdrawalId}`,
    referenceType: "withdrawal",
    referenceId: options.withdrawalId,
    postings: [
      {
        account: { kind: "user", userId: options.userId, asset: options.asset },
        delta: -options.amount,
      },
      { account: { kind: "pending_withdrawal", asset: options.asset }, delta: options.amount },
    ],
  });
}

/**
 * Releases the reserve once the transfer is confirmed on chain.
 *
 * The coins have left, so the obligation is discharged: the reserve empties
 * into the house. The gas KYRO paid is recorded as its own expense rather than
 * netted away, so the cost of running the wallet is visible in the accounts.
 */
export async function settleWithdrawal(options: {
  readonly asset: CryptoCode;
  readonly amount: bigint;
  readonly networkFee: bigint;
  readonly withdrawalId: string;
}): Promise<string> {
  return transfer({
    kind: "withdrawal-settle",
    idempotencyKey: `withdrawal-settle:${options.withdrawalId}`,
    referenceType: "withdrawal",
    referenceId: options.withdrawalId,
    postings: [
      { account: { kind: "pending_withdrawal", asset: options.asset }, delta: -options.amount },
      { account: { kind: "house", asset: options.asset }, delta: options.amount },
      { account: { kind: "network_fee", asset: options.asset }, delta: options.networkFee },
      { account: { kind: "house", asset: options.asset }, delta: -options.networkFee },
    ],
  });
}

/** Puts a reserved withdrawal back after a rejection or a failed broadcast. */
export async function reverseWithdrawal(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly amount: bigint;
  readonly withdrawalId: string;
}): Promise<string> {
  return transfer({
    kind: "withdrawal-reverse",
    idempotencyKey: `withdrawal-reverse:${options.withdrawalId}`,
    referenceType: "withdrawal",
    referenceId: options.withdrawalId,
    postings: [
      { account: { kind: "pending_withdrawal", asset: options.asset }, delta: -options.amount },
      {
        account: { kind: "user", userId: options.userId, asset: options.asset },
        delta: options.amount,
      },
    ],
  });
}

/* ── Games ─────────────────────────────────────────────────────────────── */

/**
 * Places a bet through the database function, so the balance check and both
 * postings happen inside one transaction under an advisory lock. Two concurrent
 * bets cannot both pass a check against the same balance.
 */
export async function placeBet(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly stake: bigint;
  readonly roundId: string;
}): Promise<{ ok: true; transactionId: string } | { ok: false; reason: "insufficient-balance" }> {
  const { data, error } = await admin().rpc("place_bet", {
    p_user_id: options.userId,
    p_asset: options.asset,
    p_stake: numeric(options.stake),
    p_idempotency_key: `bet:${options.roundId}`,
    p_reference_id: options.roundId,
  });

  if (error) {
    if (error.message.includes("Insufficient balance")) {
      return { ok: false, reason: "insufficient-balance" };
    }
    throw new Error(`Could not place bet: ${error.message}`);
  }
  return { ok: true, transactionId: data as unknown as string };
}

export async function payoutRound(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly payout: bigint;
  readonly roundId: string;
}): Promise<string | undefined> {
  const { data, error } = await admin().rpc("settle_round", {
    p_user_id: options.userId,
    p_asset: options.asset,
    p_payout: numeric(options.payout),
    p_idempotency_key: `payout:${options.roundId}`,
    p_reference_id: options.roundId,
  });

  if (error) throw new Error(`Could not settle round: ${error.message}`);
  return (data as unknown as string | null) ?? undefined;
}
