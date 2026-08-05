import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, hasSupabase } from "@/server/env";
import type { Database } from "./database.types";

/**
 * The request-scoped client, carrying the signed-in user's session.
 *
 * Reads through this are subject to RLS, which is the point: if a policy is
 * wrong, a user sees nothing rather than someone else's ledger. Anything that
 * must write money uses `admin()` instead, deliberately and in one place.
 */
export async function supabaseServer() {
  if (!hasSupabase()) return undefined;
  const e = env();
  const store = await cookies();

  return createServerClient<Database>(
    e.NEXT_PUBLIC_SUPABASE_URL as string,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh happens in middleware instead; ignoring here is
            // the documented pattern rather than an error worth surfacing.
          }
        },
      },
    },
  );
}

export interface SessionUser {
  readonly id: string;
  readonly email?: string;
}

/** The signed-in user, verified against the auth server rather than trusted. */
export async function currentUser(): Promise<SessionUser | undefined> {
  const client = await supabaseServer();
  if (!client) return undefined;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return undefined;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Staff check. Uses the service role so a missing staff row is unambiguous. */
export async function isStaff(userId: string): Promise<boolean> {
  const { admin } = await import("./admin");
  const { data } = await admin().from("staff").select("role").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
