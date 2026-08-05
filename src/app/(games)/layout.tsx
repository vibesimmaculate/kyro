import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { GamesNav } from "@/components/games/GamesNav";
import { licence } from "@/server/env";

/**
 * The games wing.
 *
 * Same type, same grid, same blue square — inverted onto ink. The exchange
 * stays exactly as it was; this is a different room in the same building, and
 * it says so at the door.
 */
export default function GamesLayout({ children }: { readonly children: React.ReactNode }) {
  const info = licence();

  return (
    <div className="night flex min-h-dvh flex-col">
      <header className="border-b border-night-rule">
        <div className="shell flex h-14 items-center gap-5 md:h-[4.25rem]">
          <Link href="/games" className="-m-2 flex items-center rounded-[4px] p-2">
            <Wordmark size="sm" tone="night" className="md:text-[1.1875rem]" />
            <span className="label-mono ms-2.5 text-night-muted">Games</span>
          </Link>
          <GamesNav />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-16 border-t border-night-rule">
        <div className="shell py-10">
          {/* Stated plainly, at the bottom of every games page. KYRO does not
              invent a licence it does not hold. */}
          {!info.licensed ? (
            <p className="max-w-[62ch] border-s-2 border-night-amber ps-4 text-small text-night-muted">
              <span className="font-medium text-night-text">Preview build — unlicensed.</span>{" "}
              KYRO holds no gaming licence and this wing is not open to the public. Balances
              here move on testnet unless the operator has deliberately switched to mainnet.
            </p>
          ) : (
            <p className="text-small text-night-muted">
              Licensed by {info.authority}. Licence {info.number}.
            </p>
          )}

          <div className="mt-8 flex flex-col gap-4 border-t border-night-rule pt-6 text-micro text-night-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} KYRO. 18+. Play within your limits.</p>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <li>
                <Link href="/games/fairness" className="transition-colors hover:text-night-text">
                  Fairness
                </Link>
              </li>
              <li>
                <Link href="/games/limits" className="transition-colors hover:text-night-text">
                  Limits and self-exclusion
                </Link>
              </li>
              <li>
                <Link href="/" className="transition-colors hover:text-night-text">
                  Back to the exchange
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
