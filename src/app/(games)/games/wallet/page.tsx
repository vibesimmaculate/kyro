import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyValue } from "@/components/orders/CopyValue";
import { DepositPanel } from "@/components/games/DepositPanel";
import { WithdrawForm } from "@/components/games/WithdrawForm";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { CRYPTO, NETWORKS, type NetworkId } from "@/lib/money/currencies";
import { formatCrypto } from "@/lib/money/format";
import { REQUIRED_CONFIRMATIONS } from "@/lib/rates/network-fees";
import { hasCustodyKeys, hasSupabase, isMainnet } from "@/server/env";
import { balancesFor } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { currentUser } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wallet",
  robots: { index: false, follow: false },
};

export default async function WalletPage() {
  if (!hasSupabase()) redirect("/games");

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/games/wallet");

  const balances = await balancesFor(user.id);
  const db = admin();

  const { data: addresses } = await db
    .from("deposit_addresses")
    .select("chain,address")
    .eq("user_id", user.id);

  const { data: deposits } = await db
    .from("deposits")
    .select("chain,asset,amount::text,status,confirmations,required_confirmations,tx_hash,first_seen_at")
    .eq("user_id", user.id)
    .order("first_seen_at", { ascending: false })
    .limit(8)
    .returns<
      Array<{
        chain: NetworkId;
        asset: keyof typeof CRYPTO;
        amount: string;
        status: string;
        confirmations: number;
        required_confirmations: number;
        tx_hash: string;
        first_seen_at: string;
      }>
    >();

  const { data: withdrawals } = await db
    .from("withdrawals")
    .select("chain,asset,amount::text,status,address,tx_hash,requested_at")
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(8)
    .returns<
      Array<{
        chain: NetworkId;
        asset: keyof typeof CRYPTO;
        amount: string;
        status: string;
        address: string;
        tx_hash: string | null;
        requested_at: string;
      }>
    >();

  const total = balances.get("USDT") ?? 0n;

  return (
    <div className="shell py-10 md:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-title">Wallet</h1>
        <p className="label-mono text-night-muted">
          {isMainnet() ? "Mainnet" : "Testnet"} · real on-chain transfers
        </p>
      </div>

      {!hasCustodyKeys() ? (
        <p className="mt-6 max-w-[52rem] rounded-[10px] border border-night-amber/40 bg-night-amber/10 p-4 text-small">
          Custody keys are not configured on this install, so deposit addresses cannot be
          derived and withdrawals cannot be signed. Run{" "}
          <code className="figure-num">pnpm keys:dev</code> to generate a testnet wallet.
        </p>
      ) : null}

      <section className="mt-8 rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
        <p className="label-mono text-night-muted">Balance</p>
        <p className="figure-num mt-2 text-figure">
          {formatCrypto(cryptoAmount(total, "USDT"))}
        </p>
        <p className="mt-2 text-small text-night-muted">
          Everything is staked in USDT. Deposits in other assets are credited to their own
          balance and can be withdrawn, but are not yet playable.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <DepositPanel
          addresses={(addresses ?? []).map((row) => ({
            chain: row.chain as NetworkId,
            address: row.address,
          }))}
          disabled={!hasCustodyKeys()}
        />
        <WithdrawForm balances={[...balances.entries()]} disabled={!hasCustodyKeys()} />
      </div>

      {/* ── History ─────────────────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="deposits-heading">
        <h2 id="deposits-heading" className="text-subhead font-medium">
          Deposits
        </h2>
        {(deposits ?? []).length === 0 ? (
          <p className="mt-3 rounded-[8px] border border-night-rule bg-night-raised p-4 text-small text-night-muted">
            Nothing yet. Send to one of your addresses above — it appears here as soon as it
            is seen on chain, and is credited once it has the confirmations that network
            needs.
          </p>
        ) : (
          <ul className="mt-3 border-t border-night-rule">
            {(deposits ?? []).map((row) => (
              <li
                key={row.tx_hash}
                className="grid gap-x-4 gap-y-1 border-b border-night-rule py-3 sm:grid-cols-12 sm:items-baseline"
              >
                <span className="figure-num sm:col-span-3">
                  {formatCrypto(cryptoAmount(BigInt(row.amount), row.asset))}
                </span>
                <span className="text-small text-night-muted sm:col-span-3">
                  {NETWORKS[row.chain].name}
                </span>
                <span className="text-small sm:col-span-3">
                  {row.status === "credited" ? (
                    <span className="text-night-green">Credited</span>
                  ) : row.status === "orphaned" ? (
                    <span className="text-night-amber">Reorganised away</span>
                  ) : (
                    <span className="figure-num text-night-muted">
                      {row.confirmations}/{row.required_confirmations} confirmations
                    </span>
                  )}
                </span>
                <span className="figure-num truncate text-micro text-night-muted sm:col-span-3">
                  {row.tx_hash}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="withdrawals-heading">
        <h2 id="withdrawals-heading" className="text-subhead font-medium">
          Withdrawals
        </h2>
        {(withdrawals ?? []).length === 0 ? (
          <p className="mt-3 rounded-[8px] border border-night-rule bg-night-raised p-4 text-small text-night-muted">
            None requested.
          </p>
        ) : (
          <ul className="mt-3 border-t border-night-rule">
            {(withdrawals ?? []).map((row) => (
              <li
                key={`${row.requested_at}-${row.address}`}
                className="grid gap-x-4 gap-y-1 border-b border-night-rule py-3 sm:grid-cols-12 sm:items-baseline"
              >
                <span className="figure-num sm:col-span-3">
                  {formatCrypto(cryptoAmount(BigInt(row.amount), row.asset))}
                </span>
                <span className="text-small text-night-muted sm:col-span-3">
                  {NETWORKS[row.chain].name}
                </span>
                <span className={cn("text-small sm:col-span-3")}>
                  {row.status === "confirmed" ? (
                    <span className="text-night-green">Sent</span>
                  ) : row.status === "awaiting-approval" ? (
                    <span className="text-night-amber">Waiting on a person</span>
                  ) : row.status === "rejected" || row.status === "failed" ? (
                    <span className="text-night-red">Returned to your balance</span>
                  ) : (
                    <span className="text-night-muted">In progress</span>
                  )}
                </span>
                <span className="figure-num truncate text-micro text-night-muted sm:col-span-3">
                  {row.tx_hash ?? row.address}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 rounded-[10px] border border-night-rule bg-night-raised p-5">
        <h2 className="label-mono text-night-muted">How long a deposit takes</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {(Object.keys(REQUIRED_CONFIRMATIONS) as NetworkId[]).map((network) => (
            <li key={network} className="flex items-baseline gap-1.5">
              <span className="flex-none text-small text-night-muted">
                {NETWORKS[network].name}
              </span>
              <span aria-hidden="true" className="leader-night" />
              <span className="figure-num flex-none text-small">
                {REQUIRED_CONFIRMATIONS[network]} confirmations
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-micro text-night-muted">
          Nothing is credited before that depth. It is the only defence against a block
          being reorganised away after you have already been paid.{" "}
          <Link href="/games/fairness" className="underline underline-offset-4">
            How fairness works
          </Link>
          .
        </p>
      </section>

      {(addresses ?? []).length > 0 ? (
        <section className="mt-10" aria-labelledby="addresses-heading">
          <h2 id="addresses-heading" className="text-subhead font-medium">
            Your addresses
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(addresses ?? []).map((row) => (
              <div
                key={row.address}
                className="rounded-[10px] border border-night-rule bg-night-raised p-4"
              >
                <p className="label-mono text-night-muted">{NETWORKS[row.chain as NetworkId].name}</p>
                <CopyValue value={row.address} label="Address" className="mt-2" compact tone="night" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
