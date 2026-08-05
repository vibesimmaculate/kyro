/**
 * Provably fair.
 *
 * The promise: KYRO cannot decide what you rolled after seeing your bet, and
 * you can prove it afterwards without trusting anything we say.
 *
 * How it works:
 *
 *   1. KYRO generates a server seed and publishes sha256(serverSeed) — the
 *      commitment. It cannot change the seed afterwards without the hash
 *      changing, and it cannot derive the seed from the hash.
 *   2. You choose a client seed. You can change it whenever you like.
 *   3. Each round uses an incrementing nonce, so the same pair of seeds never
 *      produces the same outcome twice.
 *   4. Outcome = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), read as a
 *      stream of bytes.
 *   5. When the pair is retired, the server seed is revealed. Anyone can then
 *      recompute every round played against it and check the hash matches.
 *
 * This module is isomorphic on purpose: the same code verifies a round in the
 * browser on /games/fairness as produced it on the server. If the two ever
 * disagreed, the disagreement would be visible.
 */

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export interface SeedPair {
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
}

export function generateServerSeed(): string {
  return bytesToHex(randomBytes(32));
}

export function generateClientSeed(): string {
  return bytesToHex(randomBytes(8));
}

export function hashServerSeed(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)));
}

/** The raw HMAC for a round. Everything else is derived from these bytes. */
export function roundBytes(serverSeed: string, clientSeed: string, nonce: number): Uint8Array {
  return hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(`${clientSeed}:${nonce}`));
}

/**
 * A float in [0, 1) from four bytes at the given offset.
 *
 * Four bytes give 2^32 outcomes, which is ample: the finest granularity any
 * game here needs is one part in 10 000. `cursor` lets one round produce
 * several independent numbers — Mines needs one per tile revealed, Plinko one
 * per row.
 */
export function floatAt(bytes: Uint8Array, cursor = 0): number {
  const offset = (cursor * 4) % (bytes.length - 4);
  let result = 0;
  for (let i = 0; i < 4; i += 1) {
    result = result * 256 + (bytes[offset + i] ?? 0);
  }
  return result / 0x1_0000_0000;
}

/**
 * Extends one round's bytes into as many floats as a game needs, by re-hashing
 * with an increasing counter rather than reusing exhausted bytes.
 */
export function floatStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): number[] {
  const values: number[] = [];
  let round = 0;

  while (values.length < count) {
    const bytes = hmac(
      sha256,
      utf8ToBytes(serverSeed),
      utf8ToBytes(`${clientSeed}:${nonce}:${round}`),
    );
    for (let cursor = 0; cursor < 7 && values.length < count; cursor += 1) {
      values.push(floatAt(bytes, cursor));
    }
    round += 1;
  }

  return values;
}

/** An integer in [0, max), without the modulo bias of a naive remainder. */
export function intBelow(value: number, max: number): number {
  return Math.min(max - 1, Math.floor(value * max));
}

/**
 * A deterministic shuffle driven by the round's own floats.
 *
 * Used by Mines to place bombs. Fisher–Yates, so every arrangement is equally
 * likely and the whole board is reproducible from the seeds alone.
 */
export function seededShuffle<T>(items: readonly T[], floats: readonly number[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = intBelow(floats[result.length - 1 - i] ?? 0, i + 1);
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Confirms a revealed seed matches the hash published before play. */
export function verifyCommitment(serverSeed: string, publishedHash: string): boolean {
  return hashServerSeed(serverSeed).toLowerCase() === publishedHash.trim().toLowerCase();
}
