import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AmountReadout } from "@/components/exchange/AmountReadout";
import { CopyValue } from "@/components/orders/CopyValue";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { ButtonLink } from "@/components/ui/Button";
import { sampleLocationProvider, summariseHours } from "@/fixtures/locations";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount, money as fiatMoney } from "@/lib/money/amounts";
import { CRYPTO, NETWORKS } from "@/lib/money/currencies";
import { formatCrypto, formatMoney } from "@/lib/money/format";
import { orderStore } from "@/server/orders";
import { nextActionFor, timelineFor } from "@/server/orders/presentation";
import { isValidReference, normaliseReference } from "@/server/orders/reference";
import { isTerminal } from "@/server/orders/types";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Order ${normaliseReference(reference)}`,
    robots: { index: false, follow: false },
  };
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly reference: string }>;
  readonly searchParams: Promise<{ readonly new?: string }>;
}) {
  const { reference: raw } = await params;
  const { new: isNew } = await searchParams;

  const reference = normaliseReference(raw);
  if (!isValidReference(reference)) notFound();

  const order = await orderStore().byReference(reference);
  if (!order) notFound();

  const location = sampleLocationProvider.bySlug(order.locationSlug);
  const cashToCrypto = order.direction === "cash-to-crypto";
  const next = nextActionFor(order);
  const stages = timelineFor(order);
  const expired = !isTerminal(order.status) && requestNow() > order.expiresAt;

  const give = cashToCrypto
    ? fiatMoney(BigInt(order.giveUnits), order.fiat)
    : cryptoAmount(BigInt(order.giveUnits), order.asset);
  const receive = cashToCrypto
    ? cryptoAmount(BigInt(order.receiveUnits), order.asset)
    : fiatMoney(BigInt(order.receiveUnits), order.fiat);

  return (
    <div className="shell py-10 md:py-14">
      {isNew ? (
        <p
          role="status"
          className="mb-8 flex items-start gap-3 rounded-[8px] border border-green/30 bg-green-wash px-4 py-3 text-small"
        >
          <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 flex-none bg-green" />
          <span>
            <span className="font-medium">Your exchange is ready.</span>{" "}
            <span className="text-ink-muted">
              Write the code down or keep this page — it is all you need at the counter.
            </span>
          </span>
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        {/* ── Left: what to do, and what has happened ─────────────────── */}
        <div className="lg:col-span-7">
          <p className="label-mono text-ink-muted">
            {cashToCrypto ? "Cash → Crypto" : "Crypto → Cash"}
          </p>
          <h1 className="mt-3 text-title text-balance">{next.headline}</h1>
          <p className="mt-3 max-w-[52ch] text-lead text-ink-muted">{next.body}</p>

          {expired ? (
            <div className="mt-6 rounded-[8px] border border-amber/40 bg-amber-wash p-4">
              <p className="text-small font-medium">The rate on this order is no longer held.</p>
              <p className="mt-1 text-small text-ink-muted">
                The counter will re-quote you at the current rate when you arrive, and you can
                walk away if you do not like it.
              </p>
              <ButtonLink href="/exchange" variant="secondary" size="sm" className="mt-3">
                Get a fresh quote
              </ButtonLink>
            </div>
          ) : null}

          {/* Crypto → cash: the address is the action. */}
          {!cashToCrypto && order.depositAddress ? (
            <section className="mt-8 rounded-[10px] border border-rule-strong bg-white p-5">
              <h2 className="label-mono text-ink-faint">Send exactly this</h2>
              <AmountReadout amount={give} size="md" className="mt-2" />
              <p className="mt-3 text-small text-ink-muted">
                To this address, on{" "}
                <span className="font-medium text-ink">{NETWORKS[order.network].name}</span>.
                Sending on another network loses the funds.
              </p>
              <CopyValue value={order.depositAddress} label="Deposit address" className="mt-3" />
            </section>
          ) : null}

          {!cashToCrypto && !order.depositAddress ? (
            <section className="mt-8 rounded-[10px] border border-rule bg-paper-sunk p-5">
              <h2 className="label-mono text-ink-faint">Deposit address</h2>
              <p className="mt-2 text-small text-ink-muted">
                Not issued yet. It appears here as soon as the counter opens the order —
                usually within a minute. Nothing is needed from you until then.
              </p>
            </section>
          ) : null}

          <section className="mt-10" aria-labelledby="progress">
            <h2 id="progress" className="label-mono text-ink-faint">
              Progress
            </h2>
            <OrderTimeline stages={stages} className="mt-5" />
          </section>

          {order.txHash ? (
            <section className="mt-8 rounded-[10px] border border-rule bg-white p-5">
              <h2 className="label-mono text-ink-faint">Transaction</h2>
              <CopyValue value={order.txHash} label="Transaction ID" className="mt-3" />
            </section>
          ) : null}
        </div>

        {/* ── Right: the ticket ───────────────────────────────────────── */}
        <div className="lg:col-span-4 lg:col-start-9">
          <div className="lg:sticky lg:top-8">
            <section
              aria-label="Order ticket"
              className="rounded-[10px] border border-rule-strong bg-white shadow-[var(--shadow-ticket)]"
            >
              <div className="border-b border-rule px-5 py-4">
                <p className="label-mono text-ink-faint">Order code</p>
                <p className="figure-num mt-1 text-[1.5rem] tracking-[0.02em]">
                  {order.reference}
                </p>
                <p className="mt-1.5 text-micro text-ink-muted">
                  Read this out at the counter, with your ID.
                </p>
              </div>

              <div className="px-5 py-4">
                <p className="label-mono text-ink-muted">You give</p>
                <AmountReadout amount={give} size="md" className="mt-1" />

                <div className="mt-4 border-t border-rule pt-4">
                  <p className="label-mono text-ink-muted">
                    {cashToCrypto ? "You receive" : "You collect"}
                  </p>
                  <AmountReadout amount={receive} size="md" className="mt-1" />
                </div>
              </div>

              <dl className="border-t border-rule bg-paper-sunk px-5 py-4 text-small">
                <div className="flex items-baseline gap-1.5 py-1">
                  <dt className="flex-none text-ink-muted">Service fee</dt>
                  <span aria-hidden="true" className="leader" />
                  <dd className="figure-num flex-none">
                    {formatMoney(fiatMoney(BigInt(order.serviceFeeMinor), order.fiat))}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5 py-1">
                  <dt className="flex-none text-ink-muted">Network fee</dt>
                  <span aria-hidden="true" className="leader" />
                  <dd className="figure-num flex-none">
                    {formatCrypto(cryptoAmount(BigInt(order.networkFeeBase), order.asset))}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5 py-1">
                  <dt className="flex-none text-ink-muted">Network</dt>
                  <span aria-hidden="true" className="leader" />
                  <dd className="flex-none">{NETWORKS[order.network].name}</dd>
                </div>
                <div className="flex items-baseline gap-1.5 py-1">
                  <dt className="flex-none text-ink-muted">Coin</dt>
                  <span aria-hidden="true" className="leader" />
                  <dd className="flex-none">{CRYPTO[order.asset].name}</dd>
                </div>
              </dl>

              {location ? (
                <div className="border-t border-rule px-5 py-4">
                  <p className="label-mono text-ink-faint">
                    {cashToCrypto ? "Pay at" : "Collect at"}
                  </p>
                  <p className="mt-1.5 font-medium">
                    {location.city} — {location.branch}
                  </p>
                  <p className="text-small text-ink-muted">{location.street}</p>
                  <dl className="mt-3 border-t border-rule-faint pt-2">
                    {summariseHours(location.hours).map((row) => (
                      <div key={row.days} className="flex items-baseline gap-1.5 py-0.5">
                        <dt className="flex-none text-micro text-ink-muted">{row.days}</dt>
                        <span aria-hidden="true" className="leader" />
                        <dd className="figure-num flex-none text-micro">{row.time}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link
                    href={`/locations/${location.slug}`}
                    className="mt-3 inline-flex text-small underline underline-offset-4"
                  >
                    Directions and details
                  </Link>
                </div>
              ) : null}

              {cashToCrypto && order.walletAddress ? (
                <div className="border-t border-rule px-5 py-4">
                  <p className="label-mono text-ink-faint">Sending to</p>
                  <CopyValue
                    value={order.walletAddress}
                    label="Your wallet address"
                    className="mt-2"
                    compact
                  />
                </div>
              ) : null}
            </section>

            <p className={cn("mt-4 text-micro text-ink-muted")}>
              Created{" "}
              {new Date(order.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Preview rates and sample locations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
