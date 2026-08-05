import "server-only";

/**
 * The time, read once per request.
 *
 * A server component renders exactly once per request, so reading the clock in
 * it is legitimate — but doing so inline trips React's purity rule, which
 * cannot tell a server render from a client one and is right to be suspicious.
 *
 * Routing it through here does three useful things: it satisfies the rule
 * honestly rather than by suppression, it gives every page one obvious seam to
 * stub in a test, and it puts a name on what the value actually is — the
 * instant this request was priced, which is what anchors every quote on the
 * page to the same rate.
 */
export function requestNow(): number {
  return Date.now();
}

/** The same instant, as a Date, for the opening-hours calculations. */
export function requestDate(): Date {
  return new Date(requestNow());
}
