"use server";

import { z } from "zod";
import { CRYPTO_CODES } from "@/lib/money/currencies";
import { HOUSE_EDGE_BP, MINES_TILES, minesBoard, minesMultiplier, payoutFor } from "@/lib/games";
import { balanceOf, placeBet, payoutRound } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { playSession } from "./session";

/**
 * Mines, played a tile at a time.
 *
 * The board is fixed by the seeds the moment the round opens — before a single
 * tile is touched — and the server recomputes it from those seeds on every
 * reveal rather than storing it. So there is nothing to tamper with: the board
 * a player is walking through is the one the commitment hash already promised.
 *
 * The stake is taken when the round opens. Walking away mid-round therefore
 * loses it, exactly as walking away from a hand of cards would, and there is no
 * half-settled state for a dropped connection to exploit.
 */

const OpenSchema = z.object({
  asset: z.enum(CRYPTO_CODES),
  stake: z.string().regex(/^\d{1,40}$/),
  mines: z.coerce.number().int().min(1).max(24),
});

export interface MinesRoundState {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly revealed?: readonly number[];
  readonly multiplier?: number;
  readonly nextMultiplier?: number;
  readonly busted?: boolean;
  readonly mineTiles?: readonly number[];
  readonly payout?: string;
  readonly balance?: string;
  readonly finished?: boolean;
}

async function loadRound(roundId: string, userId: string) {
  const { data } = await admin()
    .from("game_rounds")
    .select("id,user_id,asset,stake::text,params,status,nonce,client_seed,seed_pair_id")
    .eq("id", roundId)
    .eq("user_id", userId)
    .maybeSingle()
    .returns<{
      id: string;
      user_id: string;
      asset: (typeof CRYPTO_CODES)[number];
      stake: string;
      params: { mines: number; picks?: number[] };
      status: string;
      nonce: number;
      client_seed: string;
      seed_pair_id: string;
    } | null>();
  return data;
}

/** The server seed is read here and nowhere the client can reach. */
async function serverSeedFor(seedPairId: string): Promise<string> {
  const { data } = await admin()
    .from("seed_pairs")
    .select("server_seed")
    .eq("id", seedPairId)
    .single();
  if (!data) throw new Error("Seed pair missing");
  return data.server_seed;
}

export async function openMinesRound(formData: FormData): Promise<MinesRoundState> {
  const parsed = OpenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and mine count." };

  const gate = await playSession();
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.reason === "signed-out" ? "Sign in to play." : "Playing is not available.",
    };
  }

  const session = gate.session;
  const db = admin();
  const stake = BigInt(parsed.data.stake);
  if (stake <= 0n) return { ok: false, error: "Enter a stake." };

  // Claim the nonce before anything else, so the board is committed to before
  // the money moves. Retries on contention — two tabs open is normal, and the
  // conditional update is what stops both getting the same board.
  let nonce = 0;
  let clientSeed = "";
  let claimed = false;

  for (let attempt = 0; attempt < 5 && !claimed; attempt += 1) {
    const { data: pair } = await db
      .from("seed_pairs")
      .select("nonce,client_seed")
      .eq("id", session.seedPairId)
      .single();
    if (!pair) return { ok: false, error: "Could not read your seeds." };

    nonce = pair.nonce + 1;
    clientSeed = pair.client_seed;

    const { data: rows } = await db
      .from("seed_pairs")
      .update({ nonce })
      .eq("id", session.seedPairId)
      .eq("nonce", pair.nonce)
      .select("id");

    claimed = Boolean(rows && rows.length > 0);
  }

  if (!claimed) return { ok: false, error: "Could not start a round — try again." };

  const { data: round, error } = await db
    .from("game_rounds")
    .insert({
      user_id: session.userId,
      game: "mines",
      seed_pair_id: session.seedPairId,
      nonce,
      server_seed_hash: session.serverSeedHash,
      client_seed: clientSeed,
      asset: parsed.data.asset,
      stake: parsed.data.stake as unknown as number,
      edge_bp: HOUSE_EDGE_BP,
      params: { mines: parsed.data.mines, picks: [] },
      status: "open",
    })
    .select("id")
    .single();

  if (error || !round) return { ok: false, error: "Could not open the round." };

  const staked = await placeBet({
    userId: session.userId,
    asset: parsed.data.asset,
    stake,
    roundId: round.id,
  });

  if (!staked.ok) {
    await db.from("game_rounds").update({ status: "cancelled" }).eq("id", round.id);
    return { ok: false, error: "That is more than your balance." };
  }

  await db
    .from("game_rounds")
    .update({ stake_transaction_id: staked.transactionId })
    .eq("id", round.id);

  return {
    ok: true,
    roundId: round.id,
    revealed: [],
    multiplier: 10_000,
    nextMultiplier: minesMultiplier(parsed.data.mines, 1),
    balance: String(
      await balanceOf({ kind: "user", userId: session.userId, asset: parsed.data.asset }),
    ),
  };
}

