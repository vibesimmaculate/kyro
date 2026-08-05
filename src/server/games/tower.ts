"use server";

import { z } from "zod";
import { CRYPTO_CODES } from "@/lib/money/currencies";
import {
  HOUSE_EDGE_BP,
  TOWER_FLOORS,
  TOWER_RULES,
  payoutFor,
  towerBoard,
  towerMultiplier,
  type TowerDifficulty,
} from "@/lib/games";
import { balanceOf, placeBet, payoutRound } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { playSession } from "./session";

/**
 * Tower, played a floor at a time.
 *
 * Same shape as Mines: the board is fixed by the seeds when the round opens and
 * recomputed from them on every step, so nothing about it can move once the
 * climb has started. The stake is taken up front, which is what makes walking
 * away mid-climb cost something and cashing out mean something.
 */

const OpenSchema = z.object({
  asset: z.enum(CRYPTO_CODES),
  stake: z.string().regex(/^\d{1,40}$/),
  difficulty: z.enum(["easy", "medium", "hard", "brutal"]),
});

export interface TowerState {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly difficulty?: TowerDifficulty;
  /** The door taken on each cleared floor, lowest first. */
  readonly climbed?: readonly number[];
  readonly multiplier?: number;
  readonly nextMultiplier?: number;
  readonly busted?: boolean;
  readonly finished?: boolean;
  /** Revealed only once the round is over. */
  readonly traps?: readonly number[][];
  readonly payout?: string;
  readonly balance?: string;
}

interface RoundRow {
  id: string;
  asset: (typeof CRYPTO_CODES)[number];
  stake: string;
  params: { difficulty: TowerDifficulty; climbed?: number[] };
  status: string;
  nonce: number;
  client_seed: string;
  seed_pair_id: string;
}

async function loadRound(roundId: string, userId: string): Promise<RoundRow | null> {
  const { data } = await admin()
    .from("game_rounds")
    .select("id,asset,stake::text,params,status,nonce,client_seed,seed_pair_id")
    .eq("id", roundId)
    .eq("user_id", userId)
    .eq("game", "tower")
    .maybeSingle()
    .returns<RoundRow | null>();
  return data;
}

async function serverSeedFor(seedPairId: string): Promise<string> {
  const { data } = await admin()
    .from("seed_pairs")
    .select("server_seed")
    .eq("id", seedPairId)
    .single();
  if (!data) throw new Error("Seed pair missing");
  return data.server_seed;
}

export async function openTowerRound(formData: FormData): Promise<TowerState> {
  const parsed = OpenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and difficulty." };

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

  // Claim the nonce first, so the tower is committed to before the money moves.
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
      game: "tower",
      seed_pair_id: session.seedPairId,
      nonce,
      server_seed_hash: session.serverSeedHash,
      client_seed: clientSeed,
      asset: parsed.data.asset,
      stake: parsed.data.stake as unknown as number,
      edge_bp: HOUSE_EDGE_BP,
      params: { difficulty: parsed.data.difficulty, climbed: [] },
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
    difficulty: parsed.data.difficulty,
    climbed: [],
    multiplier: 10_000,
    nextMultiplier: towerMultiplier(parsed.data.difficulty, 1),
    balance: String(
      await balanceOf({ kind: "user", userId: session.userId, asset: parsed.data.asset }),
    ),
  };
}

export async function climbTower(roundId: string, door: number): Promise<TowerState> {
  const gate = await playSession();
  if (!gate.ok) return { ok: false, error: "Sign in to play." };

  const round = await loadRound(roundId, gate.session.userId);
  if (!round) return { ok: false, error: "Round not found." };
  if (round.status !== "open") return { ok: false, error: "That round is already finished." };

  const difficulty = round.params.difficulty;
  const rules = TOWER_RULES[difficulty];
  if (!Number.isInteger(door) || door < 0 || door >= rules.doors) {
    return { ok: false, error: "That is not a door on this floor." };
  }

  const climbed = round.params.climbed ?? [];
  const floor = climbed.length;
  if (floor >= TOWER_FLOORS) return { ok: false, error: "You are already at the top." };

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  const board = towerBoard(difficulty, serverSeed, round.client_seed, round.nonce);
  const traps = board.traps[floor] ?? [];

  const db = admin();

  if (traps.includes(door)) {
    await db
      .from("game_rounds")
      .update({
        status: "settled",
        multiplier: 0,
        payout: "0" as unknown as number,
        params: { ...round.params, climbed: [...climbed, door] },
        outcome: {
          traps: board.traps.map((row) => [...row]),
          climbed: [...climbed, door],
          floorsCleared: floor,
          hitOnFloor: floor,
        },
        settled_at: new Date().toISOString(),
      })
      .eq("id", roundId);

    return {
      ok: true,
      roundId,
      difficulty,
      climbed: [...climbed, door],
      busted: true,
      finished: true,
      traps: board.traps,
      multiplier: 0,
      balance: String(
        await balanceOf({ kind: "user", userId: gate.session.userId, asset: round.asset }),
      ),
    };
  }

  const nextClimbed = [...climbed, door];
  await db
    .from("game_rounds")
    .update({ params: { ...round.params, climbed: nextClimbed } })
    .eq("id", roundId);

  // Reaching the top leaves nothing further to risk, so it settles itself.
  if (nextClimbed.length === TOWER_FLOORS) return cashOutTower(roundId);

  return {
    ok: true,
    roundId,
    difficulty,
    climbed: nextClimbed,
    busted: false,
    multiplier: towerMultiplier(difficulty, nextClimbed.length),
    nextMultiplier: towerMultiplier(difficulty, nextClimbed.length + 1),
  };
}

export async function cashOutTower(roundId: string): Promise<TowerState> {
  const gate = await playSession();
  if (!gate.ok) return { ok: false, error: "Sign in to play." };

  const round = await loadRound(roundId, gate.session.userId);
  if (!round) return { ok: false, error: "Round not found." };
  if (round.status !== "open") return { ok: false, error: "That round is already finished." };

  const difficulty = round.params.difficulty;
  const climbed = round.params.climbed ?? [];
  if (climbed.length === 0) return { ok: false, error: "Clear a floor first." };

  const multiplier = towerMultiplier(difficulty, climbed.length);
  const payout = payoutFor(BigInt(round.stake), multiplier);

  const transactionId = await payoutRound({
    userId: gate.session.userId,
    asset: round.asset,
    payout,
    roundId,
  });

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  const board = towerBoard(difficulty, serverSeed, round.client_seed, round.nonce);

  await admin()
    .from("game_rounds")
    .update({
      status: "settled",
      multiplier,
      payout: String(payout) as unknown as number,
      outcome: {
        traps: board.traps.map((row) => [...row]),
        climbed,
        floorsCleared: climbed.length,
        hitOnFloor: null,
      },
      payout_transaction_id: transactionId ?? null,
      settled_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  return {
    ok: true,
    roundId,
    difficulty,
    climbed,
    finished: true,
    busted: false,
    multiplier,
    payout: String(payout),
    traps: board.traps,
    balance: String(
      await balanceOf({ kind: "user", userId: gate.session.userId, asset: round.asset }),
    ),
  };
}
