import type { CryptoCode, NetworkId } from "@/lib/money/currencies";

/**
 * What every chain must be able to do.
 *
 * Four families sit behind this — UTXO, EVM, Tron and Solana — and they agree
 * on nothing internally: different address formats, different fee models,
 * different notions of what a transaction index even means. The interface is
 * the narrowest set of operations the product actually needs, so the
 * differences stay inside the adapters.
 */

export interface DerivedAddress {
  readonly address: string;
  readonly index: number;
  readonly path: string;
}

export interface SeenDeposit {
  readonly chain: NetworkId;
  readonly asset: CryptoCode;
  readonly address: string;
  readonly txHash: string;
  /** Output index on UTXO chains, log index on EVM and Tron, 0 on Solana. */
  readonly txIndex: number;
  /** Integer, in the asset's base units. */
  readonly amount: bigint;
  readonly blockHeight?: number;
  readonly confirmations: number;
}

export interface WithdrawalRequest {
  readonly asset: CryptoCode;
  readonly to: string;
  readonly amount: bigint;
  /** Derivation index of the sending account. Withdrawals leave the hot wallet. */
  readonly fromIndex: number;
}

export interface SignedTransfer {
  readonly raw: string;
  readonly hash: string;
  readonly fee: bigint;
}

export type AddressCheck =
  | { readonly ok: true; readonly normalised: string }
  | { readonly ok: false; readonly reason: string };

export interface ChainAdapter {
  readonly network: NetworkId;
  readonly family: "bitcoin" | "evm" | "tron" | "solana";

  /** Deterministic from the HD seed. The same index always gives the same address. */
  deriveAddress(index: number): Promise<DerivedAddress>;

  /** Format and checksum only — says nothing about whether the address is in use. */
  validateAddress(address: string): AddressCheck;

  /** Current chain tip, for confirmation counting and cursor bookkeeping. */
  getHeight(): Promise<number>;

  /** Everything paid to these addresses since `fromHeight`. */
  scanForDeposits(
    addresses: readonly string[],
    fromHeight: number,
    toHeight: number,
  ): Promise<readonly SeenDeposit[]>;

  /** How many confirmations a transaction has now, or -1 if it is unknown. */
  getConfirmations(txHash: string): Promise<number>;

  buildAndSignWithdrawal(request: WithdrawalRequest): Promise<SignedTransfer>;

  broadcast(signed: SignedTransfer): Promise<string>;

  /** Estimated cost to move this asset right now, in the asset's base units. */
  estimateNetworkFee(asset: CryptoCode): Promise<bigint>;
}
