import "server-only";

import type { CryptoCode, NetworkId } from "@/lib/money/currencies";
import { env, networkMode, type NetworkMode } from "@/server/env";

/**
 * Where each chain lives, in each mode.
 *
 * Testnet endpoints are public and keyless so a fresh clone works immediately.
 * They are rate-limited and unsuitable for production load — mainnet entries
 * expect your own provider URL through the environment.
 *
 * ⚠ Token contract addresses below are the issuers' published values. Verify
 * them against the issuer's own documentation before pointing this at mainnet
 * with real money: crediting a deposit from the wrong contract means crediting
 * a worthless token.
 */

export type ChainFamily = "bitcoin" | "evm" | "tron" | "solana";

export interface EvmChainConfig {
  readonly family: "evm";
  readonly network: NetworkId;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerTx: string;
  /** BIP-44 coin type. All EVM chains share 60. */
  readonly coinType: 60;
  readonly nativeAsset: CryptoCode;
  readonly tokens: Partial<Record<CryptoCode, `0x${string}`>>;
}

export interface BitcoinChainConfig {
  readonly family: "bitcoin";
  readonly network: NetworkId;
  readonly esploraUrl: string;
  readonly explorerTx: string;
  readonly coinType: 0 | 1;
  readonly bech32Prefix: "bc" | "tb";
  readonly pubKeyHash: number;
  readonly scriptHash: number;
  readonly wif: number;
  readonly bip32: { readonly public: number; readonly private: number };
}

export interface TronChainConfig {
  readonly family: "tron";
  readonly network: NetworkId;
  readonly apiUrl: string;
  readonly apiKey?: string;
  readonly explorerTx: string;
  readonly coinType: 195;
  readonly tokens: Partial<Record<CryptoCode, string>>;
}

export interface SolanaChainConfig {
  readonly family: "solana";
  readonly network: NetworkId;
  readonly rpcUrl: string;
  readonly explorerTx: string;
  readonly coinType: 501;
  readonly tokens: Partial<Record<CryptoCode, string>>;
}

export type ChainConfig =
  | EvmChainConfig
  | BitcoinChainConfig
  | TronChainConfig
  | SolanaChainConfig;

function evm(
  network: NetworkId,
  mode: NetworkMode,
  main: { chainId: number; rpc: string; explorer: string; tokens: Partial<Record<CryptoCode, `0x${string}`>> },
  test: { chainId: number; rpc: string; explorer: string; tokens: Partial<Record<CryptoCode, `0x${string}`>> },
  override?: string,
): EvmChainConfig {
  const chosen = mode === "mainnet" ? main : test;
  return {
    family: "evm",
    network,
    chainId: chosen.chainId,
    rpcUrl: override ?? chosen.rpc,
    explorerTx: chosen.explorer,
    coinType: 60,
    nativeAsset: "ETH",
    tokens: chosen.tokens,
  };
}

