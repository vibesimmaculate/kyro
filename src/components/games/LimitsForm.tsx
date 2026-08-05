"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { updateLimits } from "@/server/games/actions";

const field = cn(
  "figure-num tap w-full rounded-[8px] border border-night-rule-strong bg-night-sunk px-3 py-2.5",
  "text-body text-night-text outline-none transition-colors",
  "placeholder:text-night-muted focus:border-night-blue",
);

export function LimitsForm({
  dailyDeposit,
  dailyLoss,
  sessionMinutes,
  pendingAt,
}: {
  readonly dailyDeposit: string;
  readonly dailyLoss: string;
  readonly sessionMinutes: number | null;
  readonly pendingAt: string | null;
}) {
  const [state, action, pending] = useActionState(updateLimits, {});

  return (
    <section className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <h2 className="text-subhead font-medium">Daily limits</h2>
      <p className="mt-1.5 text-small text-night-muted">
        Leave a field blank for no limit. Blanking an existing one counts as raising it, so
        it waits 24 hours.
      </p>

      {pendingAt ? (
        <p className="mt-4 rounded-[8px] border border-night-blue/40 bg-night-blue/10 px-3 py-2.5 text-small">
          A higher limit is queued and applies on{" "}
          {new Date(pendingAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      ) : null}

      <form action={action} className="mt-5">
        <div>
          <label htmlFor="dailyDeposit" className="label-mono block text-night-muted">
            Deposit cap, per day
          </label>
          <input
            id="dailyDeposit"
            name="dailyDeposit"
            inputMode="decimal"
            defaultValue={dailyDeposit}
            placeholder="No limit"
            className={`${field} mt-2`}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="dailyLoss" className="label-mono block text-night-muted">
            Loss cap, per day
          </label>
          <input
            id="dailyLoss"
            name="dailyLoss"
            inputMode="decimal"
            defaultValue={dailyLoss}
            placeholder="No limit"
            className={`${field} mt-2`}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="sessionMinutes" className="label-mono block text-night-muted">
            Remind me after
          </label>
          <input
            id="sessionMinutes"
            name="sessionMinutes"
            inputMode="numeric"
            defaultValue={sessionMinutes ?? ""}
            placeholder="Minutes — leave blank for none"
            className={`${field} mt-2`}
          />
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-small text-night-amber">
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="mt-4 text-small text-night-green">
            {state.notice}
          </p>
        ) : null}

        <Button type="submit" tone="night" size="lg" full disabled={pending} className="mt-5">
          {pending ? "Saving…" : "Save limits"}
        </Button>
      </form>
    </section>
  );
}
