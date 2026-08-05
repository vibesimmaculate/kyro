import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The masthead every interior page opens with. Eyebrow, title, one paragraph.
 * Same shape each time, so moving between pages feels like turning a page
 * rather than arriving somewhere new.
 */
export interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly lead?: ReactNode;
  readonly aside?: ReactNode;
  readonly className?: string;
}

export function PageHeader({ eyebrow, title, lead, aside, className }: PageHeaderProps) {
  return (
    <header className={cn("shell pt-10 pb-10 md:pt-14 md:pb-14", className)}>
      <div className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="label-mono flex items-center gap-2 text-ink-muted">
            <span aria-hidden="true" className="mark-square" />
            {eyebrow}
          </p>
          <h1 className="mt-5 text-title text-balance">{title}</h1>
          {lead ? (
            <div className="mt-4 max-w-[52ch] text-lead text-ink-muted">{lead}</div>
          ) : null}
        </div>
        {aside ? (
          <div className="md:col-span-4 md:col-start-9 md:pt-10">{aside}</div>
        ) : null}
      </div>
    </header>
  );
}
