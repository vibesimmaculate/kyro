"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { selfExclude } from "@/server/games/actions";

const PERIODS = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "6m", label: "6 months" },
  { value: "permanent", label: "Permanently" },
] as const;

export function SelfExclusionForm({ disabled }: { readonly disabled?: boolean }) {
  const [state, action, pending] = useActionState(selfExclude, {});
  const [period, setPeriod] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <h2 className="text-subhead font-medium">Self-exclusion</h2>
      <p className="mt-1.5 text-small text-night-muted">
        Blocks every game immediately. It cannot be shortened, undone or appealed — that is
        what makes it worth having.
      </p>

      <form action={action} className="mt-5">
        <fieldset disabled={disabled || pending}>
          <legend className="label-mono text-night-muted">For how long</legend>
          <div className="mt-2 space-y-1.5">
            {PERIODS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "tap flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 transition-colors",
                  period === option.value
                    ? "border-night-amber bg-night-amber/10"
                    : "border-night-rule-strong bg-night-sunk hover:border-night-muted",
                )}
              >
                <input
                  type="radio"
                  name="period"
                  value={option.value}
                  checked={period === option.value}
                  onChange={(event) => {
                    setPeriod(event.target.value);
                    setConfirmed(false);
                  }}
                  className="h-4 w-4 flex-none accent-[var(--color-night-amber)]"
                />
                <span className="text-[0.9375rem]">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {period ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-small">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={disabled || pending}
              className="mt-1 h-4 w-4 flex-none accent-[var(--color-night-amber)]"
            />
            <span className="text-night-muted">
              I understand this takes effect at once and cannot be reversed early, even if I
              ask.
            </span>
          </label>
        ) : null}

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

        <Button
          type="submit"
          tone="night"
          variant="danger"
          size="lg"
          full
          disabled={disabled || pending || !period || !confirmed}
          className="mt-5"
        >
          {pending ? "Applying…" : "Exclude me"}
        </Button>
      </form>
    </section>
  );
}
