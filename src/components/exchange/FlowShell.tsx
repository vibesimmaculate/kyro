import type { ReactNode } from "react";
import { FlowProgress } from "@/components/exchange/FlowProgress";
import { OrderSummary } from "@/components/exchange/OrderSummary";
import type { Quote } from "@/lib/quote/types";

/**
 * The frame every step of the order shares: progress along the top, the step's
 * own controls on the left, and the ticket held steady on the right so the
 * figures never leave the screen while someone fills in a field.
 */
export interface FlowShellProps {
  readonly step: number;
  readonly completed: readonly string[];
  readonly title: string;
  readonly lead?: string;
  readonly quote?: Quote;
  readonly locationSlug?: string;
  readonly children: ReactNode;
}

export function FlowShell({
  step,
  completed,
  title,
  lead,
  quote,
  locationSlug,
  children,
}: FlowShellProps) {
  return (
    <>
      <FlowProgress current={step} completed={completed} />

      <div className="shell py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="label-mono text-ink-muted">
              Step {step + 1} of 5
            </p>
            <h1 className="mt-3 text-title text-balance">{title}</h1>
            {lead ? (
              <p className="mt-3 max-w-[52ch] text-lead text-ink-muted">{lead}</p>
            ) : null}

            <div className="mt-8">{children}</div>
          </div>

          {quote ? (
            <div className="lg:col-span-4 lg:col-start-9">
              <div className="lg:sticky lg:top-8">
                <OrderSummary quote={quote} locationSlug={locationSlug} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
