"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/server/supabase/admin";
import { requireUser } from "@/server/supabase/server";
import { rotateSeeds } from "./session";

export interface SeedActionState {
  readonly error?: string;
  readonly notice?: string;
}

/**
 * Rotating a seed pair reveals the old server seed. That is the moment every
 * round played against it becomes checkable by anyone, so it is offered
 * unconditionally and with no cooling-off.
 */
export async function rotateSeedPair(
  _previous: SeedActionState,
  formData: FormData,
): Promise<SeedActionState> {
  const parsed = z
    .object({ clientSeed: z.string().trim().max(64).optional() })
    .safeParse(Object.fromEntries(formData));

  const user = await requireUser();
  await rotateSeeds(user.id, parsed.success ? parsed.data.clientSeed : undefined);

  revalidatePath("/games/fairness");
  return {
    notice:
      "Rotated. Your previous server seed is now revealed below — recompute any round you played against it.",
  };
}

/* ── Responsible play ──────────────────────────────────────────────────── */

const ExcludeSchema = z.object({
  period: z.enum(["24h", "7d", "30d", "6m", "permanent"]),
});

const PERIODS: Record<string, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "6m": 182 * 24 * 60 * 60 * 1000,
  permanent: null,
};

/**
 * Self-exclusion.
 *
 * Takes effect immediately and cannot be shortened — the database trigger
 * refuses any update that would bring the date forward. A cooling-off period
 * you can cancel the moment you regret it is not one.
 */
export async function selfExclude(
  _previous: SeedActionState,
  formData: FormData,
): Promise<SeedActionState> {
  const parsed = ExcludeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a period." };

  const user = await requireUser();
  const span = PERIODS[parsed.data.period];
  // "Permanent" is stored as a hundred years rather than null, so every check is
  // a simple date comparison with no special case to forget.
  const until = new Date(Date.now() + (span ?? 100 * 365 * 24 * 60 * 60 * 1000));

  const { error } = await admin()
    .from("profiles")
    .update({ self_excluded_until: until.toISOString() })
    .eq("id", user.id);

  if (error) return { error: "Could not apply the exclusion. Contact support." };

  revalidatePath("/games/limits");
  revalidatePath("/games");
  return {
    notice: `Applied. You cannot play until ${until.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}. Withdrawals can still be arranged through support.`,
  };
}

const LimitsSchema = z.object({
  dailyDeposit: z.string().trim().optional(),
  dailyLoss: z.string().trim().optional(),
  sessionMinutes: z.string().trim().optional(),
});

/**
 * Limits.
 *
 * Tightening applies at once. Loosening is held for 24 hours, because the
 * moment someone wants a higher limit is exactly the moment they should not get
 * one immediately.
 */
export async function updateLimits(
  _previous: SeedActionState,
  formData: FormData,
): Promise<SeedActionState> {
  const parsed = LimitsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the values." };

  const user = await requireUser();
  const db = admin();

  const toUnits = (value: string | undefined): string | null => {
    if (!value || value.trim() === "") return null;
    if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error("bad-number");
    const [whole = "0", frac = ""] = value.split(".");
    return `${whole}${frac.padEnd(6, "0")}`;
  };

  let deposit: string | null;
  let loss: string | null;
  try {
    deposit = toUnits(parsed.data.dailyDeposit);
    loss = toUnits(parsed.data.dailyLoss);
  } catch {
    return { error: "Enter plain numbers, for example 100 or 100.50." };
  }

  const sessionMinutes = parsed.data.sessionMinutes
    ? Number(parsed.data.sessionMinutes)
    : null;
  if (sessionMinutes !== null && (!Number.isInteger(sessionMinutes) || sessionMinutes < 5)) {
    return { error: "A session reminder must be at least 5 minutes." };
  }

  const { data: existing } = await db
    .from("user_limits")
    .select("daily_deposit_cap_usd::text,daily_loss_cap_usd::text")
    .eq("user_id", user.id)
    .maybeSingle()
    .returns<{ daily_deposit_cap_usd: string | null; daily_loss_cap_usd: string | null } | null>();

  const loosening =
    (deposit !== null &&
      existing?.daily_deposit_cap_usd &&
      BigInt(deposit) > BigInt(existing.daily_deposit_cap_usd)) ||
    (loss !== null &&
      existing?.daily_loss_cap_usd &&
      BigInt(loss) > BigInt(existing.daily_loss_cap_usd)) ||
    (deposit === null && existing?.daily_deposit_cap_usd) ||
    (loss === null && existing?.daily_loss_cap_usd);

  if (loosening) {
    await db.from("user_limits").upsert(
      {
        user_id: user.id,
        pending_increase: { daily_deposit_cap_usd: deposit, daily_loss_cap_usd: loss },
        pending_increase_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        session_minutes: sessionMinutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    revalidatePath("/games/limits");
    return {
      notice:
        "A higher limit takes effect in 24 hours. Your current limit stays in place until then. Lowering one is immediate.",
    };
  }

  await db.from("user_limits").upsert(
    {
      user_id: user.id,
      daily_deposit_cap_usd: deposit as unknown as number,
      daily_loss_cap_usd: loss as unknown as number,
      session_minutes: sessionMinutes,
      pending_increase: null,
      pending_increase_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  revalidatePath("/games/limits");
  return { notice: "Saved. Lower limits apply immediately." };
}
