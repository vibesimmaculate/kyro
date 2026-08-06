import Link from "next/link";
import type { ReactNode } from "react";
import { FairnessPanel } from "@/components/games/FairnessPanel";
import { formatBasisPoints } from "@/lib/money/format";
import { HOUSE_EDGE_BP, type GameMeta } from "@/lib/games";
import type { GateReason } from "@/server/games/session";

/**
 * The frame every game shares.
 *
 * Board on the left, controls on the right, the fairness commitment underneath
 * where it can always be checked. The house edge is printed on the page — not
 * in a modal, not in terms nobody opens.
 */

export interface GameShellProps {
  readonly meta: GameMeta;
  /** The game itself, which lays out its own board and controls. */
  readonly children: ReactNode;
  readonly serverSeedHash?: string;
  readonly clientSeed?: string;
  readonly nonce?: number;
  readonly gate?: { readonly reason: GateReason; readonly until?: string };
  /** Sits between the rules and the board — the demo notice, usually. */
  readonly notice?: ReactNode;
}

export function GameShell({
  meta,
  children,
  serverSeedHash,
  clientSeed,
  nonce,
  gate,
  notice,
}: GameShellProps) {
  return (
    <div className="shell py-6 md:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-title">{meta.name}</h1>
          <p className="mt-1.5 text-lead text-night-muted">{meta.tagline}</p>
        </div>
        <p className="label-mono text-night-muted">
          House edge {formatBasisPoints(HOUSE_EDGE_BP)}
        </p>
      </div>

      <p className="mt-2 max-w-[62ch] text-small text-night-muted">{meta.rule}</p>

      {gate ? (
        <>
          <GateNotice gate={gate} />
          {/*
            Rather than leaving a locked, greyed-out board taking up a screen of
            nothing, a visitor who cannot play is shown what the game actually
            is and what it costs. The odds are the same information whether or
            not you have an account, so there is no reason to withhold them.
          */}
          <GameExplainer meta={meta} />
        </>
      ) : (
        <>
          {notice}
          <div className="mt-5">{children}</div>
        </>
      )}

      {serverSeedHash && clientSeed !== undefined && nonce !== undefined ? (
        <FairnessPanel
          serverSeedHash={serverSeedHash}
          clientSeed={clientSeed}
          nonce={nonce}
          className="mt-10"
        />
      ) : null}
    </div>
  );
}

/** What the game is and what it pays — readable without an account. */
function GameExplainer({ meta }: { readonly meta: GameMeta }) {
  const odds: Record<GameMeta["id"], readonly [string, string][]> = {
    wheel: [
      ["Segments", "54, in one of three rings"],
      ["Pays", "What the pointer stops on"],
      ["Rings", "Low pays often and small; high pays rarely and large"],
    ],
    tower: [
      ["Floors", "8, one trapped door on each"],
      ["Doors per floor", "2 to 4, depending on difficulty"],
      ["Pays", "More with every floor — take it whenever you want"],
    ],
    "coin-flip": [
      ["Chance of winning", "50%"],
      ["Pays", "1.98× your stake"],
      ["Fair payout would be", "2.00×"],
    ],
    dice: [
      ["Chance of winning", "You choose, 1% to 95%"],
      ["Pays", "99 ÷ your win chance"],
      ["Fair payout would be", "100 ÷ your win chance"],
    ],
    mines: [
      ["Board", "25 tiles, 1 to 24 mines"],
      ["Pays", "More with every safe tile — cash out whenever"],
      ["Edge applied", "Once at the end, not per tile"],
    ],
    crash: [
      ["Instant bust", "1 round in 100, at 1.00×"],
      ["Pays", "Your chosen multiplier, if the curve reaches it"],
      ["Return", "99% at every target — no multiplier is a better bet"],
    ],
    plinko: [
      ["Rows", "12, giving 13 buckets"],
      ["Centre bucket", "About 23 times in 100"],
      ["Each edge bucket", "About once in 4 096"],
    ],
  };

  return (
    <section className="mt-10 max-w-[52rem]" aria-labelledby="explainer">
      <h2 id="explainer" className="label-mono text-night-muted">
        How {meta.name} works
      </h2>
      <dl className="mt-3 border-t border-night-rule">
        {odds[meta.id].map(([term, detail]) => (
          <div
            key={term}
            className="flex flex-col gap-0.5 border-b border-night-rule py-3 sm:flex-row sm:items-baseline sm:gap-1.5"
          >
            <dt className="flex-none text-small text-night-muted">{term}</dt>
            <span aria-hidden="true" className="leader-night hidden sm:block" />
            <dd className="flex-none text-small">{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-[62ch] text-small text-night-muted">
        Every outcome is decided by a seed KYRO commits to before you bet and reveals
        afterwards, so it can be recomputed by anyone.{" "}
        <Link href="/games/fairness" className="text-night-text underline underline-offset-4">
          How that works
        </Link>
        .
      </p>
    </section>
  );
}

function GateNotice({ gate }: { readonly gate: { reason: GateReason; until?: string } }) {
  const copy: Record<GateReason, { title: string; body: ReactNode }> = {
    "signed-out": {
      title: "Sign in to play.",
      body: (
        <>
          Games need an account — real balances, real limits, and a record you can check.{" "}
          <Link href="/sign-in?next=/games" className="underline underline-offset-4">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/sign-up?next=/games" className="underline underline-offset-4">
            create one
          </Link>
          .
        </>
      ),
    },
    "age-unconfirmed": {
      title: "Confirm your age first.",
      body: (
        <>
          You must be 18 or over.{" "}
          <Link href="/games/age" className="underline underline-offset-4">
            Confirm your date of birth
          </Link>{" "}
          to continue.
        </>
      ),
    },
    "self-excluded": {
      title: "Your account is self-excluded.",
      body: gate.until
        ? `Until ${new Date(gate.until).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}. This cannot be shortened — that is the point of it. Withdrawals can still be arranged through support.`
        : "Withdrawals can still be arranged through support.",
    },
    "no-database": {
      title: "Games are unavailable.",
      body: "This install has no database configured, so balances cannot be held. The exchange still works.",
    },
  };

  const { title, body } = copy[gate.reason];

  return (
    <div className="mt-6 max-w-[52rem] rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <p className="text-subhead font-medium">{title}</p>
      <p className="mt-1.5 text-small text-night-muted">{body}</p>
    </div>
  );
}
