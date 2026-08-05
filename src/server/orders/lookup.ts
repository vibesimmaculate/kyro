"use server";

import { redirect } from "next/navigation";
import { orderStore } from "./index";
import { isValidReference, normaliseReference } from "./reference";

export interface LookupState {
  readonly error?: string;
  /** Echoed back so a failed attempt does not clear the field. */
  readonly value?: string;
}

/**
 * Finds an order by its code.
 *
 * Deliberately gives the same answer for "no such order" and "wrong code": the
 * code is the only credential, so confirming that one exists would let someone
 * enumerate them.
 */
export async function lookupOrder(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const raw = String(formData.get("reference") ?? "");
  const reference = normaliseReference(raw);

  if (raw.trim().length === 0) {
    return { error: "Enter your order code.", value: raw };
  }

  if (!isValidReference(reference)) {
    return {
      error:
        "That is not a KYRO order code. It is eight characters after KYR — check for a mistyped letter.",
      value: raw,
    };
  }

  const order = await orderStore().byReference(reference);
  if (!order) {
    return {
      error: "No order with that code. Check it against your confirmation email.",
      value: raw,
    };
  }

  redirect(`/orders/${order.reference}`);
}
