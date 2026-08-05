"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/exchange/actions";

/**
 * The shell each step's form shares: the action wiring, the error region, and
 * the pair of controls at the bottom.
 *
 * `children` is plain markup, not a render prop — a function cannot cross the
 * Server → Client Component boundary, and passing one produced a form that
 * rendered nothing at all. The step's fields are therefore server-rendered and
 * this component owns only the submission state, which is the right division
 * anyway: the fields do not need to re-render when the action does.
 */
export interface StepFormProps {
  readonly action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  readonly submitLabel: string;
  readonly pendingLabel?: string;
  readonly backHref: string;
  readonly backLabel?: string;
  readonly children?: React.ReactNode;
  readonly footnote?: React.ReactNode;
}

export function StepForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  backHref,
  backLabel = "Back",
  children,
  footnote,
}: StepFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-[34rem]">
      {children}

      {state.error ? (
        <p
          role="alert"
          className={cn(
            "mt-5 flex items-start gap-2 rounded-[8px] border border-red/30 bg-red-wash",
            "px-3 py-2.5 text-small text-ink",
          )}
        >
          <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 flex-none bg-red" />
          {state.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-rule pt-6 sm:flex-row sm:items-center">
        <Link
          href={backHref}
          className="tap inline-flex items-center justify-center rounded-[8px] px-3 text-small text-ink-muted transition-colors hover:text-ink sm:justify-start"
        >
          ← {backLabel}
        </Link>
        <Button type="submit" size="lg" disabled={pending} className="sm:ms-auto sm:min-w-[12rem]">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>

      {footnote ? <div className="mt-4 text-micro text-ink-muted">{footnote}</div> : null}
    </form>
  );
}
