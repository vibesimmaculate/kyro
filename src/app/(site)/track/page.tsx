import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { TrackForm } from "@/components/orders/TrackForm";
import { orderStore } from "@/server/orders";

export const dynamic = "force-dynamic";

/** The seeded demonstration orders, if this install has any. */
const DEMO_EMAIL = "demo@kyro.example";

export const metadata: Metadata = {
  alternates: { canonical: "/track" },
  title: "Track an order",
  description: "Enter your order code to see exactly where your exchange has got to.",
};

export default async function TrackPage() {
  const demos = (await orderStore().list({ limit: 40 }))
    .filter((order) => order.email === DEMO_EMAIL)
    .slice(0, 2);

  return (
    <>
      <PageHeader
        eyebrow="Track order"
        title="Where is my exchange?"
        lead="Enter the code from your confirmation. No account, no password — the code is enough."
      />

      <div className="shell pb-20">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-6">
            <TrackForm />
          </div>

          <aside className="md:col-span-5 md:col-start-8">
            <div className="rounded-[10px] border border-rule bg-paper-sunk p-5">
              <h2 className="label-mono text-ink-faint">Where to find your code</h2>
              <ul className="mt-3 space-y-2.5 text-small text-ink-muted">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
                  <span>
                    In the email sent when the order was created — subject line begins with
                    your code.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
                  <span>On the order page, if you still have it open.</span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
                  <span>
                    Lost it entirely?{" "}
                    <Link href="/help#contact" className="underline underline-offset-4">
                      Write to us
                    </Link>{" "}
                    from the address you used, and we will find it.
                  </span>
                </li>
              </ul>
            </div>

            {demos.length > 0 ? (
              <div className="mt-5 rounded-[10px] border border-rule bg-white p-5">
                <h2 className="label-mono text-ink-faint">Orders to try</h2>
                <p className="mt-2 text-small text-ink-muted">
                  This is a preview build. These demonstration orders are seeded so the
                  tracking flow can be tried without creating one:
                </p>
                <ul className="mt-3 space-y-2">
                  {demos.map((order) => (
                    <li key={order.reference}>
                      <Link
                        href={`/orders/${order.reference}`}
                        className="figure-num text-small underline underline-offset-4"
                      >
                        {order.reference}
                      </Link>
                      <span className="ms-2 text-small text-ink-muted">
                        — {order.status === "complete" ? "finished" : "part-way through"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
