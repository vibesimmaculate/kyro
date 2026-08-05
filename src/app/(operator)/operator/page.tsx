import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OperatorOrderRow } from "@/components/operator/OperatorOrderRow";
import { WithdrawalQueue } from "@/components/operator/WithdrawalQueue";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount, money as fiatMoney } from "@/lib/money/amounts";
import { NETWORKS, type CryptoCode, type NetworkId } from "@/lib/money/currencies";
import { formatCrypto, formatMoney } from "@/lib/money/format";
import { hasSupabase, isMainnet } from "@/server/env";
import { orderStore } from "@/server/orders";
import { admin } from "@/server/supabase/admin";
import { currentUser, isStaff } from "@/server/supabase/server";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operator",
  robots: { index: false, follow: false },
};

/**
 * The counter's own screen.
 *
 * A third visual register: dense mono tables, no polish, nothing decorative.
 * This is a tool for someone working a shift, and it should read like a
 * terminal rather than a product.
 */
export default async function OperatorPage() {
  if (!hasSupabase()) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/operator");
  if (!(await isStaff(user.id))) {
    return (
      <div className="shell py-20">
        <h1 className="text-title">Not authorised.</h1>
        <p className="mt-3 max-w-[52ch] text-lead text-ink-muted">
          This console is for counter staff. If you should have access, an administrator
          adds you to the staff table.
        </p>
        <Link href="/" className="mt-6 inline-flex text-small underline underline-offset-4">
          Back to the exchange
        </Link>
      </div>
    );
  }

  const db = admin();
  const now = requestNow();
  const orders = await orderStore().list({ limit: 40 });
  const live = orders.filter(
    (order) => !["complete", "cancelled", "expired"].includes(order.status),
  );

  const { data: queue } = await db
    .from("withdrawals")
    .select("id,user_id,chain,asset,address,amount::text,status,requested_at")
    .in("status", ["awaiting-approval", "approved", "broadcast"])
    .order("requested_at", { ascending: true })
    .limit(25)
    .returns<
      Array<{
        id: string;
        user_id: string | null;
        chain: NetworkId;
        asset: CryptoCode;
        address: string;
        amount: string;
        status: string;
        requested_at: string;
      }>
    >();

  const { data: liabilities } = await db.rpc("customer_liabilities");

  return (
    <div className="shell py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule-strong pb-4">
        <h1 className="text-section">Operator</h1>
        <p className="label-mono text-ink-faint">
          {isMainnet() ? "MAINNET" : "TESTNET"} · {live.length} live orders ·{" "}
          {(queue ?? []).length} in the payout queue
        </p>
      </header>

      {/* ── Reconciliation ──────────────────────────────────────────────── */}
      <section className="mt-8" aria-labelledby="liabilities">
        <h2 id="liabilities" className="label-mono text-ink-faint">
          Customer liabilities
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-small text-ink-muted">
          What KYRO owes customers, per asset, derived from the ledger. Compare against the
          hot wallet&rsquo;s real on-chain balance — if the two drift apart, stop
          withdrawals and find out why before doing anything else.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t border-rule pt-3">
          {((liabilities ?? []) as Array<{ asset: CryptoCode; owed: number }>).map((row) => (
            <li key={row.asset} className="flex items-baseline gap-2">
              <span className="label-mono text-ink-faint">{row.asset}</span>
              <span className="figure-num text-small">
                {formatCrypto(cryptoAmount(BigInt(String(row.owed)), row.asset))}
              </span>
            </li>
          ))}
          {(liabilities ?? []).length === 0 ? (
            <li className="text-small text-ink-muted">Nothing owed.</li>
          ) : null}
        </ul>
      </section>

      {/* ── Orders ──────────────────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="orders">
        <h2 id="orders" className="label-mono text-ink-faint">
          Live orders
        </h2>

        {live.length === 0 ? (
          <p className="mt-3 border-t border-rule pt-4 text-small text-ink-muted">
            Nothing waiting. New orders appear here the moment a customer confirms one.
          </p>
        ) : (
          <ScrollArea label="Live orders" className="mt-3">
            <table className="w-full min-w-[52rem] border-collapse text-small">
              <thead>
                <tr className="border-y border-rule-strong">
                  <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                    Code
                  </th>
                  <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                    Direction
                  </th>
                  <th scope="col" className="label-mono py-2 pe-4 text-end text-ink-faint">
                    Gives
                  </th>
                  <th scope="col" className="label-mono py-2 pe-4 text-end text-ink-faint">
                    Receives
                  </th>
                  <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                    Counter
                  </th>
                  <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                    Stage
                  </th>
                  <th scope="col" className="label-mono py-2 text-end text-ink-faint">
                    Advance
                  </th>
                </tr>
              </thead>
              <tbody>
                {live.map((order) => (
                  <OperatorOrderRow
                    key={order.reference}
                    order={order}
                    expired={order.expiresAt < now}
                  />
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </section>

      {/* ── Withdrawals ─────────────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="withdrawals">
        <h2 id="withdrawals" className="label-mono text-ink-faint">
          Payout queue
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-small text-ink-muted">
          Anything at or above the approval threshold waits here for a person. The funds are
          already reserved out of the customer&rsquo;s balance, so nothing is at risk while
          it sits.
        </p>

        {(queue ?? []).length === 0 ? (
          <p className="mt-3 border-t border-rule pt-4 text-small text-ink-muted">
            Queue empty.
          </p>
        ) : (
          <WithdrawalQueue
            rows={(queue ?? []).map((row) => ({
              id: row.id,
              chain: row.chain,
              network: NETWORKS[row.chain].name,
              asset: row.asset,
              address: row.address,
              amount: formatCrypto(cryptoAmount(BigInt(row.amount), row.asset)),
              status: row.status,
              requestedAt: new Date(row.requested_at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            }))}
            className="mt-3"
          />
        )}
      </section>

      {/* ── Recently finished ───────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="recent">
        <h2 id="recent" className="label-mono text-ink-faint">
          Recently finished
        </h2>
        <ul className="mt-3 border-t border-rule">
          {orders
            .filter((order) => ["complete", "cancelled", "expired"].includes(order.status))
            .slice(0, 8)
            .map((order) => (
              <li
                key={order.reference}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2.5"
              >
                <Link
                  href={`/orders/${order.reference}`}
                  className="figure-num text-small underline underline-offset-4"
                >
                  {order.reference}
                </Link>
                <span className="text-small text-ink-muted">
                  {order.direction === "cash-to-crypto" ? "Cash → Crypto" : "Crypto → Cash"}
                </span>
                <span className="figure-num text-small">
                  {formatMoney(fiatMoney(BigInt(order.grossMinor), order.fiat))}
                </span>
                <span
                  className={cn(
                    "label-mono ms-auto",
                    order.status === "complete" ? "text-green" : "text-ink-faint",
                  )}
                >
                  {order.status}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
