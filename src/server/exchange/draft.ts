import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { CRYPTO_CODES, FIAT_CODES, NETWORK_IDS } from "@/lib/money/currencies";
import { DIRECTIONS } from "@/lib/quote/types";

/**
 * The half-finished order, carried between steps in a cookie.
 *
 * It holds inputs only — never prices. Every step re-prices from these values
 * on the server, so a tampered cookie can change what someone is asking for but
 * never what it costs. That is the whole reason the money lives nowhere near
 * here.
 */

export const DRAFT_COOKIE = "kyro_draft";

export const DraftSchema = z.object({
  direction: z.enum(DIRECTIONS),
  amount: z.string().max(24),
  fiat: z.enum(FIAT_CODES),
  asset: z.enum(CRYPTO_CODES),
  network: z.enum(NETWORK_IDS),
  location: z.string().max(64).optional(),
  walletAddress: z.string().max(128).optional(),
  email: z.string().max(200).optional(),
  /** Which steps the customer has actually completed, so they cannot skip. */
  done: z.array(z.enum(["quote", "details", "wallet", "location"])).default([]),
});

export type Draft = z.infer<typeof DraftSchema>;

export const EMPTY_DRAFT: Draft = {
  direction: "cash-to-crypto",
  amount: "1000",
  fiat: "EUR",
  asset: "BTC",
  network: "bitcoin",
  done: [],
};

export async function readDraft(): Promise<Draft | undefined> {
  const raw = (await cookies()).get(DRAFT_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function writeDraft(draft: Draft): Promise<void> {
  (await cookies()).set(DRAFT_COOKIE, JSON.stringify(draft), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
}

export async function clearDraft(): Promise<void> {
  (await cookies()).delete(DRAFT_COOKIE);
}

export async function mergeDraft(patch: Partial<Draft>): Promise<Draft> {
  const current = (await readDraft()) ?? EMPTY_DRAFT;
  const next: Draft = { ...current, ...patch };
  await writeDraft(next);
  return next;
}

export function markDone(draft: Draft, step: Draft["done"][number]): Draft {
  return draft.done.includes(step) ? draft : { ...draft, done: [...draft.done, step] };
}

/* ── Flow shape ─────────────────────────────────────────────────────────── */

export const FLOW_STEPS = [
  { slug: "", label: "Quote", href: "/exchange" },
  { slug: "details", label: "Details", href: "/exchange/details" },
  { slug: "wallet", label: "Wallet", href: "/exchange/wallet" },
  { slug: "location", label: "Location", href: "/exchange/location" },
  { slug: "review", label: "Review", href: "/exchange/review" },
] as const;

export type FlowStepSlug = (typeof FLOW_STEPS)[number]["slug"];
