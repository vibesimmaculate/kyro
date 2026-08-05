/**
 * The currencies and assets KYRO handles at the counter.
 *
 * Fiat `decimals` here is the smallest unit a cashier can physically hand
 * over, not the ISO-4217 accounting default. Para, deni and qindarka are not in
 * circulation, so quoting RSD to two places would promise change that does not
 * exist. EUR and BAM keep two places because cents and fenings do.
 */

export const FIAT_CODES = ["EUR", "BAM", "RSD", "MKD", "ALL"] as const;
export type FiatCode = (typeof FIAT_CODES)[number];

export interface FiatCurrency {
  readonly code: FiatCode;
  readonly name: string;
  readonly symbol: string;
  /** Decimal places used for storage, display and cash settlement. */
  readonly decimals: number;
  /** Where this currency is legal tender, for the location picker. */
  readonly countries: readonly string[];
  /** Sensible default order amount, used to seed the calculator. */
  readonly defaultAmount: string;
  /** Counter limits. Below the minimum a fee is not worth the paperwork. */
  readonly minAmount: string;
  readonly maxAmount: string;
}

export const FIAT: Record<FiatCode, FiatCurrency> = {
  EUR: {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimals: 2,
    countries: ["HR", "ME", "XK", "SI"],
    defaultAmount: "1000",
    minAmount: "20",
    maxAmount: "15000",
  },
  BAM: {
    code: "BAM",
    name: "Convertible mark",
    symbol: "KM",
    decimals: 2,
    countries: ["BA"],
    defaultAmount: "2000",
    minAmount: "40",
    maxAmount: "29000",
  },
  RSD: {
    code: "RSD",
    name: "Serbian dinar",
    symbol: "дин",
    decimals: 0,
    countries: ["RS"],
    defaultAmount: "100000",
    minAmount: "2000",
    maxAmount: "1700000",
  },
  MKD: {
    code: "MKD",
    name: "Macedonian denar",
    symbol: "ден",
    decimals: 0,
    countries: ["MK"],
    defaultAmount: "50000",
    minAmount: "1200",
    maxAmount: "900000",
  },
  ALL: {
    code: "ALL",
    name: "Albanian lek",
    symbol: "L",
    decimals: 0,
    countries: ["AL"],
    defaultAmount: "100000",
    minAmount: "2000",
    maxAmount: "1500000",
  },
};

export const CRYPTO_CODES = ["BTC", "ETH", "USDT", "USDC", "SOL"] as const;
export type CryptoCode = (typeof CRYPTO_CODES)[number];

export const NETWORK_IDS = [
  "bitcoin",
  "ethereum",
  "base",
  "arbitrum",
  "tron",
  "solana",
] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export interface Network {
  readonly id: NetworkId;
  readonly name: string;
  /** Shown next to the network so people pick the cheap one knowingly. */
  readonly note: string;
  readonly family: "bitcoin" | "evm" | "tron" | "solana";
}

export const NETWORKS: Record<NetworkId, Network> = {
  bitcoin: { id: "bitcoin", name: "Bitcoin", note: "Slowest, highest fee", family: "bitcoin" },
  ethereum: { id: "ethereum", name: "Ethereum", note: "Widely supported, higher fee", family: "evm" },
  base: { id: "base", name: "Base", note: "Low fee", family: "evm" },
  arbitrum: { id: "arbitrum", name: "Arbitrum One", note: "Low fee", family: "evm" },
  tron: { id: "tron", name: "Tron", note: "Low fee, common for USDT", family: "tron" },
  solana: { id: "solana", name: "Solana", note: "Fast, very low fee", family: "solana" },
};

export interface CryptoAsset {
  readonly code: CryptoCode;
  readonly name: string;
  /** Base units per whole coin, as the chain defines them. */
  readonly decimals: number;
  /**
   * Decimal places KYRO quotes and pays out at.
   *
   * Payouts are floored to this precision, which means the number printed on
   * the ticket is exactly the number that lands in the wallet. Quoting ETH to
   * all eighteen places would be honest but unreadable; quoting to six and
   * paying eighteen would be readable but a lie.
   */
  readonly quotePrecision: number;
  readonly networks: readonly NetworkId[];
  readonly kind: "coin" | "stablecoin";
}

export const CRYPTO: Record<CryptoCode, CryptoAsset> = {
  BTC: {
    code: "BTC",
    name: "Bitcoin",
    decimals: 8,
    quotePrecision: 8,
    networks: ["bitcoin"],
    kind: "coin",
  },
  ETH: {
    code: "ETH",
    name: "Ethereum",
    decimals: 18,
    quotePrecision: 6,
    networks: ["ethereum", "base", "arbitrum"],
    kind: "coin",
  },
  USDT: {
    code: "USDT",
    name: "Tether",
    decimals: 6,
    quotePrecision: 2,
    networks: ["tron", "ethereum", "arbitrum"],
    kind: "stablecoin",
  },
  USDC: {
    code: "USDC",
    name: "USD Coin",
    decimals: 6,
    quotePrecision: 2,
    networks: ["base", "ethereum", "arbitrum", "solana"],
    kind: "stablecoin",
  },
  SOL: {
    code: "SOL",
    name: "Solana",
    decimals: 9,
    quotePrecision: 4,
    networks: ["solana"],
    kind: "coin",
  },
};

export const isFiatCode = (v: unknown): v is FiatCode =>
  typeof v === "string" && (FIAT_CODES as readonly string[]).includes(v);

export const isCryptoCode = (v: unknown): v is CryptoCode =>
  typeof v === "string" && (CRYPTO_CODES as readonly string[]).includes(v);

export const isNetworkId = (v: unknown): v is NetworkId =>
  typeof v === "string" && (NETWORK_IDS as readonly string[]).includes(v);

/** The network KYRO steers people to: cheapest that the asset supports. */
export function defaultNetworkFor(asset: CryptoCode): NetworkId {
  const first = CRYPTO[asset].networks[0];
  if (!first) throw new Error(`Asset ${asset} has no networks configured`);
  return first;
}

export function networksFor(asset: CryptoCode): readonly Network[] {
  return CRYPTO[asset].networks.map((id) => NETWORKS[id]);
}

export function supportsNetwork(asset: CryptoCode, network: NetworkId): boolean {
  return CRYPTO[asset].networks.includes(network);
}
