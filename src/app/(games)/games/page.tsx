import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { GameMark } from "@/components/games/GameMark";
import { cn } from "@/lib/cn";
import { GAMES, GAME_META, HOUSE_EDGE_BP } from "@/lib/games";
import { formatBasisPoints, formatCrypto } from "@/lib/money/format";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { gamesSchema, graph } from "@/lib/seo/structured-data";
import { hasSupabase, isMainnet } from "@/server/env";
import { playSession } from "@/server/games/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games",
  description: "Seven games with a stated 1% edge and outcomes you can verify yourself.",
  robots: { index: false, follow: false },
};

export default async function GamesPage() {
  const session = hasSupabase() ? await playSession() : undefined;
  const signedIn = session?.ok === true;
  const balance = signedIn ? (session.session.balances.get("USDT") ?? 0n) : 0n;

  return (
    <div className="shell py-10 md:py-16">
      <JsonLd data={graph(gamesSchema())} />
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="label-mono flex items-center gap-2 text-night-muted">
            <span aria-hidden="true" className="mark-square bg-night-blue" />
            Games
          </p>
          <h1 className="mt-5 text-display">Seven games. One stated edge.</h1>
          <p className="mt-5 max-w-[46ch] text-lead text-night-muted">
            Every outcome comes from a seed committed to before you bet, and can be
            recomputed by anyone afterwards. The house edge is {formatBasisPoints(HOUSE_EDGE_BP)}
            {" "}on every one — printed here, not buried in terms.
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

      {/* The games, as a board of marks rather than a list of rules.

          The list this replaces was accurate, legible and completely wrong for
          the room: seven rows of text with an arrow at the end reads as a
          directory of articles. A game wing has to look like somewhere you go
          to play, which means each game gets its own mark, its own colour and
          enough size to be aimed at. */}
      <section aria-labelledby="games-heading" className="mt-14">
        <div className="flex items-baseline justify-between gap-4 border-b border-night-rule pb-3">
          <h2 id="games-heading" className="text-section font-semibold">
            Choose a game
          </h2>
          <p className="label-mono text-night-muted">
            {formatBasisPoints(HOUSE_EDGE_BP)} edge on every one
          </p>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((id) => {
            const meta = GAME_META[id];
            return (
              <li key={id} style={{ ["--accent" as string]: `var(--accent-${id})` }}>
                <Link
                  href={`/games/${id}`}
                  className={cn(
                    "group relative flex h-full flex-col overflow-hidden rounded-[14px] p-5",
                    "border border-night-rule bg-night-raised",
                    "transition-[border-color,transform,box-shadow]",
                    "duration-[var(--duration-base)] ease-[var(--ease-out-quiet)]",
                    "hover:-translate-y-0.5 hover:border-[var(--accent)]/50",
                    "hover:shadow-[0_18px_40px_-24px_var(--accent)]",
                    "focus-visible:border-[var(--accent)]",
                  )}
                >
                  {/* A wash of the game's own colour, so the grid reads as
                      seven rooms rather than seven identical cards. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full",
                      "bg-[var(--accent)] opacity-[0.07] blur-2xl transition-opacity",
                      "duration-[var(--duration-slow)] group-hover:opacity-[0.16]",
                    )}
                  />

                  <div className="relative flex items-start justify-between gap-4">
                    <GameMark
                      game={id}
                      className="h-11 w-11 flex-none text-[var(--accent)]"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "text-night-muted transition-transform",
                        "duration-[var(--duration-base)] group-hover:translate-x-1",
                        "group-hover:text-[var(--accent)]",
                      )}
                    >
                      →
                    </span>
                  </div>

                  <h3 className="relative mt-5 text-subhead font-semibold">{meta.name}</h3>
                  <p className="relative mt-1 text-small text-[var(--accent)]">{meta.tagline}</p>
                  <p className="relative mt-3 text-small text-night-muted">{meta.rule}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
