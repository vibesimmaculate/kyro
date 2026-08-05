/**
 * Sample network fees, quoted in the asset being moved.
 *
 * A withdrawal's gas is paid in the chain's native coin, but deducting it from
 * the asset the customer actually receives is the only way to show a single
 * honest figure on the ticket. Every exchange does this; KYRO shows it as its
 * own line rather than folding it into the rate.
 *
 * These are SAMPLE values, labelled as such wherever they appear. A live fee
 * oracle implements `NetworkFeeProvider` and replaces the export below.
 */

import {
  CRYPTO,
  type CryptoCode,
  type NetworkId,
} from "@/lib/money/currencies";
import { crypto as cryptoAmount, parseCrypto, type CryptoAmount } from "@/lib/money/amounts";

type FeeTable = Partial<Record<CryptoCode, Partial<Record<NetworkId, string>>>>;

const SAMPLE_FEES: FeeTable = {
  BTC: { bitcoin: "0.00002" },
  ETH: { ethereum: "0.00035", base: "0.000002", arbitrum: "0.000003" },
  USDT: { tron: "1.20", ethereum: "4.50", arbitrum: "0.30" },
  USDC: { base: "0.10", ethereum: "4.50", arbitrum: "0.30", solana: "0.05" },
  SOL: { solana: "0.0002" },
};

export interface NetworkFeeProvider {
  readonly id: string;
  readonly isLive: boolean;
  readonly label: string;
  getFee(asset: CryptoCode, network: NetworkId): CryptoAmount;
}

function sampleFee(asset: CryptoCode, network: NetworkId): CryptoAmount {
  const value = SAMPLE_FEES[asset]?.[network];
  if (value === undefined) {
    // An unsupported pairing is a programming error, not a runtime condition:
    // the selectors only ever offer networks the asset declares.
    throw new Error(`No network fee configured for ${asset} on ${network}`);
  }
  return parseCrypto(value, asset);
}

export const sampleNetworkFeeProvider: NetworkFeeProvider = {
  id: "sample",
  isLive: false,
  label: "Sample network fee",
  getFee: sampleFee,
};

/** Zero, in the right asset — used where no transfer is involved. */
export function noFee(asset: CryptoCode): CryptoAmount {
  return cryptoAmount(0n, asset);
}

/** Confirmations KYRO waits for before treating a deposit as final. */
export const REQUIRED_CONFIRMATIONS: Record<NetworkId, number> = {
  bitcoin: 2,
  ethereum: 12,
  base: 20,
  arbitrum: 20,
  tron: 19,
  solana: 32,
};

/** Roughly how long that wait takes, for the "how long" copy on the ticket. */
export const TYPICAL_CONFIRMATION_MINUTES: Record<NetworkId, number> = {
  bitcoin: 20,
  ethereum: 3,
  base: 1,
  arbitrum: 1,
  tron: 1,
  solana: 1,
};

export function cheapestNetworkFor(asset: CryptoCode): NetworkId {
  const networks = CRYPTO[asset].networks;
  let best: NetworkId | undefined;
  let bestBase: bigint | undefined;
  for (const network of networks) {
    const fee = sampleFee(asset, network);
    if (bestBase === undefined || fee.base < bestBase) {
      bestBase = fee.base;
      best = network;
    }
  }
  if (!best) throw new Error(`Asset ${asset} has no networks configured`);
  return best;
}
