import type { CryptoCode, FiatCode, NetworkId } from "@/lib/money/currencies";
import type { Direction } from "@/lib/quote/types";

/**
 * An order, as stored.
 *
 * Every monetary field is an integer in its smallest unit, held as a decimal
 * string. Strings because a bigint cannot cross a JSON boundary and a JS number
 * cannot hold a wei value without lying about it.
 */

export const ORDER_STATUSES = [
  "created",
  "identity-confirmed",
  "awaiting-funds",
  "funds-received",
  "settlement-sent",
  "complete",
  "cancelled",
  "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Terminal states never advance again. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "complete",
  "cancelled",
  "expired",
];

export interface OrderEvent {
  readonly status: OrderStatus;
  readonly at: number;
  /** Shown to the customer verbatim, so it is written for them. */
  readonly note?: string;
  /** Which staff member moved it, for the audit trail. Never shown publicly. */
  readonly actor?: string;
}

export interface Order {
  readonly reference: string;
  readonly direction: Direction;
  readonly fiat: FiatCode;
  readonly asset: CryptoCode;
  readonly network: NetworkId;

  /** Integer, smallest unit of whichever side the customer hands over. */
  readonly giveUnits: string;
  readonly grossMinor: string;
  readonly serviceFeeMinor: string;
  readonly serviceFeeBp: number;
  readonly networkFeeBase: string;
  readonly receiveUnits: string;
  /** Rate at twelve decimal places, as an integer string. */
  readonly rateUnits: string;

  readonly locationSlug: string;
  /** Cash → crypto: where KYRO sends. Set by the customer. */
  readonly walletAddress?: string;
  /** Crypto → cash: where the customer sends. Issued by KYRO. */
  readonly depositAddress?: string;
  readonly email?: string;

  readonly status: OrderStatus;
  readonly createdAt: number;
  /** After this the rate is no longer held and the counter re-quotes. */
  readonly expiresAt: number;
  readonly events: readonly OrderEvent[];

  /** Set once a settlement transfer exists on chain. */
  readonly txHash?: string;
  /** Set once the customer's incoming transfer is seen. */
  readonly depositTxHash?: string;
}

export interface CreateOrderInput {
  readonly direction: Direction;
  readonly fiat: FiatCode;
  readonly asset: CryptoCode;
  readonly network: NetworkId;
  readonly amount: string;
  readonly locationSlug: string;
  readonly walletAddress?: string;
  readonly email?: string;
}

/** How long an order holds its rate after it is created. */
export const ORDER_HOLD_MS = 45 * 60 * 1000;

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The order of play. Used to decide whether a stage is done, current or still
 * ahead — and to stop an operator moving an order backwards by accident.
 */
export const STATUS_SEQUENCE: readonly OrderStatus[] = [
  "created",
  "identity-confirmed",
  "awaiting-funds",
  "funds-received",
  "settlement-sent",
  "complete",
];

export function statusRank(status: OrderStatus): number {
  const index = STATUS_SEQUENCE.indexOf(status);
  return index === -1 ? -1 : index;
}