export function chainConfig(network: NetworkId): ChainConfig {
  const mode = networkMode();
  const e = env();

  switch (network) {
    case "ethereum":
      return evm(
        "ethereum",
        mode,
        {
          chainId: 1,
          rpc: "https://ethereum-rpc.publicnode.com",
          explorer: "https://etherscan.io/tx/",
          tokens: {
            USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          },
        },
        {
          chainId: 11155111,
          rpc: "https://ethereum-sepolia-rpc.publicnode.com",
          explorer: "https://sepolia.etherscan.io/tx/",
          tokens: {
            // Circle's published Sepolia USDC. No canonical testnet USDT exists,
            // so USDT deposits are disabled on Sepolia rather than guessed at.
            USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          },
        },
        e.EVM_ETHEREUM_RPC_URL,
      );

    case "base":
      return evm(
        "base",
        mode,
        {
          chainId: 8453,
          rpc: "https://base-rpc.publicnode.com",
          explorer: "https://basescan.org/tx/",
          tokens: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
        },
        {
          chainId: 84532,
          rpc: "https://base-sepolia-rpc.publicnode.com",
          explorer: "https://sepolia.basescan.org/tx/",
          tokens: { USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
        },
        e.EVM_BASE_RPC_URL,
      );

    case "arbitrum":
      return evm(
        "arbitrum",
        mode,
        {
          chainId: 42161,
          rpc: "https://arbitrum-one-rpc.publicnode.com",
          explorer: "https://arbiscan.io/tx/",
          tokens: {
            USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          },
        },
        {
          chainId: 421614,
          rpc: "https://arbitrum-sepolia-rpc.publicnode.com",
          explorer: "https://sepolia.arbiscan.io/tx/",
          tokens: { USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
        },
        e.EVM_ARBITRUM_RPC_URL,
      );

    case "bitcoin":
      return mode === "mainnet"
        ? {
            family: "bitcoin",
            network: "bitcoin",
            esploraUrl: e.BITCOIN_ESPLORA_URL ?? "https://blockstream.info/api",
            explorerTx: "https://mempool.space/tx/",
            coinType: 0,
            bech32Prefix: "bc",
            pubKeyHash: 0x00,
            scriptHash: 0x05,
            wif: 0x80,
            bip32: { public: 0x0488b21e, private: 0x0488ade4 },
          }
        : {
            family: "bitcoin",
            network: "bitcoin",
            esploraUrl: e.BITCOIN_ESPLORA_URL ?? "https://blockstream.info/testnet/api",
            explorerTx: "https://mempool.space/testnet/tx/",
            coinType: 1,
            bech32Prefix: "tb",
            pubKeyHash: 0x6f,
            scriptHash: 0xc4,
            wif: 0xef,
            bip32: { public: 0x043587cf, private: 0x04358394 },
          };

    case "tron":
      return mode === "mainnet"
        ? {
            family: "tron",
            network: "tron",
            apiUrl: e.TRON_API_URL ?? "https://api.trongrid.io",
            apiKey: e.TRON_API_KEY,
            explorerTx: "https://tronscan.org/#/transaction/",
            coinType: 195,
            tokens: { USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
          }
        : {
            family: "tron",
            network: "tron",
            apiUrl: e.TRON_API_URL ?? "https://nile.trongrid.io",
            apiKey: e.TRON_API_KEY,
            explorerTx: "https://nile.tronscan.org/#/transaction/",
            coinType: 195,
            // Nile's faucet USDT. Verify before relying on it.
            tokens: { USDT: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" },
          };

    case "solana":
      return mode === "mainnet"
        ? {
            family: "solana",
            network: "solana",
            rpcUrl: e.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
            explorerTx: "https://solscan.io/tx/",
            coinType: 501,
            tokens: { USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
          }
        : {
            family: "solana",
            network: "solana",
            rpcUrl: e.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
            explorerTx: "https://solscan.io/tx/?cluster=devnet",
            coinType: 501,
            tokens: { USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" },
          };

    default: {
      const exhaustive: never = network;
      throw new Error(`No chain configuration for ${String(exhaustive)}`);
    }
  }
}

/** The contract address for a token on a network, if KYRO handles it there. */
export function tokenAddress(network: NetworkId, asset: CryptoCode): string | undefined {
  const config = chainConfig(network);
  if (config.family === "bitcoin") return undefined;
  return config.tokens[asset];
}

export function explorerTxUrl(network: NetworkId, hash: string): string {
  const config = chainConfig(network);
  return config.family === "solana" && config.explorerTx.includes("?")
    ? config.explorerTx.replace("/tx/?", `/tx/${hash}?`)
    : `${config.explorerTx}${hash}`;
}

/**
 * Whether an asset can actually be moved on a network in the current mode.
 * Sepolia has no canonical USDT, so the pairing is honestly unavailable there
 * rather than silently broken.
 */
export function isAssetAvailable(network: NetworkId, asset: CryptoCode): boolean {
  const config = chainConfig(network);
  if (config.family === "bitcoin") return asset === "BTC";
  if (config.family === "evm") return asset === "ETH" || Boolean(config.tokens[asset]);
  if (config.family === "solana") return asset === "SOL" || Boolean(config.tokens[asset]);
  return Boolean(config.tokens[asset]);
}
