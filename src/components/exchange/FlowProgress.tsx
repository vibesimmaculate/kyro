import Link from "next/link";
import { cn } from "@/lib/cn";
import { FLOW_STEPS } from "@/server/exchange/draft";

/**
 * Where you are in the order.
 *
 * A rule with five marks on it. Not a wizard, not a stepper with circles and
 * connecting arrows — the brand square fills in as you go, and the current step
 * is the only one named at full strength.
 */
export interface FlowProgressProps {
  readonly current: number;
  readonly completed: readonly string[];
  readonly className?: string;
}

export function FlowProgress({ current, completed, className }: FlowProgressProps) {
  return (
    <nav aria-label="Order progress" className={cn("border-b border-rule", className)}>
      {/* Five steps do not fit at 360px, so the rail scrolls rather than
          wrapping into two ragged lines or shrinking the labels to nothing.
          Only the completed steps are links, so the rail is given its own tab
          stop — otherwise a keyboard user on step one cannot see steps four and
          five at all. */}
      <ol
        tabIndex={0}
        aria-label="Steps in this order"
        className="shell flex w-full items-stretch gap-0 overflow-x-auto [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue [&::-webkit-scrollbar]:hidden"
      >
        {FLOW_STEPS.map((step, index) => {
          const isCurrent = index === current;
          const isDone = index < current || completed.includes(step.slug || "quote");
          const reachable = isDone && index < current;

          const content = (
            <span className="flex items-center gap-2 whitespace-nowrap py-3">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 flex-none",
                  isCurrent ? "bg-blue" : isDone ? "bg-ink" : "bg-rule-strong",
                )}
              />
              <span
                className={cn(
                  "text-small",
                  isCurrent
                    ? "font-medium text-ink"
                    : isDone
                      ? "text-ink-muted"
                      : "text-ink-faint",
                )}
              >
                {step.label}
              </span>
            </span>
          );

          return (
            <li
              key={step.label}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "relative flex-none pe-6",
                index > 0 && "ps-6",
                index > 0 && "before:absolute before:inset-y-3 before:start-0 before:w-px before:bg-rule",
              )}
            >
              {reachable ? (
                <Link
                  href={step.href}
                  className="block transition-opacity hover:opacity-70"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
