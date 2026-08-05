import "server-only";

import { z } from "zod";

/**
 * Environment, read once and validated.
 *
 * Nothing here throws at import time. A missing Supabase key means the site
 * falls back to the in-process store and says so; a missing RPC key means the
 * public testnet endpoint is used. The one thing that *does* throw is asking
 * for mainnet without arming it — see `networkMode`.
 */

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  KYRO_NETWORK_MODE: z.enum(["testnet", "mainnet"]).default("testnet"),
  KYRO_MAINNET_ARMED: optionalString,

  KYRO_HD_MNEMONIC: optionalString,
  KYRO_INTERNAL_SECRET: optionalString,

  EVM_ETHEREUM_RPC_URL: optionalString,
  EVM_BASE_RPC_URL: optionalString,
  EVM_ARBITRUM_RPC_URL: optionalString,
  TRON_API_URL: optionalString,
  TRON_API_KEY: optionalString,
  BITCOIN_ESPLORA_URL: optionalString,
  SOLANA_RPC_URL: optionalString,

  KYRO_WITHDRAWAL_APPROVAL_THRESHOLD_USD: z.coerce.number().nonnegative().default(250),
  KYRO_HOT_WALLET_CAP_USD: z.coerce.number().nonnegative().default(25_000),
  KYRO_DAILY_WITHDRAWAL_CAP_USD: z.coerce.number().nonnegative().default(2_000),

  KYRO_BLOCKED_COUNTRIES: z.string().default(""),
  KYRO_LICENCE_AUTHORITY: optionalString,
  KYRO_LICENCE_NUMBER: optionalString,
  KYRO_HELPLINE_NAME: optionalString,
  KYRO_HELPLINE_URL: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // A malformed value is a deployment error worth failing loudly for; a
      // missing optional one is not, and never reaches here.
      throw new Error(
        `Invalid environment configuration:\n${parsed.error.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/* ── Derived answers the product actually asks ──────────────────────────── */

export function hasSupabase(): boolean {
  const e = env();
  return Boolean(
    e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export type NetworkMode = "testnet" | "mainnet";

/**
 * Mainnet needs two switches thrown, not one.
 *
 * A single env var is too easy to set by accident — a copied deploy config, a
 * stray export — and the blast radius is real customer funds moving on a real
 * chain. `KYRO_MAINNET_ARMED=yes` has to be set deliberately alongside it.
 */
export function networkMode(): NetworkMode {
  const e = env();
  if (e.KYRO_NETWORK_MODE !== "mainnet") return "testnet";
  if (e.KYRO_MAINNET_ARMED?.toLowerCase() !== "yes") {
    throw new Error(
      "KYRO_NETWORK_MODE is 'mainnet' but KYRO_MAINNET_ARMED is not 'yes'. " +
        "Refusing to touch mainnet. Set both deliberately, or switch back to testnet.",
    );
  }
  return "mainnet";
}

export function isMainnet(): boolean {
  return networkMode() === "mainnet";
}

export function hasCustodyKeys(): boolean {
  return Boolean(env().KYRO_HD_MNEMONIC);
}

export function blockedCountries(): readonly string[] {
  return env()
    .KYRO_BLOCKED_COUNTRIES.split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length === 2);
}

export interface LicenceInfo {
  readonly authority?: string;
  readonly number?: string;
  readonly licensed: boolean;
}

/**
 * KYRO invents no licence data. Until both fields are filled in with something
 * real, the games wing shows an unlicensed-preview notice.
 */
export function licence(): LicenceInfo {
  const e = env();
  return {
    authority: e.KYRO_LICENCE_AUTHORITY,
    number: e.KYRO_LICENCE_NUMBER,
    licensed: Boolean(e.KYRO_LICENCE_AUTHORITY && e.KYRO_LICENCE_NUMBER),
  };
}

export function helpline(): { name?: string; url?: string } {
  const e = env();
  return { name: e.KYRO_HELPLINE_NAME, url: e.KYRO_HELPLINE_URL };
}
