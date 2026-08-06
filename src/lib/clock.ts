/**
 * Clock reads, in one place.
 *
 * `Date.now` and `performance.now` are impure, and React's compiler is right to
 * refuse them anywhere it can reach from render: a timestamp read during render
 * changes on every re-render and produces a component that quietly disagrees
 * with itself. Everything that genuinely needs the time — a round starting, a
 * frame being timed — goes through here, from an event or a callback, which
 * makes "why is this allowed?" a question with a written answer rather than a
 * suppression comment.
 *
 * The server has its own, `@/server/clock`, which is request-stable. This one
 * is not and must never be used to render anything.
 */

/** Wall-clock milliseconds. For anything compared against a server timestamp. */
export function nowMs(): number {
  return Date.now();
}

/**
 * Monotonic milliseconds, for measuring elapsed time.
 *
 * Wall-clock time can jump backwards — a clock sync, a laptop waking up — and
 * an animation timed against it stutters or runs backwards when it does.
 */
export function frameNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
