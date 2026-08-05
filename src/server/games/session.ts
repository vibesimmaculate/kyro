import "server-only";

import type { CryptoCode } from "@/lib/money/currencies";
import {
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
} from "@/lib/fair";
import { balancesFor } from "@/server/ledger";
import { admin } from "@/server/supabase/admin";
import { currentUser } from "@/server/supabase/server";

/**
 * Everything a games page needs to know about who is playing.
 *
 * One function, called at the top of every games route, that answers: are they
 * signed in, are they old enough, are they excluded, and what can they stake.
 * Keeping it in one place is what stops a new game page quietly skipping a
 * check.
 */

export type GateReason =
  | "signed-out"
  | "age-unconfirmed"
  | "self-excluded"
  | "no-database";

export interface PlaySession {
  readonly userId: string;
  readonly email?: string;
  readonly balances: Map<CryptoCode, bigint>;
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly seedPairId: string;
}

export type SessionResult =
  | { readonly ok: true; readonly session: PlaySession }
  | { readonly ok: false; readonly reason: GateReason; readonly until?: string };

export async function playSession(): Promise<SessionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const db = admin();

  const { data: profile } = await db
    .from("profiles")
    .select("age_confirmed_at,self_excluded_until")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.age_confirmed_at) {
    return { ok: false, reason: "age-unconfirmed" };
  }

  if (profile.self_excluded_until && new Date(profile.self_excluded_until) > new Date()) {
    return { ok: false, reason: "self-excluded", until: profile.self_excluded_until };
  }

  const seeds = await activeSeedPair(user.id);
  const balances = await balancesFor(user.id);

  return {
    ok: true,
    session: {
      userId: user.id,
      email: user.email,
      balances,
      serverSeedHash: seeds.serverSeedHash,
      clientSeed: seeds.clientSeed,
      nonce: seeds.nonce,
      seedPairId: seeds.id,
    },
  };
}

export interface ActiveSeeds {
  readonly id: string;
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
}

/**
 * The player's live seed pair, created on first use.
 *
 * The server seed itself is never returned from here — only its hash. It is
 * read exactly once, inside `settleRound`, and revealed only when the pair is
 * retired.
 */
export async function activeSeedPair(userId: string): Promise<ActiveSeeds> {
  const db = admin();

  const { data: existing } = await db
    .from("seed_pairs")
    .select("id,server_seed_hash,client_seed,nonce")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      serverSeedHash: existing.server_seed_hash,
      clientSeed: existing.client_seed,
      nonce: existing.nonce,
    };
  }

  const serverSeed = generateServerSeed();
  const { data: created, error } = await db
    .from("seed_pairs")
    .insert({
      user_id: userId,
      server_seed: serverSeed,
      server_seed_hash: hashServerSeed(serverSeed),
      client_seed: generateClientSeed(),
      nonce: 0,
      is_active: true,
    })
    .select("id,server_seed_hash,client_seed,nonce")
    .single();

  if (error || !created) {
    throw new Error(`Could not open a seed pair: ${error?.message ?? "unknown"}`);
  }

  return {
    id: created.id,
    serverSeedHash: created.server_seed_hash,
    clientSeed: created.client_seed,
    nonce: created.nonce,
  };
}

/**
 * Retires the current pair and opens a new one.
 *
 * Retiring reveals the old server seed, which is the moment every round played
 * against it becomes checkable by anyone. A player can do this whenever they
 * like — that is the point.
 */
export async function rotateSeeds(userId: string, clientSeed?: string): Promise<ActiveSeeds> {
  const db = admin();

  await db
    .from("seed_pairs")
    .update({ is_active: false, revealed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_active", true);

  const serverSeed = generateServerSeed();
  const { data, error } = await db
    .from("seed_pairs")
    .insert({
      user_id: userId,
      server_seed: serverSeed,
      server_seed_hash: hashServerSeed(serverSeed),
      client_seed: clientSeed?.trim() || generateClientSeed(),
      nonce: 0,
      is_active: true,
    })
    .select("id,server_seed_hash,client_seed,nonce")
    .single();

  if (error || !data) throw new Error(`Could not rotate seeds: ${error?.message ?? "unknown"}`);

  return {
    id: data.id,
    serverSeedHash: data.server_seed_hash,
    clientSeed: data.client_seed,
    nonce: data.nonce,
  };
}
