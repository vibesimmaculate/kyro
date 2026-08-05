import "server-only";

import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { env } from "@/server/env";

/**
 * The only module that touches the mnemonic.
 *
 * Everything that needs a key asks here and receives the narrowest thing that
 * will do the job — a public key for deriving an address, a private key only
 * where a signature is unavoidable. Keeping that surface in one file is what
 * makes the custody story reviewable: there is exactly one place to audit.
 *
 * The seed is cached in memory for the process lifetime. It is never logged,
 * never serialised, and never leaves the server.
 */

const KEY = Symbol.for("kyro.hd-seed");

interface SeedCache {
  seed: Uint8Array;
}

function seed(): Uint8Array {
  const globals = globalThis as unknown as Record<symbol, SeedCache | undefined>;
  const cached = globals[KEY];
  if (cached) return cached.seed;

  const mnemonic = env().KYRO_HD_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "KYRO_HD_MNEMONIC is not set. Run `pnpm keys:dev` for a testnet wallet, " +
        "or provide one from your secret manager.",
    );
  }
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error("KYRO_HD_MNEMONIC is not a valid BIP-39 mnemonic.");
  }

  const value = mnemonicToSeedSync(mnemonic);
  globals[KEY] = { seed: value };
  return value;
}

export function hasCustody(): boolean {
  return Boolean(env().KYRO_HD_MNEMONIC);
}

/**
 * BIP-44: m / 44' / coinType' / account' / change / index
 *
 * Account 0 is the deposit wallet — one address per user, per chain. Account 1
 * is the hot wallet that withdrawals are signed from, so the two are separable
 * in an audit and a compromise of one does not read as the other.
 */
export type Purse = "deposit" | "hot";

export function derivationPath(coinType: number, purse: Purse, index: number): string {
  const account = purse === "deposit" ? 0 : 1;
  return `m/44'/${coinType}'/${account}'/0/${index}`;
}

export function deriveKey(coinType: number, purse: Purse, index: number): HDKey {
  const root = HDKey.fromMasterSeed(seed());
  const node = root.derive(derivationPath(coinType, purse, index));
  if (!node.privateKey) {
    throw new Error("Derivation produced no private key");
  }
  return node;
}

export function derivePublicKey(coinType: number, purse: Purse, index: number): Uint8Array {
  const node = deriveKey(coinType, purse, index);
  if (!node.publicKey) throw new Error("Derivation produced no public key");
  return node.publicKey;
}

export function derivePrivateKey(coinType: number, purse: Purse, index: number): Uint8Array {
  const node = deriveKey(coinType, purse, index);
  if (!node.privateKey) throw new Error("Derivation produced no private key");
  return node.privateKey;
}

/**
 * Solana signs with ed25519 over SLIP-0010, which is a different derivation
 * scheme from secp256k1's BIP-32 — hardened at every level, and no public
 * derivation at all. Handled separately rather than bent into the same shape.
 */
export function deriveEd25519Seed(coinType: number, purse: Purse, index: number): Uint8Array {
  const account = purse === "deposit" ? 0 : 1;
  const path = [44, coinType, account, index];
  return slip10Derive(seed(), path);
}

export function ed25519Path(coinType: number, purse: Purse, index: number): string {
  const account = purse === "deposit" ? 0 : 1;
  return `m/44'/${coinType}'/${account}'/${index}'`;
}

const ED25519_CURVE = new TextEncoder().encode("ed25519 seed");
const HARDENED = 0x80000000;

function slip10Derive(masterSeed: Uint8Array, path: readonly number[]): Uint8Array {
  // Implemented here rather than pulled in: it is twenty lines of HMAC, and
  // getting it wrong is loud rather than subtle — the addresses simply differ
  // from every other wallet, which the derivation tests catch immediately.
  let intermediate = hmac(sha512, ED25519_CURVE, masterSeed);
  let key = intermediate.slice(0, 32);
  let chainCode = intermediate.slice(32);

  for (const segment of path) {
    const index = segment | HARDENED;
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index >>> 0, false);

    intermediate = hmac(sha512, chainCode, data);
    key = intermediate.slice(0, 32);
    chainCode = intermediate.slice(32);
  }

  return key;
}
