import "server-only";

import { CRYPTO, type CryptoCode, type NetworkId } from "@/lib/money/currencies";
import { adapterFor, validateAddress } from "@/server/chains";
import { env } from "@/server/env";
import { balanceOf, reserveWithdrawal, reverseWithdrawal, settleWithdrawal } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";

/**
 * Withdrawals.
 *
 * The riskiest path in the product, so it is the most constrained one. A
 * request never reaches a signing key directly: it becomes a row, passes a set
 * of checks, and is broadcast by a separate step that an operator can hold.
 *
 *   1. Validate the address for the chain it is going to.
 *   2. Reserve the funds — they leave the spendable balance immediately, so the
 *      same money cannot be withdrawn twice or gambled while in flight.
 *   3. Apply the caps: per withdrawal, per rolling day.
 *   4. Below the approval threshold, queue for automatic broadcast. At or above
 *      it, wait for a human.
 *   5. Broadcast, then confirm, then settle the ledger.
 *
 * Every failure path reverses the reservation. Money is never left stranded in
 * a state nobody owns.
 */

const numeric = (value: bigint | string): number => String(value) as unknown as number;

export type WithdrawalRefusal =
  | { readonly code: "bad-address"; readonly message: string }
  | { readonly code: "insufficient-balance"; readonly message: string }
  | { readonly code: "below-minimum"; readonly message: string }
  | { readonly code: "daily-cap"; readonly message: string }
  | { readonly code: "self-excluded"; readonly message: string }
  | { readonly code: "unsupported"; readonly message: string };

export type RequestResult =
  | { readonly ok: true; readonly withdrawalId: string; readonly needsApproval: boolean }
  | { readonly ok: false; readonly refusal: WithdrawalRefusal };

/**
 * Approximate USD value, used only for the risk caps.
 *
 * Deliberately crude and deliberately conservative: the caps exist to bound
 * damage, not to price anything, and a rough figure that errs towards holding a
 * withdrawal is the right kind of wrong.
 */
const APPROX_USD_PER_UNIT: Record<CryptoCode, number> = {
  BTC: 100_000,
  ETH: 3_400,
  SOL: 180,
  USDT: 1,
  USDC: 1,
};

function approximateUsd(asset: CryptoCode, amount: bigint): number {
  const decimals = CRYPTO[asset].decimals;
  // Reduce before converting so a wei value never touches a float at full size.
  const whole = Number(amount / 10n ** BigInt(decimals));
  const fraction = Number(amount % 10n ** BigInt(decimals)) / 10 ** decimals;
  return (whole + fraction) * APPROX_USD_PER_UNIT[asset];
}

/** The smallest withdrawal worth making: below this the fee dominates. */
function minimumFor(asset: CryptoCode): bigint {
  const unit = 10n ** BigInt(CRYPTO[asset].decimals);
  switch (asset) {
    case "BTC":
      return unit / 10_000n; // 0.0001 BTC
    case "ETH":
      return unit / 1_000n; // 0.001 ETH
    case "SOL":
      return unit / 100n; // 0.01 SOL
    default:
      return unit; // 1 USDT / USDC
  }
}

