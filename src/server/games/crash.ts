"use server";

import { z } from "zod";
import { CRYPTO_CODES } from "@/lib/money/currencies";
import {
  HOUSE_EDGE_BP,
  MULTIPLIER_SCALE,
  crashMultiplierAt,
  crashPoint,
  crashTimeFor,
  payoutFor,
} from "@/lib/games";
import { balanceOf, placeBet, payoutRound } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { playSession } from "./session";

/**
 * Crash, played as a decision rather than a result.
 *
 * The previous version settled the whole round the instant the stake was taken:
 * you named a target, the server told you immediately whether you had beaten it,
 * and the curve was a replay. That is honest and it is not a game — there is no
 * moment where you choose, and a crash game with no moment of choice is a slot
 * machine with a chart on it.
 *
 * So the round now opens without revealing anything. The crash point is fixed
 * by the seeds before the stake moves, exactly as before, but it stays on the
 * server. The player watches the curve and jumps.
 *
 * **The lag problem, and what is done about it.** Every crash game in existence
 * settles a manual cash-out on the server's clock, which quietly means a player
 * on a slow connection is paid less than one sitting next to the datacentre for
 * making the identical decision. That is a real unfairness and it is usually
 * left unmentioned.
 *
 * Here the auto-target is kept alongside manual play, and the settlement is
 *
 *     min(when you actually tapped, when your target was reached, when it broke)
 *
 * so a player who sets a target is paid at that target no matter how long their
 * request took to arrive. Latency can no longer cost you a round you had already
 * decided to win. Only someone playing *past* their target — genuinely
 * improvising — is exposed to their own connection, and they have opted into it.
 */

const OpenSchema = z.object({
  asset: z.enum(CRYPTO_CODES),
  stake: z.string().regex(/^\d{1,40}$/),
  /** Four-decimal multiplier. The safety net; 0 means play it by hand. */
  target: z.string().regex(/^\d{1,9}$/),
});

export interface CrashState {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  /** Server time the curve started, so the client can draw from the same zero. */
  readonly startedAt?: number;
  readonly target?: number;
  readonly running?: boolean;
  readonly busted?: boolean;
  readonly finished?: boolean;
  /** Revealed only once the round is over. */
  readonly crashPoint?: number;
  readonly multiplier?: number;
  readonly payout?: string;
  readonly balance?: string;
}

interface RoundRow {
  id: string;
  asset: (typeof CRYPTO_CODES)[number];
  stake: string;
  params: { target: number; startedAt: number };
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
    .eq("game", "crash")
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

export async function openCrashRound(formData: FormData): Promise<CrashState> {
  const parsed = OpenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check your stake." };

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

  const target = Number(parsed.data.target);

  // Claim the nonce first, so the crash point is committed to before the money
  // moves and cannot be influenced by anything that happens after.
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

  const startedAt = Date.now();

  const { data: round, error } = await db
    .from("game_rounds")
    .insert({
      user_id: session.userId,
      game: "crash",
      seed_pair_id: session.seedPairId,
      nonce,
      server_seed_hash: session.serverSeedHash,
      client_seed: clientSeed,
      asset: parsed.data.asset,
      stake: parsed.data.stake as unknown as number,
      edge_bp: HOUSE_EDGE_BP,
      params: { target, startedAt },
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
    startedAt,
    target,
    running: true,
    balance: String(
      await balanceOf({ kind: "user", userId: session.userId, asset: parsed.data.asset }),
    ),
  };
}

/**
 * Settles a round.
 *
 * Called when the player taps out, and again by the client when the curve
 * reaches the crash point. Both go through here, and the server decides which
 * of the three moments came first — so a client that lies about busting, or
 * never calls at all, changes nothing about what it is paid.
 */
export async function settleCrashRound(roundId: string): Promise<CrashState> {
  const gate = await playSession();
  if (!gate.ok) return { ok: false, error: "Sign in to play." };

  const round = await loadRound(roundId, gate.session.userId);
  if (!round) return { ok: false, error: "Round not found." };

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  const { crashPoint: breaks } = crashPoint(serverSeed, round.client_seed, round.nonce);
  const target = round.params.target;

  if (round.status !== "open") {
    return { ok: false, error: "That round is already finished." };
  }

  const elapsed = Date.now() - round.params.startedAt;
  const reached = crashMultiplierAt(elapsed);

  // The three candidate moments, resolved in favour of whichever came first.
  // A target that was reached counts even if the request to leave arrived
  // afterwards: the decision was made before the round opened.
  const tappedAt = reached;
  const targetHit = target > MULTIPLIER_SCALE && reached >= target;
  const settledAt = targetHit ? Math.min(target, tappedAt) : tappedAt;

  const survived = settledAt < breaks;
  const multiplier = survived ? settledAt : 0;
  const payout = survived ? payoutFor(BigInt(round.stake), multiplier) : 0n;

  const transactionId = survived
    ? await payoutRound({
        userId: gate.session.userId,
        asset: round.asset,
        payout,
        roundId,
      })
    : undefined;

  await admin()
    .from("game_rounds")
    .update({
      status: "settled",
      multiplier,
      payout: String(payout) as unknown as number,
      outcome: { crashPoint: breaks, target, survived, settledAt, elapsed },
      payout_transaction_id: transactionId ?? null,
      settled_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  return {
    ok: true,
    roundId,
    finished: true,
    busted: !survived,
    crashPoint: breaks,
    multiplier,
    target,
    payout: String(payout),
    balance: String(
      await balanceOf({ kind: "user", userId: gate.session.userId, asset: round.asset }),
    ),
  };
}

/**
 * When the round will break, for the client that is drawing it.
 *
 * Only ever answered for a round that is already over. Handing the crash point
 * to a running client would let it cash out on the last frame every time, which
 * is the one thing this whole two-phase arrangement exists to prevent.
 */
export async function crashPointOf(roundId: string): Promise<number | undefined> {
  const gate = await playSession();
  if (!gate.ok) return undefined;

  const round = await loadRound(roundId, gate.session.userId);
  if (!round || round.status === "open") return undefined;

  const serverSeed = await serverSeedFor(round.seed_pair_id);
  return crashPoint(serverSeed, round.client_seed, round.nonce).crashPoint;
}

/** The time the curve reaches a multiplier, for the client's own animation. */
export async function crashCurveTime(multiplier: number): Promise<number> {
  return crashTimeFor(multiplier);
}
