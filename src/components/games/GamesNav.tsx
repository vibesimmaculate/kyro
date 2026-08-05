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
    <nav aria-label="Games" className="-mx-2 min-w-0 flex-1 overflow-x-auto">
      <ul className="flex items-center gap-0.5 px-2">
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

        <li className="ms-auto ps-4">
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
