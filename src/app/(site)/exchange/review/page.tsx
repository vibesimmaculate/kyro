import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AmountReadout } from "@/components/exchange/AmountReadout";
import { FeeReceipt } from "@/components/exchange/FeeReceipt";
import { FlowShell } from "@/components/exchange/FlowShell";
import { StepForm } from "@/components/exchange/StepForm";
import { sampleLocationProvider, summariseHours } from "@/fixtures/locations";
import { CRYPTO, NETWORKS } from "@/lib/money/currencies";
import { formatRate } from "@/lib/money/format";
import { buildQuote } from "@/lib/quote/engine";
import { confirmOrder } from "@/server/exchange/actions";
import { readDraft } from "@/server/exchange/draft";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review your exchange" };

/** Addresses are read out and checked, so they are broken into readable runs. */
function groupAddress(address: string): string[] {
  return address.match(/.{1,4}/g) ?? [address];
}

export default async function ReviewPage() {
  const draft = await readDraft();
  if (!draft || !draft.done.includes("location") || !draft.location) redirect("/exchange");

  const priced = buildQuote({
    direction: draft.direction,
    give: draft.amount,
    fiat: draft.fiat,
    asset: draft.asset,
    network: draft.network,
    at: requestNow(),
  });
  if (!priced.ok) redirect("/exchange");

  const quote = priced.quote;
  const location = sampleLocationProvider.bySlug(draft.location);
  if (!location) redirect("/exchange/location");

  const cashToCrypto = draft.direction === "cash-to-crypto";
  const hours = summariseHours(location.hours);

  return (
    <FlowShell
      step={4}
      completed={draft.done}
      title="Check it over."
      lead="Nothing has been created yet. Confirming locks this rate and gives you an order code."
      quote={quote}
      locationSlug={draft.location}
    >
      <div className="max-w-[34rem] space-y-6">
        <section className="rounded-[10px] border border-rule-strong bg-white p-5">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="label-mono text-ink-faint">The exchange</h2>
            <Link href="/exchange" className="text-small text-ink-muted underline underline-offset-4 hover:text-ink">
              Change
            </Link>
          </div>

          <div className="pt-4">
            <p className="label-mono text-ink-muted">You give</p>
            <AmountReadout amount={quote.give} size="md" className="mt-1" />
          </div>

          <div className="mt-4 border-t border-rule pt-4">
            <FeeReceipt quote={quote} showTotal={false} />
          </div>

          <div className="mt-4 border-t border-rule pt-4">
            <p className="label-mono text-ink-muted">
              {cashToCrypto ? "You receive" : "You collect"}
            </p>
            <AmountReadout amount={quote.receive} className="mt-1" />
            <p className="mt-2 text-micro text-ink-muted">
              {quote.rateLabel} · {formatRate(quote.rate)}
            </p>
          </div>
        </section>

        {cashToCrypto && draft.walletAddress ? (
          <section className="rounded-[10px] border border-rule-strong bg-white p-5">
            <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-3">
              <h2 className="label-mono text-ink-faint">Sending to</h2>
              <Link
                href="/exchange/wallet"
                className="text-small text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Change
              </Link>
            </div>

            <p className="mt-4 text-small text-ink-muted">
              Read this against your wallet, character by character. Once the transfer is
              broadcast it cannot be undone by anyone.
            </p>

            <p className="figure-num mt-3 flex flex-wrap gap-x-2 gap-y-1 rounded-[6px] bg-paper-sunk p-3 text-[0.9375rem] break-all">
              {groupAddress(draft.walletAddress).map((chunk, i) => (
                <span key={`${chunk}-${i}`}>{chunk}</span>
              ))}
            </p>

            <p className="mt-3 text-small">
              <span className="text-ink-muted">On</span>{" "}
              <span className="font-medium">{NETWORKS[draft.network].name}</span>
              <span className="text-ink-muted">
                {" "}
                — {CRYPTO[draft.asset].name} sent on any other network will not arrive.
              </span>
            </p>
          </section>
        ) : null}

        <section className="rounded-[10px] border border-rule-strong bg-white p-5">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="label-mono text-ink-faint">
              {cashToCrypto ? "Paying at" : "Collecting at"}
            </h2>
            <Link
              href="/exchange/location"
              className="text-small text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Change
            </Link>
          </div>

          <p className="mt-4 text-subhead font-medium">
            {location.city} — {location.branch}
          </p>
          <p className="mt-0.5 text-small text-ink-muted">
            {location.street}, {location.postcode} {location.city}
          </p>
          <p className="mt-1 text-small text-ink-muted">{location.transit}</p>

          <dl className="mt-4 border-t border-rule pt-3">
            {hours.map((row) => (
              <div key={row.days} className="flex items-baseline gap-1.5 py-0.5">
                <dt className="flex-none text-small text-ink-muted">{row.days}</dt>
                <span aria-hidden="true" className="leader" />
                <dd className="figure-num flex-none text-small">{row.time}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-[10px] border border-rule bg-paper-sunk p-5">
          <h2 className="label-mono text-ink-faint">Bring with you</h2>
          <ul className="mt-3 space-y-2 text-small">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
              <span>
                <span className="font-medium">Photo ID.</span>{" "}
                <span className="text-ink-muted">
                  Passport, national ID card or driving licence.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
              <span>
                <span className="font-medium">Your order code.</span>{" "}
                <span className="text-ink-muted">
                  Reading it out is enough — nothing to print.
                </span>
              </span>
            </li>
            {cashToCrypto ? (
              <li className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.45rem]" />
                <span>
                  <span className="font-medium">The exact cash.</span>{" "}
                  <span className="text-ink-muted">The amount on the ticket.</span>
                </span>
              </li>
            ) : null}
          </ul>
        </section>

        <StepForm
          action={confirmOrder}
          submitLabel="Create this exchange"
          pendingLabel="Creating…"
          backHref="/exchange/location"
          backLabel="Back to location"
          footnote={
            <>
              This holds the rate for 45 minutes and reserves your slot at the pickup point.
              Nothing is charged now — you pay in person. Sending your code to{" "}
              <span className="figure-num">{draft.email}</span>.
            </>
          }
        />
      </div>
    </FlowShell>
  );
}
