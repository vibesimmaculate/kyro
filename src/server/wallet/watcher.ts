import "server-only";

import { NETWORK_IDS, type CryptoCode, type NetworkId } from "@/lib/money/currencies";
import { REQUIRED_CONFIRMATIONS } from "@/lib/rates/network-fees";
import { adapterFor } from "@/server/chains";
import { creditDeposit } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";

/**
 * The deposit watcher.
 *
 * Walks each chain from its stored cursor, records everything paid to a KYRO
 * address, and credits it only once it is buried deep enough to be final.
 *
 * Three rules do the real work:
 *
 *   Seen is not credited. A transfer is recorded the moment it appears, but the
 *   ledger is not touched until it has the confirmations that chain requires.
 *
 *   Crediting is idempotent. `(chain, tx_hash, tx_index)` is unique, and the
 *   ledger transaction is keyed on the deposit id. Re-scanning a block, or
 *   running two watchers at once, cannot pay anyone twice.
 *
 *   Reorgs are expected, not exceptional. A transfer that was in a block and no
 *   longer is gets marked orphaned. Because crediting waits for depth, an
 *   orphan is almost always caught before any money moved.
 */

const numeric = (value: bigint | string): number => String(value) as unknown as number;

/** How far back to re-examine, so a shallow reorg cannot slip past the cursor. */
const REORG_BUFFER: Record<NetworkId, number> = {
  bitcoin: 6,
  ethereum: 24,
  base: 40,
  arbitrum: 40,
  tron: 30,
  solana: 64,
};

export interface ScanReport {
  readonly chain: NetworkId;
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly seen: number;
  readonly credited: number;
  readonly orphaned: number;
  readonly error?: string;
}

async function watchedAddresses(chain: NetworkId): Promise<
  Map<string, { userId: string | null; orderReference: string | null }>
> {
  const { data } = await admin()
    .from("deposit_addresses")
    .select("address,user_id,order_reference")
    .eq("chain", chain);

  const map = new Map<string, { userId: string | null; orderReference: string | null }>();
  for (const row of data ?? []) {
    map.set(row.address, { userId: row.user_id, orderReference: row.order_reference });
  }
  return map;
}

async function cursorFor(chain: NetworkId, tip: number): Promise<number> {
  const { data } = await admin()
    .from("chain_cursors")
    .select("last_height")
    .eq("chain", chain)
    .maybeSingle();

  if (data) return Math.max(0, data.last_height - REORG_BUFFER[chain]);

  // First run: start near the tip rather than at genesis. Anything older than
  // this predates the wallet and cannot be ours.
  const start = Math.max(0, tip - REORG_BUFFER[chain]);
  await admin().from("chain_cursors").insert({ chain, last_height: start });
  return start;
}

