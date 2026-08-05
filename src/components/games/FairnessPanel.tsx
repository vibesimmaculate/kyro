import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The commitment, shown under every game.
 *
 * The hash is published before a single round is played. When the seed is
 * rotated it is revealed, and every round played against it becomes checkable
 * by anyone with the verifier. Keeping this on the page rather than behind a
 * link is the difference between a claim and a proof.
 */
export interface FairnessPanelProps {
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly className?: string;
}

export function FairnessPanel({
  serverSeedHash,
  clientSeed,
  nonce,
  className,
}: FairnessPanelProps) {
  return (
    <section
      aria-labelledby="fairness-heading"
      className={cn("rounded-[10px] border border-night-rule bg-night-raised p-5", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="fairness-heading" className="label-mono text-night-muted">
          Provably fair
        </h2>
        <Link
          href="/games/fairness"
          className="text-small text-night-muted underline underline-offset-4 transition-colors hover:text-night-text"
        >
          Verify a round
        </Link>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-micro text-night-muted">Server seed hash</dt>
          <dd className="figure-num mt-1 truncate text-small" title={serverSeedHash}>
            {serverSeedHash}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-micro text-night-muted">Your client seed</dt>
          <dd className="figure-num mt-1 truncate text-small" title={clientSeed}>
            {clientSeed}
          </dd>
        </div>
        <div>
          <dt className="text-micro text-night-muted">Rounds played on it</dt>
          <dd className="figure-num mt-1 text-small">{nonce}</dd>
        </div>
      </dl>

      <p className="mt-4 max-w-[62ch] text-micro text-night-muted">
        The hash was published before your first round. KYRO cannot change the seed
        without changing the hash, and cannot know the outcome of a round before you
        stake it. Rotate the seed whenever you like — doing so reveals the old one, and
        every round played against it can then be recomputed by anyone.
      </p>
    </section>
  );
}