export async function requestWithdrawal(options: {
  readonly userId: string;
  readonly asset: CryptoCode;
  readonly network: NetworkId;
  readonly address: string;
  readonly amount: bigint;
}): Promise<RequestResult> {
  const db = admin();
  const e = env();

  const check = validateAddress(options.network, options.address);
  if (!check.ok) {
    return { ok: false, refusal: { code: "bad-address", message: check.reason } };
  }

  if (!CRYPTO[options.asset].networks.includes(options.network)) {
    return {
      ok: false,
      refusal: {
        code: "unsupported",
        message: `${options.asset} does not move on that network.`,
      },
    };
  }

  const minimum = minimumFor(options.asset);
  if (options.amount < minimum) {
    return {
      ok: false,
      refusal: {
        code: "below-minimum",
        message: "That is below the smallest withdrawal worth making — the network fee would take most of it.",
      },
    };
  }

  // Self-exclusion blocks money leaving as well as money being staked; someone
  // who has excluded themselves should not be transacting at all.
  const { data: profile } = await db
    .from("profiles")
    .select("self_excluded_until")
    .eq("id", options.userId)
    .maybeSingle();

  if (profile?.self_excluded_until && new Date(profile.self_excluded_until) > new Date()) {
    return {
      ok: false,
      refusal: {
        code: "self-excluded",
        message: "Your account is self-excluded. Contact support to arrange a withdrawal.",
      },
    };
  }

  const balance = await balanceOf({ kind: "user", userId: options.userId, asset: options.asset });
  if (balance < options.amount) {
    return {
      ok: false,
      refusal: {
        code: "insufficient-balance",
        message: "That is more than your balance.",
      },
    };
  }

  const { data: recentRaw } = await db.rpc("withdrawn_last_24h", {
    p_user_id: options.userId,
    p_asset: options.asset,
  });
  const recent = BigInt(String(recentRaw ?? "0"));
  const dailyUsd = approximateUsd(options.asset, recent + options.amount);
  if (dailyUsd > e.KYRO_DAILY_WITHDRAWAL_CAP_USD) {
    return {
      ok: false,
      refusal: {
        code: "daily-cap",
        message: `That would take you past the ${e.KYRO_DAILY_WITHDRAWAL_CAP_USD} USD daily withdrawal limit. Try again tomorrow, or contact support.`,
      },
    };
  }

  const needsApproval =
    approximateUsd(options.asset, options.amount) >= e.KYRO_WITHDRAWAL_APPROVAL_THRESHOLD_USD;

  const { data: row, error } = await db
    .from("withdrawals")
    .insert({
      user_id: options.userId,
      chain: options.network,
      asset: options.asset,
      address: check.normalised,
      amount: numeric(options.amount),
      status: needsApproval ? "awaiting-approval" : "approved",
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(`Could not record the withdrawal: ${error?.message ?? "unknown"}`);
  }

  // Reserve immediately. From this moment the money is out of the spendable
  // balance, so it cannot be staked, spent or withdrawn again while it waits.
  try {
    const transactionId = await reserveWithdrawal({
      userId: options.userId,
      asset: options.asset,
      amount: options.amount,
      withdrawalId: row.id,
    });
    await db.from("withdrawals").update({ reserve_transaction_id: transactionId }).eq("id", row.id);
  } catch (reserveError) {
    await db
      .from("withdrawals")
      .update({
        status: "failed",
        failure_reason: reserveError instanceof Error ? reserveError.message : "reserve failed",
      })
      .eq("id", row.id);
    throw reserveError;
  }

  return { ok: true, withdrawalId: row.id, needsApproval };
}

export async function approveWithdrawal(withdrawalId: string, approverId: string): Promise<void> {
  const { error } = await admin()
    .from("withdrawals")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approverId,
    })
    .eq("id", withdrawalId)
    .eq("status", "awaiting-approval");

  if (error) throw new Error(`Could not approve: ${error.message}`);

  await admin().from("audit_log").insert({
    actor: approverId,
    action: "withdrawal.approve",
    subject: withdrawalId,
  });
}

export async function rejectWithdrawal(
  withdrawalId: string,
  approverId: string,
  reason: string,
): Promise<void> {
  const db = admin();
  const { data: row } = await db
    .from("withdrawals")
    .select("id,user_id,asset,amount::text,status")
    .eq("id", withdrawalId)
    .maybeSingle()
    .returns<{
      id: string;
      user_id: string | null;
      asset: CryptoCode;
      amount: string;
      status: string;
    } | null>();

  if (!row || !row.user_id) return;
  if (row.status !== "awaiting-approval" && row.status !== "approved") return;

  // Give the money back before marking it rejected, so a failure between the
  // two leaves the funds reserved rather than vanished.
  await reverseWithdrawal({
    userId: row.user_id,
    asset: row.asset,
    amount: BigInt(row.amount),
    withdrawalId: row.id,
  });

  await db
    .from("withdrawals")
    .update({ status: "rejected", failure_reason: reason })
    .eq("id", withdrawalId);

  await db.from("audit_log").insert({
    actor: approverId,
    action: "withdrawal.reject",
    subject: withdrawalId,
    detail: { reason },
  });
}

