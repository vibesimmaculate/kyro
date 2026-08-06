import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FlowShell } from "@/components/exchange/FlowShell";
import { StepForm } from "@/components/exchange/StepForm";
import { cn } from "@/lib/cn";
import {
  availabilityOf,
  pickupClock,
  locationsSupporting,
  MINUTES_LABEL,
  type Availability,
} from "@/fixtures/locations";
import { parseMoney } from "@/lib/money/amounts";
import { formatMoney } from "@/lib/money/format";
import { buildQuote } from "@/lib/quote/engine";
import { submitLocation } from "@/server/exchange/actions";
import { readDraft } from "@/server/exchange/draft";
import { requestNow, requestDate } from "@/server/clock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a location" };

const MARK: Record<Availability["state"], string> = {
  open: "bg-green",
  "closing-soon": "bg-amber",
  closed: "bg-ink-faint",
  "opening-soon": "bg-blue",
};

export default async function LocationStepPage() {
  const draft = await readDraft();
  if (!draft || !draft.done.includes("wallet")) redirect("/exchange");

  const priced = buildQuote({
    direction: draft.direction,
    give: draft.amount,
    fiat: draft.fiat,
    asset: draft.asset,
    network: draft.network,
    at: requestNow(),
  });
  if (!priced.ok) redirect("/exchange");

  const clock = pickupClock(requestDate());
  const candidates = locationsSupporting(draft.direction, draft.fiat, draft.asset);
  const cashToCrypto = draft.direction === "cash-to-crypto";
  const payout = priced.quote.receive;

  return (
    <FlowShell
      step={3}
      completed={draft.done}
      title={cashToCrypto ? "Where will you pay?" : "Where will you collect?"}
      lead={`${candidates.length} ${candidates.length === 1 ? "pickup point handles" : "pickup points handle"} ${draft.asset} for ${draft.fiat} in this direction.`}
      quote={priced.quote}
      locationSlug={draft.location}
    >
      {candidates.length === 0 ? (
        <div className="max-w-[34rem] rounded-[10px] border border-amber/40 bg-amber-wash p-5">
          <h2 className="text-subhead font-medium">No pickup point handles that combination.</h2>
          <p className="mt-2 text-small text-ink-muted">
            Nothing is lost — go back and change the currency or the coin, and the list will
            fill up again.
          </p>
          <Link
            href="/exchange"
            className="mt-4 inline-flex text-small underline underline-offset-4"
          >
            Back to the quote
          </Link>
        </div>
      ) : (
        <StepForm
          action={submitLocation}
          submitLabel="Continue"
          backHref="/exchange/wallet"
          backLabel="Back to wallet"
          footnote="Sample locations. These branches are illustrative and not yet trading."
        >
                      <fieldset>
              <legend className="sr-only">Choose a pickup point</legend>
              <div className="space-y-2">
                {candidates.map((location) => {
                  const availability = availabilityOf(location, clock);
                  const today = location.hours[clock.day] ?? null;
                  const ceiling = parseMoney(
                    location.cashOutCeiling,
                    location.currencies[0] ?? draft.fiat,
                  );
                  const tooBig =
                    !cashToCrypto &&
                    payout.kind === "fiat" &&
                    location.currencies[0] === payout.currency &&
                    payout.minor > ceiling.minor;

                  return (
                    <label
                      key={location.slug}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[8px] border bg-surface p-3.5 transition-colors",
                        "hover:border-ink/40 has-[:checked]:border-blue has-[:checked]:bg-blue-wash",
                        tooBig ? "border-amber/50" : "border-rule-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="location"
                        value={location.slug}
                        required
                        defaultChecked={location.slug === draft.location}
                        className="mt-1 h-4 w-4 flex-none accent-[var(--color-blue)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{location.city}</span>
                          <span className="text-small text-ink-muted">{location.branch}</span>
                          <span className="ms-auto inline-flex items-center gap-1.5 text-small">
                            <span
                              aria-hidden="true"
                              className={cn("h-1.5 w-1.5 flex-none", MARK[availability.state])}
                            />
                            {availability.label}
                          </span>
                        </span>

                        <span className="mt-0.5 block text-small text-ink-muted">
                          {location.street} ·{" "}
                          <span className="figure-num">
                            {today
                              ? `${MINUTES_LABEL(today.open)}–${MINUTES_LABEL(today.close)}`
                              : "Closed today"}
                          </span>
                        </span>

                        {tooBig ? (
                          <span className="mt-2 block border-s-2 border-amber ps-3 text-small text-ink">
                            This pickup point keeps {formatMoney(ceiling)} on hand. Your payout is
                            larger, so it needs a working day&rsquo;s notice.
                          </span>
                        ) : null}

                        {location.serviceNote ? (
                          <span className="mt-1.5 block text-micro text-ink-muted">
                            {location.serviceNote}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
        </StepForm>
      )}
    </FlowShell>
  );
}
