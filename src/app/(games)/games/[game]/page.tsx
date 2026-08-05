import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinFlipGame } from "@/components/games/CoinFlipGame";
import { CrashGame } from "@/components/games/CrashGame";
import { DiceGame } from "@/components/games/DiceGame";
import { GameShell } from "@/components/games/GameShell";
import { MinesGame } from "@/components/games/MinesGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { GAMES, GAME_META, type GameId } from "@/lib/games";
import type { CryptoCode } from "@/lib/money/currencies";
import { hasSupabase } from "@/server/env";
import { playSession } from "@/server/games/session";

export const dynamic = "force-dynamic";

/** Everything is staked in USDT — one unit of account across all five games. */
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

export default async function GamePage({
  params,
}: {
  readonly params: Promise<{ readonly game: string }>;
}) {
  const { game } = await params;
  if (!GAMES.includes(game as GameId)) notFound();
  const meta = GAME_META[game as GameId];

  if (!hasSupabase()) {
    return <GameShell meta={meta} gate={{ reason: "no-database" }}>{null}</GameShell>;
  }

  const session = await playSession();

  if (!session.ok) {
    return (
      <GameShell meta={meta} gate={{ reason: session.reason, until: session.until }}>
        {null}
      </GameShell>
    );
  }

  const balance = session.session.balances.get(PLAY_ASSET) ?? 0n;

  return (
    <GameShell
      meta={meta}
      serverSeedHash={session.session.serverSeedHash}
      clientSeed={session.session.clientSeed}
      nonce={session.session.nonce}
    >
      {game === "coin-flip" ? (
        <CoinFlipGame asset={PLAY_ASSET} balance={balance} />
      ) : game === "dice" ? (
        <DiceGame asset={PLAY_ASSET} balance={balance} />
      ) : game === "mines" ? (
        <MinesGame asset={PLAY_ASSET} balance={balance} />
      ) : game === "crash" ? (
        <CrashGame asset={PLAY_ASSET} balance={balance} />
      ) : (
        <PlinkoGame asset={PLAY_ASSET} balance={balance} />
      )}
    </GameShell>
  );
}
