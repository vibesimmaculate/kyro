"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { CRYPTO_CODES, FIAT_CODES, NETWORK_IDS, supportsNetwork } from "@/lib/money/currencies";
import { buildQuote } from "@/lib/quote/engine";
import { DIRECTIONS } from "@/lib/quote/types";
import { validateAddress } from "@/server/chains";
import { createOrder } from "@/server/orders";
import { clearDraft, markDone, mergeDraft, readDraft } from "./draft";

/**
 * Server actions for the exchange flow.
 *
 * Each one validates, saves and redirects. Prices are never accepted from the
 * client — they are recomputed here every time, and again at the moment an
 * order is created.
 */

export interface ActionState {
  readonly error?: string;
  readonly field?: string;
}

const QuoteInput = z.object({
  direction: z.enum(DIRECTIONS),
  amount: z.string().min(1, "Enter how much you are exchanging."),
  fiat: z.enum(FIAT_CODES),
  asset: z.enum(CRYPTO_CODES),
  network: z.enum(NETWORK_IDS),
  location: z.string().optional(),
});

export async function submitQuote(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = QuoteInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const input = parsed.data;

  if (!supportsNetwork(input.asset, input.network)) {
    return { error: `${input.asset} does not move on that network.`, field: "network" };
  }

  // Priced here so an impossible amount is caught before the customer invests
  // three more steps in it.
  const priced = buildQuote({
    direction: input.direction,
    give: input.amount,
    fiat: input.fiat,
    asset: input.asset,
    network: input.network,
    at: Date.now(),
  });
  if (!priced.ok) {
    const issue = priced.issues[0];
    return { error: issue?.message ?? "That amount cannot be exchanged.", field: issue?.field };
  }

  const draft = await mergeDraft({
    direction: input.direction,
    amount: input.amount,
    fiat: input.fiat,
    asset: input.asset,
    network: input.network,
    location: input.location,
  });
  await mergeDraft(markDone(draft, "quote"));

  redirect("/exchange/details");
}

const DetailsInput = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address so we can send your order code.")
    .email("That does not look like an email address."),
});

export async function submitDetails(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = DetailsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form.", field: "email" };
  }

  const draft = await mergeDraft({ email: parsed.data.email });
  await mergeDraft(markDone(draft, "details"));

  redirect("/exchange/wallet");
}

const WalletInput = z.object({
  network: z.enum(NETWORK_IDS),
  walletAddress: z.string().trim().optional(),
});

export async function submitWallet(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = WalletInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the network and address.", field: "walletAddress" };
  }

  const current = await readDraft();
  if (!current) redirect("/exchange");

  if (!supportsNetwork(current.asset, parsed.data.network)) {
    return { error: `${current.asset} does not move on that network.`, field: "network" };
  }

  // Cash → crypto: KYRO sends, so the address must be right and must match the
  // chosen network. Crypto → cash: KYRO issues the address, nothing to collect.
  if (current.direction === "cash-to-crypto") {
    const address = parsed.data.walletAddress ?? "";
    if (address.length === 0) {
      return {
        error: "Enter the wallet address the crypto should be sent to.",
        field: "walletAddress",
      };
    }
    const check = validateAddress(parsed.data.network, address);
    if (!check.ok) {
      return { error: check.reason, field: "walletAddress" };
    }
  }

  const draft = await mergeDraft({
    network: parsed.data.network,
    walletAddress:
      current.direction === "cash-to-crypto" ? parsed.data.walletAddress?.trim() : undefined,
  });
  await mergeDraft(markDone(draft, "wallet"));

  redirect("/exchange/location");
}

const LocationInput = z.object({
  location: z.string().trim().min(1, "Choose where you want to do this."),
});

export async function submitLocation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = LocationInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a location.", field: "location" };
  }

  const draft = await mergeDraft({ location: parsed.data.location });
  await mergeDraft(markDone(draft, "location"));

  redirect("/exchange/review");
}

export async function confirmOrder(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const draft = await readDraft();
  if (!draft) redirect("/exchange");
  if (!draft.location) {
    return { error: "Choose a location before confirming.", field: "location" };
  }

  const result = await createOrder({
    direction: draft.direction,
    fiat: draft.fiat,
    asset: draft.asset,
    network: draft.network,
    amount: draft.amount,
    locationSlug: draft.location,
    walletAddress: draft.walletAddress,
    email: draft.email,
  });

  if (!result.ok) {
    return { error: result.reason };
  }

  await clearDraft();
  redirect(`/orders/${result.order.reference}?new=1`);
}

export async function abandonDraft(): Promise<void> {
  await clearDraft();
  redirect("/exchange");
}
