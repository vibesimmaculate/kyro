"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORDER_STATUSES } from "@/server/orders/types";
import { orderStore } from "@/server/orders";
import { admin } from "@/server/supabase/admin";
import { approveWithdrawal, rejectWithdrawal } from "@/server/wallet/withdrawals";
import { currentUser, isStaff } from "@/server/supabase/server";

/**
 * Staff actions.
 *
 * Every one of these re-checks staff membership rather than trusting that the
 * page rendered. A server action is a public endpoint — the fact that only the
 * console links to it is not a permission.
 */

export interface OperatorState {
  readonly error?: string;
  readonly notice?: string;
}

async function requireStaff(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!(await isStaff(user.id))) throw new Error("FORBIDDEN");
  return user.id;
}

const AdvanceSchema = z.object({
  reference: z.string().min(3),
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(300).optional(),
});

export async function advanceOrder(
  _previous: OperatorState,
  formData: FormData,
): Promise<OperatorState> {
  let staffId: string;
  try {
    staffId = await requireStaff();
  } catch {
    return { error: "Not authorised." };
  }

  const parsed = AdvanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const updated = await orderStore().advance(
    parsed.data.reference,
    parsed.data.status,
    { at: Date.now(), note: parsed.data.note, actor: staffId },
  );

  if (!updated) return { error: "Order not found." };

  await admin().from("audit_log").insert({
    actor: staffId,
    action: "order.advance",
    subject: parsed.data.reference,
    detail: { status: parsed.data.status },
  });

  revalidatePath("/operator");
  revalidatePath(`/orders/${parsed.data.reference}`);
  return { notice: `Moved ${parsed.data.reference} to ${parsed.data.status}.` };
}

const WithdrawalSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(300).optional(),
});

export async function decideWithdrawal(
  _previous: OperatorState,
  formData: FormData,
): Promise<OperatorState> {
  let staffId: string;
  try {
    staffId = await requireStaff();
  } catch {
    return { error: "Not authorised." };
  }

  const parsed = WithdrawalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  if (parsed.data.decision === "approve") {
    await approveWithdrawal(parsed.data.id, staffId);
    revalidatePath("/operator");
    return { notice: "Approved. It will be signed on the next run of the payout job." };
  }

  await rejectWithdrawal(
    parsed.data.id,
    staffId,
    parsed.data.reason || "Rejected by an operator",
  );
  revalidatePath("/operator");
  return { notice: "Rejected. The funds have been returned to the customer's balance." };
}
