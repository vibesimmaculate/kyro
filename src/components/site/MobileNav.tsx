"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isActivePath, PRIMARY_NAV } from "@/lib/nav";

/**
 * The small-screen menu.
 *
 * A full sheet with the navigation set large enough to read at arm's length and
 * tap without aiming — not a cramped dropdown of the desktop list. The trigger
 * says "Menu" because a word is unambiguous and three stacked lines are not.
 */
export function MobileNav({ pathname }: { readonly pathname: string }) {
  const [open, setOpen] = useState(false);

  // A tap that navigates dismisses the sheet. Closed on the click itself rather
  // than by watching the pathname in an effect: the intent is known at the
  // moment of the tap, and reacting to the route change afterwards causes an
  // extra render for no benefit.
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "tap -me-2 inline-flex items-center gap-2 rounded-[6px] px-2 text-[0.9375rem] text-ink lg:hidden",
          "transition-colors duration-[var(--duration-fast)] hover:bg-paper-sunk",
        )}
      >
        {/* No brand square here: the wordmark carries one forty pixels away on
            the same bar, and repeating it makes the mark ordinary. */}
        Menu
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 data-[state=open]:animate-[kyro-fade-in_var(--duration-base)_var(--ease-out-quiet)]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 top-0 z-50 flex max-h-[100dvh] flex-col overflow-y-auto bg-paper",
            "border-b border-rule shadow-[var(--shadow-lift)]",
            "data-[state=open]:animate-[kyro-sheet-in_var(--duration-slow)_var(--ease-out-quiet)]",
          )}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          <div className="shell flex h-14 flex-none items-center justify-between border-b border-rule">
            <Wordmark size="sm" />
            <Dialog.Close className="tap -me-2 inline-flex items-center rounded-[6px] px-2 text-[0.9375rem] text-ink-muted transition-colors hover:text-ink">
              Close
            </Dialog.Close>
          </div>

          <nav aria-label="Main" className="shell flex-1 py-2">
            <ul>
              {PRIMARY_NAV.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href} className="border-b border-rule-faint last:border-b-0">
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className="flex min-h-[3.75rem] flex-col justify-center gap-0.5 py-3"
                    >
                      <span className="flex items-center gap-2 text-[1.25rem] font-medium tracking-[-0.015em]">
                        {active ? <span aria-hidden="true" className="mark-square" /> : null}
                        {item.label}
                      </span>
                      {item.hint ? (
                        <span className="text-small text-ink-muted">{item.hint}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="shell flex flex-none flex-col gap-2 border-t border-rule py-4">
            <ButtonLink href="/exchange" size="lg" full onClick={close}>
              Start exchange
            </ButtonLink>
            <ButtonLink href="/track" variant="secondary" size="lg" full onClick={close}>
              Track an order
            </ButtonLink>
            <Link
              href="/games"
              onClick={close}
              className="mt-1 flex min-h-11 items-center justify-between border-t border-rule-faint pt-3 text-[0.9375rem] text-ink-muted"
            >
              Games
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
