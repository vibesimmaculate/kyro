"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/server/supabase/admin";
import { supabaseServer, requireUser } from "@/server/supabase/server";

/**
 * Accounts.
 *
 * Only the games need one. The exchange stays open to anyone with an order
 * code, which is the promise the whole product is built around — a login wall
 * in front of a currency counter would be absurd.
 */

export interface AuthState {
  readonly error?: string;
  readonly notice?: string;
  readonly email?: string;
}

const Credentials = z.object({
  email: z.string().trim().email("That does not look like an email address."),
  password: z
    .string()
    .min(10, "Use at least 10 characters. Length beats punctuation."),
  next: z.string().optional(),
});

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form.",
      email: String(formData.get("email") ?? ""),
    };
  }

  const client = await supabaseServer();
  if (!client) return { error: "Accounts are unavailable — no database is configured." };

  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message, email: parsed.data.email };
  }

  if (data.user) {
    // The profile row is the anchor for limits, KYC and self-exclusion, so it
    // exists from the first moment rather than being created lazily later.
    await admin()
      .from("profiles")
      .upsert({ id: data.user.id }, { onConflict: "id" });
  }

  if (!data.session) {
    return {
      notice:
        "Check your email to confirm the address, then sign in. In local development the message appears in Mailpit at port 54324.",
      email: parsed.data.email,
    };
  }

  redirect(parsed.data.next ?? "/games/age");
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form.",
      email: String(formData.get("email") ?? ""),
    };
  }

  const client = await supabaseServer();
  if (!client) return { error: "Accounts are unavailable — no database is configured." };

  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately does not distinguish "no such account" from "wrong
    // password": telling them apart hands an attacker a list of real addresses.
    return { error: "That email and password do not match.", email: parsed.data.email };
  }

  redirect(parsed.data.next ?? "/games");
}

export async function signOut(): Promise<void> {
  const client = await supabaseServer();
  await client?.auth.signOut();
  redirect("/");
}

/* ── Age confirmation ──────────────────────────────────────────────────── */

const AgeSchema = z.object({
  day: z.coerce.number().int().min(1).max(31),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
});

function yearsSince(birth: Date, now: Date): number {
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export async function confirmAge(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = AgeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your full date of birth." };

  const user = await requireUser();
  const { day, month, year } = parsed.data;
  const birth = new Date(Date.UTC(year, month - 1, day));

  if (birth.getUTCDate() !== day || birth.getUTCMonth() !== month - 1) {
    return { error: "That date does not exist." };
  }

  const age = yearsSince(birth, new Date());
  if (age < 18) {
    return {
      error:
        "You must be 18 or over to play. Your account stays open for the exchange, which has no age restriction.",
    };
  }

  await admin()
    .from("profiles")
    .update({ age_confirmed_at: new Date().toISOString() })
    .eq("id", user.id);

  redirect("/games");
}
