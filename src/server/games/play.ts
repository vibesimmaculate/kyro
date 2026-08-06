"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CRYPTO_CODES, type CryptoCode } from "@/lib/money/currencies";
import {
  COIN_FLIP_MULTIPLIER,
  HOUSE_EDGE_BP,
  MULTIPLIER_SCALE,
  crashPoint,
  diceMultiplier,
  minesBoard,
  minesMultiplier,
  payoutFor,
  playCoinFlip,
  playDice,
  plinkoMultiplier,
  plinkoPath,
  PLINKO_RISKS,
  PLINKO_ROW_OPTIONS,
  type GameId,
} from "@/lib/games";
import { placeBet, payoutRound } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { playSession } from "./session";

/**
 * Playing a round.
 *
 * The order of operations is the security model:
 *
 *   1. Check the gate — signed in, of age, not excluded.
 *   2. Read the seeds and take the next nonce, atomically.
 *   3. Take the stake through `place_bet`, which locks the balance.
 *   4. Only then compute the outcome, from the seeds that were already
 *      committed to before the bet existed.
 *   5. Pay out, idempotently.
 *
 * At no point does the outcome depend on anything chosen after the stake was
 * taken. That is what the commitment hash proves, and it is why the seed is
 * read here and nowhere else.
 */

export interface RoundResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly multiplier?: number;
  readonly payout?: string;
  readonly outcome?: Record<string, unknown>;
  readonly balance?: string;
  readonly nonce?: number;
}

const StakeSchema = z.object({
  asset: z.enum(CRYPTO_CODES),
  /** Integer base units, as a string. Never a JS number. */
  stake: z.string().regex(/^\d{1,40}$/, "Enter a stake."),
});

/**
 * Claims the next nonce for a seed pair.
 *
 * The update is conditional on the nonce not having moved, so two rounds can
 * never be handed the same one — which would repeat an outcome and break the
 * fairness guarantee. Losing that race is expected rather than exceptional: a
 * player with two tabs open, or a double-tapped button, hits it routinely. So
 * it retries rather than surfacing an error nobody can act on.
 */
async function takeNonce(
  seedPairId: string,
): Promise<{ serverSeed: string; clientSeed: string; nonce: number }> {
  const db = admin();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db
      .from("seed_pairs")
      .select("server_seed,client_seed,nonce")
      .eq("id", seedPairId)
      .single();

    if (error || !data) throw new Error("Could not read the seed pair.");

    const nonce = data.nonce + 1;
    const { data: claimed } = await db
      .from("seed_pairs")
      .update({ nonce })
      .eq("id", seedPairId)
      .eq("nonce", data.nonce)
      .select("id");

    if (claimed && claimed.length > 0) {
      return { serverSeed: data.server_seed, clientSeed: data.client_seed, nonce };
    }
  }

  throw new Error("Could not claim a round number — try again.");
}

/** Whatever a game stores in its jsonb columns, shaped so Postgres accepts it. */
type JsonRecord = Record<string, unknown>;

const asJson = (value: JsonRecord) => value as unknown as never;

interface PlayInput {
  readonly game: GameId;
  readonly asset: CryptoCode;
  readonly stake: bigint;
  readonly params: JsonRecord;
}

async function runRound(
  input: PlayInput,
  compute: (serverSeed: string, clientSeed: string, nonce: number) => {
    multiplier: number;
    outcome: JsonRecord;
  },
): Promise<RoundResult> {
  const gate = await playSession();
  if (!gate.ok) {
    return {
      ok: false,
      error:
        gate.reason === "signed-out"
          ? "Sign in to play."
          : gate.reason === "age-unconfirmed"
            ? "Confirm your age before playing."
            : "Your account is self-excluded.",
    };
  }

  const session = gate.session;
  const db = admin();

  const { serverSeed, clientSeed, nonce } = await takeNonce(session.seedPairId);

  const { data: round, error } = await db
    .from("game_rounds")
    .insert({
      user_id: session.userId,
      game: input.game,
      seed_pair_id: session.seedPairId,
      nonce,
      server_seed_hash: session.serverSeedHash,
      client_seed: clientSeed,
      asset: input.asset,
      stake: String(input.stake) as unknown as number,
      edge_bp: HOUSE_EDGE_BP,
      params: asJson(input.params),
      status: "open",
    })
    .select("id")
    .single();

  if (error || !round) {
    return { ok: false, error: "Could not open the round." };
  }

  const staked = await placeBet({
    userId: session.userId,
    asset: input.asset,
    stake: input.stake,
    roundId: round.id,
  });

  if (!staked.ok) {
    await db.from("game_rounds").update({ status: "cancelled" }).eq("id", round.id);
    return { ok: false, error: "That is more than your balance." };
  }

  // The outcome is computed only now — and entirely from seeds that were
  // committed to before this round existed.
  const { multiplier, outcome } = compute(serverSeed, clientSeed, nonce);
  const payout = payoutFor(input.stake, multiplier);

  const payoutTransaction =
    payout > 0n
      ? await payoutRound({
          userId: session.userId,
          asset: input.asset,
          payout,
          roundId: round.id,
        })
      : undefined;

  await db
    .from("game_rounds")
    .update({
      status: "settled",
      multiplier,
      payout: String(payout) as unknown as number,
      outcome: asJson(outcome),
      settled_at: new Date().toISOString(),
      stake_transaction_id: staked.transactionId,
      payout_transaction_id: payoutTransaction ?? null,
    })
    .eq("id", round.id);

  const balances = await import("@/server/ledger").then((m) =>
    m.balanceOf({ kind: "user", userId: session.userId, asset: input.asset }),
  );

  revalidatePath("/games");

  return {
    ok: true,
    roundId: round.id,
    multiplier,
    payout: String(payout),
    outcome,
    balance: String(balances),
    nonce,
  };
}

