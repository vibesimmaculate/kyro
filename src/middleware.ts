import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Two jobs, both of which have to happen before a page renders.
 *
 * Keeping the Supabase session fresh — without this, a token that expires
 * mid-visit logs someone out between one click and the next.
 *
 * Refusing the games wing to restricted markets. Geo is read from the platform
 * header; when there is none (local development, or a host that does not
 * provide one) the request is allowed through, because guessing a country from
 * an IP badly is worse than not guessing. The block is a real gate, not a
 * claim of perfect coverage.
 */

const GAMES_PREFIX = "/games";

function blockedCountries(): Set<string> {
  return new Set(
    (process.env.KYRO_BLOCKED_COUNTRIES ?? "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length === 2),
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Touching getUser is what refreshes the token; the result is not needed
    // here because every page checks for itself.
    await supabase.auth.getUser();
  }

  if (request.nextUrl.pathname.startsWith(GAMES_PREFIX)) {
    const country = (
      request.headers.get("x-vercel-ip-country") ??
      request.headers.get("cf-ipcountry") ??
      request.headers.get("x-kyro-country") ??
      ""
    ).toUpperCase();

    if (country && blockedCountries().has(country)) {
      const target = request.nextUrl.clone();
      target.pathname = "/games/unavailable";
      target.search = "";
      return NextResponse.rewrite(target);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation — those never need
     * a session refresh and running middleware on them is pure latency.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
