import "server-only";
import { fetchMarkets, type MarketSnapshot } from "./source";

/**
 * Access to the market feed, with the failure mode designed first.
 *
 * `getMarkets` never throws and never blocks a page render for long. It returns
 * either a fresh snapshot or an explicit statement that there isn't one, and
 * the surfaces above it are built to render both. The alternative — letting a
 * third-party outage take down the homepage, or worse, quietly serving
 * yesterday's price without saying so — is not a trade this product makes.
 */

/** How long a snapshot is treated as current. */
const FRESH_MS = 60_000;

/** How long a snapshot is still worth showing, clearly marked as stale. */
const STALE_MS = 15 * 60_000;

/** Long enough for a slow provider, short enough not to stall a page. */
const TIMEOUT_MS = 4_000;

export type MarketState =
  | { readonly status: "live"; readonly snapshot: MarketSnapshot }
  | { readonly status: "stale"; readonly snapshot: MarketSnapshot }
  | { readonly status: "unavailable"; readonly snapshot: undefined };

interface Cache {
  snapshot: MarketSnapshot | undefined;
  /** In-flight request, so ten concurrent renders make one call. */
  inFlight: Promise<MarketSnapshot | undefined> | undefined;
  failedAt: number;
}

// On the global, so the dev server's module reloading does not reset it and
// hammer the provider on every edit.
const KEY = Symbol.for("kyro.markets");

function cache(): Cache {
  const globals = globalThis as unknown as Record<symbol, Cache | undefined>;
  let existing = globals[KEY];
  if (!existing) {
    existing = { snapshot: undefined, inFlight: undefined, failedAt: 0 };
    globals[KEY] = existing;
  }
  return existing;
}

async function refresh(): Promise<MarketSnapshot | undefined> {
  const store = cache();
  if (store.inFlight) return store.inFlight;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  store.inFlight = fetchMarkets(controller.signal)
    .then((snapshot) => {
      store.snapshot = snapshot;
      store.failedAt = 0;
      return snapshot;
    })
    .catch(() => {
      // Deliberately swallowed. A market feed being down is an expected state
      // of the world, not an exception the page should propagate.
      store.failedAt = Date.now();
      return undefined;
    })
    .finally(() => {
      clearTimeout(timer);
      store.inFlight = undefined;
    });

  return store.inFlight;
}

export async function getMarkets(): Promise<MarketState> {
  const store = cache();
  const now = Date.now();
  const age = store.snapshot ? now - store.snapshot.fetchedAt : Infinity;

  if (store.snapshot && age < FRESH_MS) {
    return { status: "live", snapshot: store.snapshot };
  }

  // Back off for a minute after a failure rather than retrying on every render.
  const backingOff = store.failedAt > 0 && now - store.failedAt < FRESH_MS;
  if (!backingOff) {
    const fresh = await refresh();
    if (fresh) return { status: "live", snapshot: fresh };
  }

  if (store.snapshot && age < STALE_MS) {
    return { status: "stale", snapshot: store.snapshot };
  }

  return { status: "unavailable", snapshot: undefined };
}

/**
 * The last snapshot, without triggering a fetch.
 *
 * For callers that must be synchronous — the rate provider is one — and that
 * have their own answer when nothing is cached.
 */
export function cachedMarkets(): MarketSnapshot | undefined {
  const store = cache();
  if (!store.snapshot) return undefined;
  return Date.now() - store.snapshot.fetchedAt < STALE_MS ? store.snapshot : undefined;
}

export type { MarketRow, MarketSnapshot } from "./source";
