import type { Metadata } from "next";
import { FairnessVerifier } from "@/components/games/FairnessVerifier";
import { SeedRotation } from "@/components/games/SeedRotation";
import { HOUSE_EDGE_BP, PLINKO_MULTIPLIERS } from "@/lib/games";
import { formatBasisPoints } from "@/lib/money/format";
import { hasSupabase } from "@/server/env";
import { admin } from "@/server/supabase/admin";
import { currentUser } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Provably fair",
  description: "How KYRO proves it cannot decide the outcome after you have bet.",
  robots: { index: false, follow: false },
};

export default async function FairnessPage() {
  const user = hasSupabase() ? await currentUser() : undefined;

  const { data: retired } = user
    ? await admin()
        .from("seed_pairs_public")
        .select("server_seed,server_seed_hash,client_seed,nonce,revealed_at")
        .eq("user_id", user.id)
        .eq("is_active", false)
        .order("revealed_at", { ascending: false })
        .limit(5)
    : { data: null };

  return (
    <div className="shell py-10 md:py-14">
      <div className="max-w-[62ch]">
        <p className="label-mono flex items-center gap-2 text-night-muted">
          <span aria-hidden="true" className="mark-square bg-night-blue" />
          Provably fair
        </p>
        <h1 className="mt-5 text-title">
          KYRO cannot decide what you rolled after you bet.
        </h1>
        <p className="mt-4 text-lead text-night-muted">
          Not as a promise — as arithmetic you can check yourself, without trusting
          anything on this page.
        </p>
      </div>

      <section className="mt-12 max-w-[62ch]" aria-labelledby="how">
        <h2 id="how" className="text-section">
          How it works
        </h2>
        <ol className="mt-6 space-y-6">
          {[
            {
              t: "KYRO commits to a secret",
              b: "A random server seed is generated and its SHA-256 hash is published to you immediately. The hash gives nothing away, but it pins the seed down: change the seed and the hash changes.",
            },
            {
              t: "You choose your own seed",
              b: "Your client seed goes into every calculation alongside ours. Change it whenever you like. Because it is yours, KYRO cannot pick a server seed that produces a favourable result — it does not know what you will choose.",
            },
            {
              t: "Each round has a number",
              b: "A nonce, counting up from one. The same pair of seeds never produces the same outcome twice, and every round is at a known position in the sequence.",
            },
            {
              t: "The outcome is a hash",
              b: "HMAC-SHA256, keyed with the server seed, over your client seed and the nonce. The first four bytes become a number between 0 and 1, which becomes a roll, a side, a crash point or a board.",
            },
            {
              t: "The seed is revealed",
              b: "Rotate your seed pair and the old server seed is published. Hash it, check it matches what you were shown before you played, then recompute every round you played against it. If a single outcome disagrees, KYRO cheated — and you can prove it.",
            },
          ].map((step, i) => (
            <li key={step.t} className="flex gap-4 border-t border-night-rule pt-5">
              <span className="section-index mt-1 flex-none text-night-text" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-subhead font-medium">{step.t}</h3>
                <p className="mt-1 text-small text-night-muted">{step.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="verify">
        <h2 id="verify" className="text-section">
          Verify a round
        </h2>
        <p className="mt-3 max-w-[62ch] text-body text-night-muted">
          This runs entirely in your browser, using the same code the server uses. Paste a
          revealed server seed, your client seed and a nonce.
        </p>
        <FairnessVerifier className="mt-6" />
      </section>

      {user ? <SeedRotation className="mt-14" /> : null}

      {retired && retired.length > 0 ? (
        <section className="mt-14" aria-labelledby="revealed">
          <h2 id="revealed" className="text-section">
            Your revealed seeds
          </h2>
          <p className="mt-3 max-w-[62ch] text-body text-night-muted">
            Every round you played against these can now be recomputed above.
          </p>
          <ul className="mt-6 border-t border-night-rule">
            {retired.map((pair) => (
              <li key={pair.server_seed_hash} className="border-b border-night-rule py-4">
                <dl className="grid gap-3 sm:grid-cols-12">
                  <div className="min-w-0 sm:col-span-5">
                    <dt className="text-micro text-night-muted">Server seed (revealed)</dt>
                    <dd className="figure-num mt-0.5 truncate text-small">{pair.server_seed}</dd>
                  </div>
                  <div className="min-w-0 sm:col-span-4">
                    <dt className="text-micro text-night-muted">Client seed</dt>
                    <dd className="figure-num mt-0.5 truncate text-small">{pair.client_seed}</dd>
                  </div>
                  <div className="sm:col-span-3">
                    <dt className="text-micro text-night-muted">Rounds</dt>
                    <dd className="figure-num mt-0.5 text-small">{pair.nonce}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-14 max-w-[62ch]" aria-labelledby="edge">
        <h2 id="edge" className="text-section">
          The edge, stated
        </h2>
        <p className="mt-3 text-body text-night-muted">
          Fair odds would return 100%. KYRO returns {100 - HOUSE_EDGE_BP / 100}% — a house
          edge of {formatBasisPoints(HOUSE_EDGE_BP)} on every game. That is how the
          business makes money, and over enough rounds it is what you should expect to lose.
        </p>

        <dl className="mt-6 border-t border-night-rule">
          {[
            ["Coin Flip", "A fair coin pays 2×. KYRO pays 1.98×."],
            ["Dice", "Fair payout is 100 ÷ win chance. KYRO pays 99 ÷ win chance."],
            [
              "Mines",
              "Derived from the real odds of surviving each reveal, with the edge applied once at the end rather than compounding per tile.",
            ],
            [
              "Crash",
              "One round in a hundred breaks instantly at 1.00×. Every cash-out target returns the same 99% — no multiplier is a better bet than another.",
            ],
            [
              "Plinko",
              `Thirteen buckets, from ${((PLINKO_MULTIPLIERS[6] ?? 0) / 10_000).toFixed(2)}× in the middle to ${((PLINKO_MULTIPLIERS[0] ?? 0) / 10_000).toFixed(0)}× at the edges. The multipliers are computed from the binomial distribution, not chosen.`,
            ],
          ].map(([game, detail]) => (
            <div key={game} className="border-b border-night-rule py-4">
              <dt className="font-medium">{game}</dt>
              <dd className="mt-1 text-small text-night-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
