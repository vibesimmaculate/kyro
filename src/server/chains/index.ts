import "server-only";

import type { NetworkId } from "@/lib/money/currencies";
import { createBitcoinAdapter } from "./bitcoin";
import { createEvmAdapter } from "./evm";
import { createSolanaAdapter } from "./solana";
import { createTronAdapter } from "./tron";
import type { AddressCheck, ChainAdapter } from "./types";

/**
 * The chain registry.
 *
 * Adapters are built lazily and cached: constructing one reads configuration
 * and, for the address paths, touches the HD seed — neither of which should
 * happen at import time on a page that will never send a transaction.
 */

const cache = new Map<NetworkId, ChainAdapter>();

export function adapterFor(network: NetworkId): ChainAdapter {
  const cached = cache.get(network);
  if (cached) return cached;

  const adapter =
    network === "bitcoin"
      ? createBitcoinAdapter()
      : network === "tron"
        ? createTronAdapter()
        : network === "solana"
          ? createSolanaAdapter()
          : createEvmAdapter(network);

  cache.set(network, adapter);
  return adapter;
}

/**
 * Checks an address without touching the network or the seed.
 *
 * Called on every keystroke's worth of validation in the exchange flow, so it
 * must stay cheap — and it must never be the reason a page needs custody keys
 * configured.
 */
export function validateAddress(network: NetworkId, address: string): AddressCheck {
  try {
    return adapterFor(network).validateAddress(address);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.message.includes("MNEMONIC")
          ? "Address checking is unavailable — custody keys are not configured."
          : "That address could not be checked.",
    };
  }
}

export { chainConfig, explorerTxUrl, isAssetAvailable, tokenAddress } from "./config";
export type {
  AddressCheck,
  ChainAdapter,
  DerivedAddress,
  SeenDeposit,
  SignedTransfer,
  WithdrawalRequest,
} from "./types";
