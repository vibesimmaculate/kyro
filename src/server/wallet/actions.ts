"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CRYPTO, CRYPTO_CODES, NETWORK_IDS } from "@/lib/money/currencies";
import { parseCrypto } from "@/lib/money/amounts";
import { hasCustodyKeys } from "@/server/env";
import { requireUser } from "@/server/supabase/server";
import { ensureDepositAddress } from "./watcher";
import { requestWithdrawal } from "./withdrawals";

export interface WalletActionState {
  readonly error?: string;
  readonly notice?: string;
}

const AddressRequest = z.object({
  chain: z.enum(NETWORK_IDS),
});

export async function issueDepositAddress(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const parsed = AddressRequest.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a network." };

  if (!hasCustodyKeys()) {
    return {
      error:
        "Custody keys are not configured on this install, so an address cannot be derived. Run `pnpm keys:dev`.",
    };
  }

  const user = await requireUser();

  try {
    await ensureDepositAddress({ userId: user.id, chain: parsed.data.chain });
    revalidatePath("/games/wallet");
    return { notice: "Address ready." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not issue an address.",
    };
  }
}

const WithdrawalRequest = z.object({
  asset: z.enum(CRYPTO_CODES),
  network: z.enum(NETWORK_IDS),
  address: z.string().trim().min(1, "Enter the address to send to."),
  amount: z.string().trim().min(1, "Enter an amount."),
});

export async function submitWithdrawal(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const parsed = WithdrawalRequest.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  if (!hasCustodyKeys()) {
    return { error: "Withdrawals are unavailable — custody keys are not configured." };
  }

  const user = await requireUser();

  let amount: bigint;
  try {
    amount = parseCrypto(parsed.data.amount.replace(",", "."), parsed.data.asset).base;
  } catch {
    return { error: "Enter a plain number, for example 25 or 25.50." };
  }

  if (!CRYPTO[parsed.data.asset].networks.includes(parsed.data.network)) {
    return { error: `${parsed.data.asset} does not move on that network.` };
  }

  const result = await requestWithdrawal({
    userId: user.id,
    asset: parsed.data.asset,
    network: parsed.data.network,
    address: parsed.data.address,
    amount,
  });

  if (!result.ok) return { error: result.refusal.message };

  revalidatePath("/games/wallet");
  return {
    notice: result.needsApproval
      ? "Requested. Withdrawals of this size are checked by a person before they are sent — usually within a few hours. The funds are already reserved."
      : "Requested. It will be signed and broadcast on the next run of the payout job.",
  };
}
