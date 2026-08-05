import { cn } from "@/lib/cn";

/**
 * A labelled input. Label above, hint below the label, error attached by id so
 * a screen reader reads the problem as part of the field rather than as loose
 * text somewhere on the page.
 */
export interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: React.ReactNode;
  readonly error?: string;
  readonly children?: React.ReactNode;
  readonly className?: string;
}

export function Field({ id, label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn(className)}>
      <label htmlFor={id} className="label-mono block text-ink-muted">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-small text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass = cn(
  "tap w-full rounded-[8px] border border-rule-strong bg-white px-3 py-2.5",
  "text-body transition-colors duration-[var(--duration-fast)]",
  "placeholder:text-ink-faint",
  "focus:border-blue focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  "aria-[invalid=true]:border-red",
);

export const monoInputClass = cn(inputClass, "figure-num text-small");
