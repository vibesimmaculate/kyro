import type {
  CryptoCode,
  FiatCode,
  NetworkId,
} from "@/lib/money/currencies";
import type { CryptoAmount, Money, Rate } from "@/lib/money/amounts";

export const DIRECTIONS = ["cash-to-crypto", "crypto-to-cash"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const isDirection = (v: unknown): v is Direction =>
  typeof v === "string" && (DIRECTIONS as readonly string[]).includes(v);

/** The one fee. Four percent, held as basis points so it cannot drift. */
export const SERVICE_FEE_BP = 400;

export interface QuoteRequest {
  readonly direction: Direction;
  /** Plain decimal string of what the customer hands over. */
  readonly give: string;
  readonly fiat: FiatCode;
  readonly asset: CryptoCode;
  readonly network: NetworkId;
  /** Timestamp the quote is anchored to. Deterministic in tests. */
  readonly at: number;
}

export type QuoteIssueCode =
  | "amount-missing"
  | "amount-invalid"
  | "amount-too-small"
  | "amount-too-large"
  | "network-unsupported"
  | "fee-exceeds-amount";

export interface QuoteIssue {
  readonly code: QuoteIssueCode;
  /** Which control to attach the message to. */
  readonly field: "give" | "network" | "fiat" | "asset";
  /** Written for the person at the counter, not for a log file. */
  readonly message: string;
}

export interface Quote {
  readonly direction: Direction;
  readonly fiat: FiatCode;
  readonly asset: CryptoCode;
  readonly network: NetworkId;

  readonly rate: Rate;
  /** Where the rate came from, and whether it is live. Always surfaced. */
  readonly rateLabel: string;
  readonly rateIsLive: boolean;

  /** What the customer hands over. */
  readonly give: Money | CryptoAmount;
  /** Value of `give` before any deduction, in fiat. Anchors the receipt. */
  readonly gross: Money;

  readonly serviceFeeBp: number;
  /** Always in fiat: the fee is charged on the cash side of the trade. */
  readonly serviceFee: Money;

  readonly networkFee: CryptoAmount;
  /**
   * False on crypto → cash, where the sending wallet pays its own gas and KYRO
   * deducts nothing. The line still appears, so nobody is surprised by the
   * difference between what they send and what leaves their wallet.
   */
  readonly networkFeeDeducted: boolean;

  /** What the customer walks away with. */
  readonly receive: Money | CryptoAmount;

  readonly createdAt: number;
  readonly expiresAt: number;
}

export type QuoteResult =
  | { readonly ok: true; readonly quote: Quote }
  | { readonly ok: false; readonly issues: readonly QuoteIssue[] };
