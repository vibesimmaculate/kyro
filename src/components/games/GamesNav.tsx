"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { GAMES, GAME_META } from "@/lib/games";

/**
 * Five games and two account links, on one rule. Narrow screens scroll it
 * horizontally rather than hiding it behind a menu — with five destinations
 * that is faster than opening anything.
 */
export function GamesNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Games"
      // `basis-0 grow` with `min-w-0` lets this shrink to nothing before the
      // header overflows. A negative margin here would add width back and
      // push the page sideways at 390px, which is exactly what it did.
      className="min-w-0 shrink grow basis-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex items-center gap-0.5">
        {GAMES.map((id) => {
          const active = pathname === `/games/${id}`;
          return (
            <li key={id}>
              <Link
                href={`/games/${id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center whitespace-nowrap rounded-[6px] px-3 text-small transition-colors",
                  active
                    ? "bg-night-raised text-night-text"
                    : "text-night-muted hover:text-night-text",
                )}
              >
                {GAME_META[id].name}
              </Link>
            </li>
          );
        })}

        <li className="ps-3">
          <Link
            href="/games/wallet"
            className={cn(
              "inline-flex h-11 items-center whitespace-nowrap rounded-[6px] px-3 text-small transition-colors",
              pathname === "/games/wallet"
                ? "bg-night-raised text-night-text"
                : "text-night-muted hover:text-night-text",
            )}
          >
            Wallet
          </Link>
        </li>
      </ul>
    </nav>
  );
}
