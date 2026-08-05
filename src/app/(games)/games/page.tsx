import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { GAMES, GAME_META, HOUSE_EDGE_BP } from "@/lib/games";
import { formatBasisPoints, formatCrypto } from "@/lib/money/format";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { hasSupabase, isMainnet } from "@/server/env";
import { playSession } from "@/server/games/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games",
  description: "Five games with a stated 1% edge and outcomes you can verify yourself.",
  robots: { index: false, follow: false },
};

export default async function GamesPage() {
  const session = hasSupabase() ? await playSession() : undefined;
  const signedIn = session?.ok === true;
  const balance = signedIn ? (session.session.balances.get("USDT") ?? 0n) : 0n;

  return (
    <div className="shell py-10 md:py-16">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="label-mono flex items-center gap-2 text-night-muted">
            <span aria-hidden="true" className="mark-square bg-night-blue" />
            Games
          </p>
          <h1 className="mt-5 text-display">Five games. One stated edge.</h1>
          <p className="mt-5 max-w-[46ch] text-lead text-night-muted">
            Every outcome comes from a seed committed to before you bet, and can be
            recomputed by anyone afterwards. The house edge is {formatBasisPoints(HOUSE_EDGE_BP)}
            {" "}on all five — printed here, not buried in terms.
          </p>

          <ul className="mt-8 space-y-3 border-t border-night-rule pt-6 text-small">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mark-square mt-[0.5rem] bg-night-blue" />
              <span className="text-night-muted">
                <span className="font-medium text-night-text">Provably fair.</span> The seed
                hash is published before play and revealed on rotation.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mark-square mt-[0.5rem] bg-night-blue" />
              <span className="text-night-muted">
                <span className="font-medium text-night-text">Real balances.</span> Deposits
                and withdrawals move on chain, in {isMainnet() ? "mainnet" : "testnet"} mode.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mark-square mt-[0.5rem] bg-night-blue" />
              <span className="text-night-muted">
                <span className="font-medium text-night-text">Limits you set.</span> Deposit
                and loss caps, session reminders, and self-exclusion that cannot be undone
                early.
              </span>
            </li>
          </ul>
        </div>

        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
            {signedIn ? (
              <>
                <p className="label-mono text-night-muted">Your balance</p>
                <p className="figure-num mt-2 text-figure">
                  {formatCrypto(cryptoAmount(balance, "USDT"))}
                </p>
                <div className="mt-5 space-y-2">
                  <Link
                    href="/games/wallet"
                    className="tap flex items-center justify-center rounded-[8px] border border-night-blue bg-night-blue px-4 font-semibold text-night-sunk transition-[filter] hover:brightness-110"
                  >
                    Deposit or withdraw
                  </Link>
                  <Link
                    href="/games/limits"
                    className="tap flex items-center justify-center rounded-[8px] border border-night-rule-strong px-4 text-night-text transition-colors hover:border-night-muted"
                  >
                    Limits
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="label-mono text-night-muted">Account needed</p>
                <p className="mt-2 text-body text-night-muted">
                  Games take real balances, so they need an account, an age check and
                  limits. The exchange does not — it stays open to anyone.
                </p>
                <div className="mt-5 space-y-2">
                  <Link
                    href="/sign-up?next=/games"
                    className="tap flex items-center justify-center rounded-[8px] border border-night-blue bg-night-blue px-4 font-semibold text-night-sunk transition-[filter] hover:brightness-110"
                  >
                    Create an account
                  </Link>
                  <Link
                    href="/sign-in?next=/games"
                    className="tap flex items-center justify-center rounded-[8px] border border-night-rule-strong px-4 text-night-text transition-colors hover:border-night-muted"
                  >
                    Sign in
                  </Link>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* The five games, as a list of rules rather than a grid of cards. */}
      <section aria-labelledby="games-heading" className="mt-16 border-t border-night-rule pt-2">
        <h2 id="games-heading" className="sr-only">
          The games
        </h2>
        <ul>
          {GAMES.map((id, index) => {
            const meta = GAME_META[id];
            return (
              <li key={id} className="border-b border-night-rule">
                <Link
                  href={`/games/${id}`}
                  className={cn(
                    "group grid gap-x-6 gap-y-1 py-6 transition-colors sm:grid-cols-12 sm:items-baseline",
                    "hover:bg-night-raised focus-visible:bg-night-raised",
                  )}
                >
                  <span className="section-index text-night-muted sm:col-span-1">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="sm:col-span-3">
                    <span className="text-section font-semibold">{meta.name}</span>
                  </span>
                  <span className="text-lead text-night-muted sm:col-span-4">
                    {meta.tagline}
                  </span>
                  <span className="text-small text-night-muted sm:col-span-3">{meta.rule}</span>
                  <span
                    aria-hidden="true"
                    className="text-night-muted transition-transform group-hover:translate-x-1 group-hover:text-night-text sm:col-span-1 sm:text-end"
                  >
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
