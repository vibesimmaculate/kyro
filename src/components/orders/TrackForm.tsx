"use client";

import { useActionState } from "react";
import { Field, monoInputClass } from "@/components/exchange/Field";
import { Button } from "@/components/ui/Button";
import { lookupOrder, type LookupState } from "@/server/orders/lookup";

/**
 * The one field on the track page.
 *
 * Accepts the code however it arrives — lower case, no dashes, pasted with
 * whitespace. The only thing it will not do is guess at an ambiguous character,
 * because sending someone to a stranger's order would be worse than asking them
 * to look again.
 */
export function TrackForm() {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupOrder, {});

  return (
    <form action={action}>
      <Field
        id="reference"
        label="Order code"
        hint="Eight characters, like KYR-4H2N-8QX1. Dashes and capitals are optional."
        error={state.error}
      >
        <input
          id="reference"
          name="reference"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="KYR-0000-0000"
          defaultValue={state.value ?? ""}
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby={state.error ? "reference-error" : "reference-hint"}
          className={`${monoInputClass} text-[1.125rem] tracking-[0.08em] uppercase`}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="mt-5 w-full sm:w-auto sm:min-w-[12rem]">
        {pending ? "Looking…" : "Find my order"}
      </Button>
    </form>
  );
}