/**
 * Signs and broadcasts everything that has been approved.
 *
 * Called by the internal driver route, never by a user action — the separation
 * is what lets an operator stop payouts by simply not running it.
 */
export async function broadcastApproved(limit = 5): Promise<number> {
  const db = admin();
  const { data: queue } = await db
    .from("withdrawals")
    .select("id,user_id,chain,asset,address,amount::text")
    .eq("status", "approved")
    .order("requested_at", { ascending: true })
    .limit(limit)
    .returns<
      Array<{
        id: string;
        user_id: string | null;
        chain: NetworkId;
        asset: CryptoCode;
        address: string;
        amount: string;
      }>
    >();

  let sent = 0;

  for (const row of queue ?? []) {
    try {
      const adapter = adapterFor(row.chain);
      const signed = await adapter.buildAndSignWithdrawal({
        asset: row.asset,
        to: row.address,
        amount: BigInt(row.amount),
        fromIndex: 0,
      });

      // Recorded before broadcasting: if the network call times out, the hash
      // is already known and the transfer is traceable rather than lost.
      await db
        .from("withdrawals")
        .update({
          tx_hash: signed.hash,
          network_fee: numeric(signed.fee),
          broadcast_at: new Date().toISOString(),
          status: "broadcast",
        })
        .eq("id", row.id);

      const hash = await adapter.broadcast(signed);
      if (hash !== signed.hash) {
        await db.from("withdrawals").update({ tx_hash: hash }).eq("id", row.id);
      }
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("withdrawals")
        .update({ status: "failed", failure_reason: message })
        .eq("id", row.id);

      if (row.user_id) {
        await reverseWithdrawal({
          userId: row.user_id,
          asset: row.asset,
          amount: BigInt(row.amount),
          withdrawalId: row.id,
        });
      }
    }
  }

  return sent;
}

/** Moves broadcast withdrawals to confirmed once the chain agrees. */
export async function confirmBroadcast(): Promise<number> {
  const db = admin();
  const { data: pending } = await db
    .from("withdrawals")
    .select("id,chain,asset,amount::text,network_fee::text,tx_hash,user_id")
    .eq("status", "broadcast")
    .returns<
      Array<{
        id: string;
        chain: NetworkId;
        asset: CryptoCode;
        amount: string;
        network_fee: string | null;
        tx_hash: string | null;
        user_id: string | null;
      }>
    >();

  let confirmed = 0;

  for (const row of pending ?? []) {
    if (!row.tx_hash) continue;
    const confirmations = await adapterFor(row.chain).getConfirmations(row.tx_hash);

    if (confirmations < 0) {
      // The chain rejected it. Return the money.
      await db
        .from("withdrawals")
        .update({ status: "failed", failure_reason: "Transaction reverted on chain" })
        .eq("id", row.id);
      if (row.user_id) {
        await reverseWithdrawal({
          userId: row.user_id,
          asset: row.asset,
          amount: BigInt(row.amount),
          withdrawalId: row.id,
        });
      }
      continue;
    }

    if (confirmations < 1) continue;

    await settleWithdrawal({
      asset: row.asset,
      amount: BigInt(row.amount),
      networkFee: BigInt(row.network_fee ?? "0"),
      withdrawalId: row.id,
    });

    await db
      .from("withdrawals")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", row.id);

    confirmed += 1;
  }

  return confirmed;
}
