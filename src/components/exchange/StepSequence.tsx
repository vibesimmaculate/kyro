import { cn } from "@/lib/cn";

/**
 * Three steps, set as a sequence rather than three cards.
 *
 * The numerals carry the rhythm; hairlines do the separating. On a narrow
 * screen the sequence turns vertical and the rule turns with it, so the reading
 * order never changes and nothing is boxed.
 */

export interface Step {
  readonly title: string;
  readonly body: string;
  readonly detail?: string;
}

export interface StepSequenceProps {
  readonly steps: readonly Step[];
  readonly className?: string;
}

export function StepSequence({ steps, className }: StepSequenceProps) {
  return (
    <ol className={cn("grid sm:grid-cols-3", className)}>
      {steps.map((step, i) => (
        <li
          key={step.title}
          className={cn(
            "flex flex-col gap-2",
            // Vertical rhythm on small screens, columns divided on wide ones.
            i > 0 && "mt-6 border-t border-rule pt-6 sm:mt-0 sm:border-t-0 sm:pt-0",
            i > 0 && "sm:border-s sm:border-rule sm:ps-5",
            i < steps.length - 1 && "sm:pe-5",
          )}
        >
          {/*
            Set larger than the marginal section index it sits beneath. On a
            phone the two stack close together, and at identical size they read
            as the same number printed twice rather than as a section and a step
            within it.
          */}
          <div className="flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className="figure-num text-[1.0625rem] leading-none font-medium text-ink"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-rule" />
          </div>

          <h3 className="mt-1 text-subhead font-semibold text-balance">{step.title}</h3>
          <p className="text-small text-ink-muted">{step.body}</p>
          {step.detail ? (
            <p className="mt-auto pt-3 text-micro text-ink-faint">{step.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
