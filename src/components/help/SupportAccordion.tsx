"use client";

import * as Accordion from "@radix-ui/react-accordion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Questions.
 *
 * Radix handles the disclosure semantics; the styling is a hairline list with a
 * plus that becomes a minus. No chevrons rotating through 180 degrees, no card
 * per question, no shadow.
 */

export interface SupportItem {
  readonly id: string;
  readonly question: string;
  readonly answer: ReactNode;
}

export interface SupportAccordionProps {
  readonly items: readonly SupportItem[];
  readonly defaultValue?: string;
  readonly className?: string;
  readonly tone?: "day" | "night";
}

function Sign({ night }: { readonly night: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative ms-4 mt-[0.4rem] h-3 w-3 flex-none self-start"
    >
      <span
        className={cn(
          "absolute top-1/2 left-0 h-px w-3 -translate-y-1/2",
          night ? "bg-night-muted" : "bg-ink-muted",
        )}
      />
      <span
        className={cn(
          "absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-quiet)]",
          "group-data-[state=open]:scale-y-0",
          night ? "bg-night-muted" : "bg-ink-muted",
        )}
      />
    </span>
  );
}

export function SupportAccordion({
  items,
  defaultValue,
  className,
  tone = "day",
}: SupportAccordionProps) {
  const night = tone === "night";

  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue={defaultValue}
      className={cn("border-t", night ? "border-night-rule" : "border-rule", className)}
    >
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          id={item.id}
          className={cn("border-b", night ? "border-night-rule" : "border-rule")}
        >
          <Accordion.Header>
            <Accordion.Trigger
              className={cn(
                "group flex w-full items-start justify-between gap-3 py-4 text-start",
                "transition-colors duration-[var(--duration-fast)]",
                night ? "hover:text-night-text" : "hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "text-[1.0625rem] font-medium text-balance",
                  night ? "text-night-text" : "text-ink",
                )}
              >
                {item.question}
              </span>
              <Sign night={night} />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content
            className={cn(
              "overflow-hidden",
              "data-[state=open]:animate-[kyro-accordion-open_var(--duration-slow)_var(--ease-out-quiet)]",
              "data-[state=closed]:animate-[kyro-accordion-close_var(--duration-base)_var(--ease-out-quiet)]",
            )}
          >
            <div
              className={cn(
                "max-w-[62ch] pb-5 pe-8 text-body",
                night ? "text-night-muted" : "text-ink-muted",
              )}
            >
              {item.answer}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
