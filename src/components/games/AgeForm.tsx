"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { confirmAge } from "@/server/auth/actions";

const field = cn(
  "figure-num tap w-full rounded-[8px] border border-night-rule-strong bg-night-sunk px-3 py-2.5",
  "text-center text-[1.125rem] text-night-text outline-none transition-colors",
  "placeholder:text-night-muted focus:border-night-blue",
);

export function AgeForm() {
  const [state, action, pending] = useActionState(confirmAge, {});

  return (
    <form action={action} className="mt-8">
      <fieldset>
        <legend className="label-mono text-night-muted">Date of birth</legend>
        <div className="mt-2 grid grid-cols-[1fr_1fr_1.4fr] gap-2">
          <div>
            <label htmlFor="day" className="sr-only">
              Day
            </label>
            <input
              id="day"
              name="day"
              inputMode="numeric"
              placeholder="DD"
              maxLength={2}
              required
              autoComplete="bday-day"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="month" className="sr-only">
              Month
            </label>
            <input
              id="month"
              name="month"
              inputMode="numeric"
              placeholder="MM"
              maxLength={2}
              required
              autoComplete="bday-month"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="year" className="sr-only">
              Year
            </label>
            <input
              id="year"
              name="year"
              inputMode="numeric"
              placeholder="YYYY"
              maxLength={4}
              required
              autoComplete="bday-year"
              className={field}
            />
          </div>
        </div>
      </fieldset>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 rounded-[8px] border border-night-amber/40 bg-night-amber/10 px-3 py-2.5 text-small"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" tone="night" size="lg" full disabled={pending} className="mt-6">
        {pending ? "Checking…" : "Confirm and continue"}
      </Button>
    </form>
  );
}
