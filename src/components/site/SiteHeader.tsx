"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/ui/Button";
import { MobileNav } from "@/components/site/MobileNav";
import { cn } from "@/lib/cn";
import { isActivePath, PRIMARY_NAV } from "@/lib/nav";

/**
 * A rule with things on it. Not a capsule, not a floating island, not sticky
 * glass. It sits on the page, holds a hairline underneath, and gets out of the
 * way of the calculator.
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="relative z-40 border-b border-rule bg-paper">
      <div className="shell flex h-14 items-center gap-6 md:h-[4.25rem]">
        <Link
          href="/"
          className="-m-2 flex items-center rounded-[4px] p-2"
          aria-label="KYRO — home"
        >
          <Wordmark size="sm" className="md:text-[1.1875rem]" />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 items-center rounded-[6px] px-3 text-[0.9375rem] transition-colors duration-[var(--duration-fast)]",
                      active ? "text-ink" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                    {/* The active mark is the brand square, not an underline. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-3 -bottom-px h-px bg-ink transition-opacity duration-[var(--duration-fast)]",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Link
            href="/games"
            className={cn(
              "hidden h-11 items-center rounded-[6px] px-3 text-[0.9375rem] text-ink-muted transition-colors hover:text-ink md:inline-flex",
              isActivePath(pathname, "/games") && "text-ink",
            )}
          >
            Games
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px bg-rule md:block" />
          <Link
            href="/track"
            className="hidden h-11 items-center rounded-[6px] px-3 text-[0.9375rem] text-ink-muted transition-colors hover:text-ink sm:inline-flex"
          >
            Track order
          </Link>
          <ButtonLink href="/exchange" size="sm" className="hidden sm:inline-flex">
            Start exchange
          </ButtonLink>
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
}
