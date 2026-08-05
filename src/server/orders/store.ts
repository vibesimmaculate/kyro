import "server-only";

import type { Order, OrderEvent, OrderStatus } from "./types";

/**
 * The seam between the product and wherever orders actually live.
 *
 * Two implementations ship: Supabase (used the moment credentials exist) and an
 * in-process map (used otherwise, so the whole site is demonstrable without a
 * database). Nothing above this interface knows or cares which is running.
 */
export interface OrderStore {
  readonly id: string;
  /** False for the in-process store, which forgets everything on restart. */
  readonly isDurable: boolean;

  create(order: Order): Promise<Order>;
  byReference(reference: string): Promise<Order | undefined>;
  /** Appends an event and moves the order to that status, atomically. */
  advance(
    reference: string,
    status: OrderStatus,
    event: Omit<OrderEvent, "status">,
    patch?: Partial<Order>,
  ): Promise<Order | undefined>;
  patch(reference: string, patch: Partial<Order>): Promise<Order | undefined>;
  /** Newest first. Used by the operator console. */
  list(options?: { readonly status?: OrderStatus; readonly limit?: number }): Promise<readonly Order[]>;
}
