/**
 * Vitest setup.
 *
 * Deliberately thin. Component tests get DOM matchers; everything else is
 * pure and needs no environment at all.
 */
import { existsSync } from "node:fs";
import { afterEach } from "vitest";

// Integration tests need the local Supabase keys. Loaded here rather than
// asking anyone to remember a shell incantation before running the suite.
if (existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Node below 20.12, or an unreadable file. The integration tests detect the
    // missing key and skip with a message rather than failing.
  }
}

// bigint is not JSON-serialisable, and Vitest prints diffs as JSON. Without
// this, a failing money assertion reports "Do not know how to serialize a
// BigInt" instead of the numbers that disagree.
if (!("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value(this: bigint) {
      return `${this.toString()}n`;
    },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Placeholder for per-test teardown; keeps the hook in one place.
});
