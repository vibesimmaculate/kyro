import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "@/server/env";
import type { Database } from "./database.types";

/**
 * The service-role client. Bypasses RLS entirely.
 *
 * Every money path in KYRO runs through this: crediting a deposit, reserving a
 * withdrawal, settling a bet, moving an order forward. None of those may ever
 * be reachable from the browser, which is why this module is `server-only` and
 * the key it reads is never prefixed NEXT_PUBLIC_.
 */

export type Admin = SupabaseClient<Database>;

let cached: Admin | undefined;

export function admin(): Admin {
  if (!hasSupabase()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!cached) {
    const e = env();
    cached = createClient<Database>(
      e.NEXT_PUBLIC_SUPABASE_URL as string,
      e.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-kyro-client": "server" } },
      },
    );
  }
  return cached;
}

/** Null rather than throwing, for paths that degrade gracefully without a DB. */
export function adminOrNull(): Admin | undefined {
  return hasSupabase() ? admin() : undefined;
}
