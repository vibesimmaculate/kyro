"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AuthState } from "@/server/auth/actions";

const field = cn(
  "tap w-full rounded-[8px] border border-night-rule-strong bg-night-sunk px-3 py-2.5",
  "text-body text-night-text outline-none transition-colors",
  "placeholder:text-night-muted focus:border-night-blue",
);

export function AuthForm({
  action,
  submitLabel,
  next,
}: {
  readonly action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  readonly submitLabel: string;
  readonly next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-8">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label htmlFor="email" className="label-mono block text-night-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email ?? ""}
          className={`${field} mt-2`}
        />
      </div>

      <div className="mt-5">
        <label htmlFor="password" className="label-mono block text-night-muted">
          Password
        </label>
        <p id="password-hint" className="mt-1.5 text-small text-night-muted">
          At least 10 characters. A phrase you will remember beats a short string of
          symbols you will not.
        </p>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={submitLabel === "Sign in" ? "current-password" : "new-password"}
          required
          minLength={10}
          aria-describedby="password-hint"
          className={`${field} mt-2`}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 rounded-[8px] border border-night-red/40 bg-night-red/10 px-3 py-2.5 text-small"
        >
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="mt-5 rounded-[8px] border border-night-blue/40 bg-night-blue/10 px-3 py-2.5 text-small"
        >
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" tone="night" size="lg" full disabled={pending} className="mt-6">
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}