/* ── The five games ────────────────────────────────────────────────────── */

export async function playCoinFlipRound(formData: FormData): Promise<RoundResult> {
  const parsed = StakeSchema.extend({
    pick: z.enum(["heads", "tails"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and pick." };

  return runRound(
    {
      game: "coin-flip",
      asset: parsed.data.asset,
      stake: BigInt(parsed.data.stake),
      params: { pick: parsed.data.pick },
    },
    (serverSeed, clientSeed, nonce) => {
      const result = playCoinFlip({ pick: parsed.data.pick }, serverSeed, clientSeed, nonce);
      return {
        multiplier: result.won ? COIN_FLIP_MULTIPLIER : 0,
        outcome: { landed: result.landed, won: result.won },
      };
    },
  );
}

export async function playDiceRound(formData: FormData): Promise<RoundResult> {
  const parsed = StakeSchema.extend({
    chance: z.coerce.number().min(1).max(95),
    direction: z.enum(["under", "over"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and odds." };

  return runRound(
    {
      game: "dice",
      asset: parsed.data.asset,
      stake: BigInt(parsed.data.stake),
      params: { chance: parsed.data.chance, direction: parsed.data.direction },
    },
    (serverSeed, clientSeed, nonce) => {
      const result = playDice(
        { chance: parsed.data.chance, direction: parsed.data.direction },
        serverSeed,
        clientSeed,
        nonce,
      );
      return {
        multiplier: result.won ? diceMultiplier(parsed.data.chance) : 0,
        outcome: { roll: result.roll, target: result.target, won: result.won },
      };
    },
  );
}

export async function playCrashRound(formData: FormData): Promise<RoundResult> {
  const parsed = StakeSchema.extend({
    /** Where the player has set their automatic cash-out, at 4dp. */
    target: z.coerce.number().min(1.01).max(1000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and target." };

  const target = Math.round(parsed.data.target * MULTIPLIER_SCALE);

  return runRound(
    {
      game: "crash",
      asset: parsed.data.asset,
      stake: BigInt(parsed.data.stake),
      params: { target },
    },
    (serverSeed, clientSeed, nonce) => {
      const { crashPoint: point } = crashPoint(serverSeed, clientSeed, nonce);
      const survived = point >= target;
      return {
        multiplier: survived ? target : 0,
        outcome: { crashPoint: point, target, survived },
      };
    },
  );
}

const PlinkoSchema = StakeSchema.extend({
  // Coerced from the form as a string, then checked against the allowed set —
  // an arbitrary row count would produce a board with no published odds.
  rows: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .refine((value): value is (typeof PLINKO_ROW_OPTIONS)[number] =>
      (PLINKO_ROW_OPTIONS as readonly number[]).includes(value),
    ),
  risk: z.enum(PLINKO_RISKS),
});

export async function playPlinkoRound(formData: FormData): Promise<RoundResult> {
  const parsed = PlinkoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake." };
  const { rows, risk } = parsed.data;

  return runRound(
    {
      game: "plinko",
      asset: parsed.data.asset,
      stake: BigInt(parsed.data.stake),
      params: { rows, risk },
    },
    (serverSeed, clientSeed, nonce) => {
      const { path, bucket } = plinkoPath(serverSeed, clientSeed, nonce, rows);
      return {
        multiplier: plinkoMultiplier(bucket, rows, risk),
        outcome: { path, bucket, rows, risk },
      };
    },
  );
}

/**
 * Mines is settled in one shot rather than tile by tile.
 *
 * The board is fixed by the seeds before anything is revealed, and the client
 * sends the tiles it opened in order. The server replays that sequence against
 * the real board: if a mine appears at any point, the round is lost regardless
 * of what came after. This keeps the whole game one atomic bet — there is no
 * half-settled state to exploit by disconnecting.
 */
export async function playMinesRound(formData: FormData): Promise<RoundResult> {
  const parsed = StakeSchema.extend({
    mines: z.coerce.number().int().min(1).max(24),
    picks: z.string(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake and board." };

  const picks = parsed.data.picks
    .split(",")
    .filter(Boolean)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 25);

  if (picks.length === 0) return { ok: false, error: "Reveal at least one tile." };
  if (new Set(picks).size !== picks.length) return { ok: false, error: "Tiles must be distinct." };

  return runRound(
    {
      game: "mines",
      asset: parsed.data.asset,
      stake: BigInt(parsed.data.stake),
      params: { mines: parsed.data.mines, picks },
    },
    (serverSeed, clientSeed, nonce) => {
      const board = minesBoard({ mines: parsed.data.mines }, serverSeed, clientSeed, nonce);
      const mines = new Set(board.mineTiles);

      let survived = 0;
      let hit: number | undefined;
      for (const pick of picks) {
        if (mines.has(pick)) {
          hit = pick;
          break;
        }
        survived += 1;
      }

      return {
        multiplier: hit === undefined ? minesMultiplier(parsed.data.mines, survived) : 0,
        outcome: {
          mineTiles: board.mineTiles,
          picks,
          survived,
          hit: hit ?? null,
        },
      };
    },
  );
}