export async function revealMinesTile(
  roundId: string,
  tile: number,
): Promise<MinesRoundState> {
  if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TILES) {
    return { ok: false, error: "That is not a tile." };
  }

  const gate = await playSession();
  if (!gate.ok) return { ok: false, error: "Sign in to play." };

  const round = await loadRound(roundId, gate.session.userId);
  if (!round) return { ok: false, error: "Round not found." };
  if (round.status !== "open") return { ok: false, error: "That round is already finished." };

  const picks = round.params.picks ?? [];
  if (picks.includes(tile)) return { ok: false, error: "Already revealed." };

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  const board = minesBoard(
    { mines: round.params.mines },
    serverSeed,
    round.client_seed,
    round.nonce,
  );

  const db = admin();
  const hit = board.mineTiles.includes(tile);
  const nextPicks = [...picks, tile];

  if (hit) {
    await db
      .from("game_rounds")
      .update({
        status: "settled",
        multiplier: 0,
        payout: "0" as unknown as number,
        params: { ...round.params, picks: nextPicks },
        outcome: { mineTiles: [...board.mineTiles], picks: nextPicks, hit: tile, survived: picks.length },
        settled_at: new Date().toISOString(),
      })
      .eq("id", roundId);

    return {
      ok: true,
      roundId,
      revealed: nextPicks,
      busted: true,
      finished: true,
      mineTiles: board.mineTiles,
      multiplier: 0,
      balance: String(
        await balanceOf({ kind: "user", userId: gate.session.userId, asset: round.asset }),
      ),
    };
  }

  const safeCount = nextPicks.length;
  const allSafeFound = safeCount === MINES_TILES - round.params.mines;

  await db
    .from("game_rounds")
    .update({ params: { ...round.params, picks: nextPicks } })
    .eq("id", roundId);

  // Clearing the board leaves nothing further to risk, so it settles itself.
  if (allSafeFound) return cashOutMines(roundId);

  return {
    ok: true,
    roundId,
    revealed: nextPicks,
    busted: false,
    multiplier: minesMultiplier(round.params.mines, safeCount),
    nextMultiplier: minesMultiplier(round.params.mines, safeCount + 1),
  };
}

export async function cashOutMines(roundId: string): Promise<MinesRoundState> {
  const gate = await playSession();
  if (!gate.ok) return { ok: false, error: "Sign in to play." };

  const round = await loadRound(roundId, gate.session.userId);
  if (!round) return { ok: false, error: "Round not found." };
  if (round.status !== "open") return { ok: false, error: "That round is already finished." };

  const picks = round.params.picks ?? [];
  if (picks.length === 0) return { ok: false, error: "Reveal a tile first." };

  const multiplier = minesMultiplier(round.params.mines, picks.length);
  const payout = payoutFor(BigInt(round.stake), multiplier);

  const transactionId = await payoutRound({
    userId: gate.session.userId,
    asset: round.asset,
    payout,
    roundId,
  });

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  const board = minesBoard(
    { mines: round.params.mines },
    serverSeed,
    round.client_seed,
    round.nonce,
  );

  await admin()
    .from("game_rounds")
    .update({
      status: "settled",
      multiplier,
      payout: String(payout) as unknown as number,
      outcome: { mineTiles: [...board.mineTiles], picks, survived: picks.length, hit: null },
      payout_transaction_id: transactionId ?? null,
      settled_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  return {
    ok: true,
    roundId,
    revealed: picks,
    finished: true,
    busted: false,
    multiplier,
    payout: String(payout),
    mineTiles: board.mineTiles,
    balance: String(
      await balanceOf({ kind: "user", userId: gate.session.userId, asset: round.asset }),
    ),
  };
}
