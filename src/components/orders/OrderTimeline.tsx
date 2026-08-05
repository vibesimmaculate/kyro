import { cn } from "@/lib/cn";

/**
 * Where an order has got to.
 *
 * Six stages, written the way a person would describe them. No internal system
 * states leak through here: nobody at a counter needs to read
 * "AWAITING_CHAIN_CONFIRMATION".
 *
 * Completion is carried by the word "Done", the mark, and the timestamp
 * together — never by colour alone.
 */

export type StageState = "done" | "current" | "upcoming" | "blocked";

export interface TimelineStage {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly state: StageState;
  /** Rendered in mono under the title once the stage has happened. */
  readonly at?: string;
  readonly note?: string;
}

export interface OrderTimelineProps {
  readonly stages: readonly TimelineStage[];
  readonly className?: string;
  readonly tone?: "day" | "night";
}

const STATE_LABEL: Record<StageState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Next",
  blocked: "Needs you",
};

export function OrderTimeline({ stages, className, tone = "day" }: OrderTimelineProps) {
  const night = tone === "night";

  return (
    <ol className={cn("relative", className)}>
      {stages.map((stage, i) => {
        const last = i === stages.length - 1;
        const done = stage.state === "done";
        const current = stage.state === "current";
        const blocked = stage.state === "blocked";

        return (
          <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Rail */}
            <div className="relative flex w-3 flex-none justify-center">
              {!last ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-4 bottom-[-1.5rem] w-px",
                    done
                      ? night
                        ? "bg-night-blue/50"
                        : "bg-blue/35"
                      : night
                        ? "bg-night-rule"
                        : "bg-rule",
                  )}
                />
              ) : null}

              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-[0.35rem] h-2.5 w-2.5 flex-none",
                  blocked
                    ? night
                      ? "bg-night-amber"
                      : "bg-amber"
                    : done || current
                      ? night
                        ? "bg-night-blue"
                        : "bg-blue"
                      : night
                        ? "border border-night-rule-strong bg-night"
                        : "border border-rule-strong bg-paper",
                  // The current stage gets a ring so it reads as "you are here".
                  current &&
                    (night
                      ? "outline outline-2 outline-offset-2 outline-night-blue/35"
                      : "outline outline-2 outline-offset-2 outline-blue/25"),
                )}
              />
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h3
                  className={cn(
                    "text-[0.9375rem] font-medium",
                    stage.state === "upcoming"
                      ? night
                        ? "text-night-muted"
                        : "text-ink-muted"
                      : night
                        ? "text-night-text"
                        : "text-ink",
                  )}
                >
                  {stage.title}
                </h3>
                <span
                  className={cn(
                    "label-mono",
                    blocked
                      ? night
                        ? "text-night-amber"
                        : "text-amber"
                      : done
                        ? night
                          ? "text-night-muted"
                          : "text-ink-faint"
                        : current
                          ? night
                            ? "text-night-blue"
                            : "text-blue"
                          : night
                            ? "text-night-muted"
                            : "text-ink-faint",
                  )}
                >
                  {STATE_LABEL[stage.state]}
                </span>
                {stage.at ? (
                  <span
                    className={cn(
                      "figure-num text-micro",
                      night ? "text-night-muted" : "text-ink-faint",
                    )}
                  >
                    {stage.at}
                  </span>
                ) : null}
              </div>

              <p
                className={cn(
                  "mt-1 text-small",
                  night ? "text-night-muted" : "text-ink-muted",
                )}
              >
                {stage.body}
              </p>

              {stage.note ? (
                <p
                  className={cn(
                    "mt-2 border-s-2 ps-3 text-small",
                    blocked
                      ? night
                        ? "border-night-amber text-night-text"
                        : "border-amber text-ink"
                      : night
                        ? "border-night-rule text-night-muted"
                        : "border-rule text-ink-muted",
                  )}
                >
                  {stage.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
