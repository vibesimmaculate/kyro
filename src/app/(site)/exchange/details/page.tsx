import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Field, inputClass } from "@/components/exchange/Field";
import { FlowShell } from "@/components/exchange/FlowShell";
import { StepForm } from "@/components/exchange/StepForm";
import { buildQuote } from "@/lib/quote/engine";
import { submitDetails } from "@/server/exchange/actions";
import { readDraft } from "@/server/exchange/draft";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exchange details" };

export default async function DetailsPage() {
  const draft = await readDraft();
  if (!draft || !draft.done.includes("quote")) redirect("/exchange");

  const priced = buildQuote({
    direction: draft.direction,
    give: draft.amount,
    fiat: draft.fiat,
    asset: draft.asset,
    network: draft.network,
    at: requestNow(),
  });
  if (!priced.ok) redirect("/exchange");

  return (
    <FlowShell
      step={1}
      completed={draft.done}
      title="Where should we send your order code?"
      lead="One email. It carries the code you will read out at the counter, and a link to track the order."
      quote={priced.quote}
      locationSlug={draft.location}
    >
      <StepForm
        action={submitDetails}
        submitLabel="Continue"
        backHref="/exchange"
        backLabel="Back to the quote"
        footnote="KYRO uses this address for this order only. No marketing, no list."
      >
        <Field
          id="email"
          label="Email"
          hint="Your order code and a tracking link go here."
        >
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={draft.email ?? ""}
            placeholder="you@example.com"
            aria-describedby="email-hint"
            className={inputClass}
          />
        </Field>
      </StepForm>
    </FlowShell>
  );
}
