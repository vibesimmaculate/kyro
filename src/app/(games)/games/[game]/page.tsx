import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinFlipGame } from "@/components/games/CoinFlipGame";
import { CrashGame } from "@/components/games/CrashGame";
import { DemoBanner } from "@/components/games/DemoBanner";
import { DiceGame } from "@/components/games/DiceGame";
import { GameShell } from "@/components/games/GameShell";
import { MinesGame } from "@/components/games/MinesGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { TowerGame } from "@/components/games/TowerGame";
import { GAMES, GAME_META, type GameId } from "@/lib/games";
import { DEMO_STARTING_BALANCE } from "@/lib/games/demo";
import type { CryptoCode } from "@/lib/money/currencies";
import { hasSupabase } from "@/server/env";
import { playSession } from "@/server/games/session";

export const dynamic = "force-dynamic";

/** Everything is staked in USDT — one unit of account across all six games. */
const PLAY_ASSET: CryptoCode = "USDT";

export function generateStaticParams() {
  return GAMES.map((game) => ({ game }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly game: string }>;
}): Promise<Metadata> {
  const { game } = await params;
  const meta = GAME_META[game as GameId];
  if (!meta) return { title: "Game not found" };
  return {
    title: `${meta.name} — Games`,
    description: `${meta.tagline} ${meta.rule}`,
    robots: { index: false, follow: false },
  };
}

/**
 * A game page.
 *
 * Anyone who lands here can play immediately, in demo mode, with no account and
 * no deposit — because a game you cannot try is a game nobody chooses. Signing
 * in swaps the demo runner for the real one; nothing else about the page
 * changes, which is the point: what you learned in demo is what you get.
 */
export default async function GamePage({
  params,
}: {
  readonly params: Promise<{ readonly game: string }>;
}) {
  const { game } = await params;
  if (!GAMES.includes(game as GameId)) notFound();
  const meta = GAME_META[game as GameId];

  const session = hasSupabase() ? await playSession() : undefined;
  const live = session?.ok === true;

  // Self-exclusion is the one state that must not be playable in any mode. An
  // excluded account being offered "just the demo" would make the tool
  // pointless, so it is the only gate that still blocks the board.
  if (session && !session.ok && session.reason === "self-excluded") {
    return (
      <GameShell meta={meta} gate={{ reason: session.reason, until: session.until }}>
        {null}
      </GameShell>
    );
  }

  const balance = live ? (session.session.balances.get(PLAY_ASSET) ?? 0n) : DEMO_STARTING_BALANCE;
  const demo = !live;

  const board =
    game === "tower" ? (
      <TowerGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    ) : game === "coin-flip" ? (
      <CoinFlipGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    ) : game === "dice" ? (
      <DiceGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    ) : game === "mines" ? (
      <MinesGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    ) : game === "crash" ? (
      <CrashGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    ) : (
      <PlinkoGame asset={PLAY_ASSET} balance={balance} demo={demo} />
    );

  return (
    <GameShell
      meta={meta}
      serverSeedHash={live ? session.session.serverSeedHash : undefined}
      clientSeed={live ? session.session.clientSeed : undefined}
      nonce={live ? session.session.nonce : undefined}
      notice={
        demo ? (
          <DemoBanner className="mt-4" />
        ) : session && !session.ok ? undefined : undefined
      }
    >
      {board}
    </GameShell>
  );
}