export async function scanChain(chain: NetworkId): Promise<ScanReport> {
  const base: ScanReport = {
    chain,
    fromHeight: 0,
    toHeight: 0,
    seen: 0,
    credited: 0,
    orphaned: 0,
  };

  try {
    const addresses = await watchedAddresses(chain);
    if (addresses.size === 0) {
      return { ...base, error: undefined };
    }

    const adapter = adapterFor(chain);
    const tip = await adapter.getHeight();
    const from = await cursorFor(chain, tip);

    const found = await adapter.scanForDeposits([...addresses.keys()], from, tip);
    const db = admin();
    let credited = 0;

    for (const deposit of found) {
      const owner = addresses.get(deposit.address);
      if (!owner) continue;

      const required = REQUIRED_CONFIRMATIONS[chain];

      // Upsert on the chain's own natural key. A repeat sighting updates the
      // confirmation count and nothing else.
      const { data: row } = await db
        .from("deposits")
        .upsert(
          {
            chain,
            asset: deposit.asset,
            address: deposit.address,
            user_id: owner.userId,
            order_reference: owner.orderReference,
            tx_hash: deposit.txHash,
            tx_index: deposit.txIndex,
            amount: numeric(deposit.amount),
            confirmations: deposit.confirmations,
            required_confirmations: required,
            block_height: deposit.blockHeight ?? null,
            status: deposit.confirmations >= required ? "confirming" : "seen",
          },
          { onConflict: "chain,tx_hash,tx_index", ignoreDuplicates: false },
        )
        .select("id,status,user_id,amount::text")
        .single()
        .returns<{ id: string; status: string; user_id: string | null; amount: string } | null>();

      if (!row) continue;
      if (row.status === "credited") continue;
      if (deposit.confirmations < required) continue;

      // Deep enough. Credit it — but only a deposit that belongs to an account;
      // one attached to an exchange order settles through the order instead.
      if (row.user_id) {
        const transactionId = await creditDeposit({
          userId: row.user_id,
          asset: deposit.asset,
          amount: BigInt(row.amount),
          depositId: row.id,
        });

        await db
          .from("deposits")
          .update({
            status: "credited",
            credited_at: new Date().toISOString(),
            credited_transaction_id: transactionId,
            confirmations: deposit.confirmations,
          })
          .eq("id", row.id);

        credited += 1;
      } else if (owner.orderReference) {
        await db
          .from("deposits")
          .update({ status: "credited", credited_at: new Date().toISOString() })
          .eq("id", row.id);
        await db
          .from("orders")
          .update({ deposit_tx_hash: deposit.txHash })
          .eq("reference", owner.orderReference);
        credited += 1;
      }
    }

    // Anything previously seen in this window that the chain no longer reports
    // has been reorganised away.
    const stillPresent = new Set(found.map((d) => `${d.txHash}:${d.txIndex}`));
    const { data: pending } = await db
      .from("deposits")
      .select("id,tx_hash,tx_index")
      .eq("chain", chain)
      .in("status", ["seen", "confirming"])
      .gte("block_height", from);

    let orphaned = 0;
    for (const row of pending ?? []) {
      if (stillPresent.has(`${row.tx_hash}:${row.tx_index}`)) continue;
      await db.from("deposits").update({ status: "orphaned" }).eq("id", row.id);
      orphaned += 1;
    }

    await db
      .from("chain_cursors")
      .update({
        last_height: tip,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("chain", chain);

    return { chain, fromHeight: from, toHeight: tip, seen: found.length, credited, orphaned };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function scanAll(): Promise<readonly ScanReport[]> {
  const reports: ScanReport[] = [];
  for (const chain of NETWORK_IDS) {
    reports.push(await scanChain(chain));
  }
  return reports;
}

/**
 * Issues (or returns) the deposit address for a user on a chain.
 *
 * The derivation index comes from a database sequence, so two concurrent
 * requests can never be handed the same address — which would mix two
 * customers' money into one balance.
 */
export async function ensureDepositAddress(options: {
  readonly userId?: string;
  readonly orderReference?: string;
  readonly chain: NetworkId;
}): Promise<{ address: string; index: number }> {
  const db = admin();

  const existingQuery = db
    .from("deposit_addresses")
    .select("address,derivation_index")
    .eq("chain", options.chain);

  const { data: existing } = await (options.userId
    ? existingQuery.eq("user_id", options.userId)
    : existingQuery.eq("order_reference", options.orderReference ?? "")
  ).maybeSingle();

  if (existing) {
    return { address: existing.address, index: existing.derivation_index };
  }

  const { data: next, error: seqError } = await db.rpc("next_deposit_index" as never);
  if (seqError) {
    throw new Error(`Could not allocate a derivation index: ${seqError.message}`);
  }

  const index = Number(next);
  const derived = await adapterFor(options.chain).deriveAddress(index);

  const { error } = await db.from("deposit_addresses").insert({
    user_id: options.userId ?? null,
    order_reference: options.orderReference ?? null,
    chain: options.chain,
    address: derived.address,
    derivation_index: index,
  });

  if (error) throw new Error(`Could not record deposit address: ${error.message}`);
  return { address: derived.address, index };
}

export type { CryptoCode };
