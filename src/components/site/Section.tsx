import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The page's spine.
 *
 * A full-bleed hairline, a numeral in the left margin, the heading beneath it,
 * and the content in the wide column. Repeating this shape down the page is
 * what makes the site read as one document rather than a stack of cards.
 */

export interface SectionProps {
  readonly index: string;
  readonly title: string;
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  readonly id?: string;
  readonly aside?: ReactNode;
  readonly className?: string;
  readonly bleed?: boolean;
  readonly tone?: "paper" | "sunk";
}

export function Section({
  index,
  title,
  lead,
  children,
  id,
  aside,
  className,
  tone = "paper",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "border-t border-rule",
        tone === "sunk" && "bg-paper-sunk",
        className,
      )}
      aria-labelledby={`${id ?? index}-heading`}
    >
      <div className="shell py-14 md:py-20">
        {/*
          `min-w-0` on both columns is load-bearing. A grid item defaults to
          `min-width: auto`, so it refuses to shrink below its content's
          intrinsic width — which means any `overflow-x-auto` table inside stops
          scrolling and pushes the whole page sideways instead.
        */}
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-12">
          <header className="min-w-0 md:col-span-4">
            <p className="section-index" aria-hidden="true">
              {index}
            </p>
            <h2
              id={`${id ?? index}-heading`}
              className="mt-3 text-section text-balance"
            >
              {title}
            </h2>
            {lead ? (
              <div className="mt-3 max-w-[38ch] text-lead text-ink-muted">{lead}</div>
            ) : null}
            {aside ? <div className="mt-6">{aside}</div> : null}
          </header>

          <div className="min-w-0 md:col-span-8">{children}</div>
        </div>
      </div>
    </section>
  );
}
