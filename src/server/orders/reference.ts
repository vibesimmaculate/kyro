import { randomInt } from "node:crypto";

/**
 * Order codes.
 *
 * KYR-4H2N-8QX1. Read aloud across a pickup point, written on a phone screen, typed
 * by someone in a hurry — so the alphabet drops the characters that get
 * confused when spoken or seen: no I or 1, no O or 0, no B, S, U or Z. What
 * remains is unambiguous in speech and in print.
 *
 * 28 characters over 8 positions is about 3.8 × 10^11 codes. Collisions are
 * checked against the store regardless.
 */

const ALPHABET = "23456789ACDEFGHJKLMNPQRTVWXY";
const GROUP = 4;
const GROUPS = 2;
const PREFIX = "KYR";

export function generateReference(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < GROUP; i += 1) {
      // randomInt is uniform and cryptographically sound. Math.random is banned
      // repo-wide by lint precisely so this can never become predictable.
      group += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    groups.push(group);
  }
  return `${PREFIX}-${groups.join("-")}`;
}

const PATTERN = new RegExp(`^${PREFIX}-[${ALPHABET}]{${GROUP}}-[${ALPHABET}]{${GROUP}}$`);

export function isValidReference(value: string): boolean {
  return PATTERN.test(value.trim().toUpperCase());
}

/**
 * Accepts what people type: lower case, missing or extra dashes, stray spaces
 * from a copy-paste, and a missing KYR prefix.
 *
 * Deliberately does not "correct" characters. The alphabet excludes both O and
 * zero, so a typed O is genuinely ambiguous — guessing which one was meant
 * could send someone to a stranger's order. Failing with a clear message is the
 * better outcome.
 */
export function normaliseReference(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s -]/g, "");

  const body = cleaned.startsWith(PREFIX) ? cleaned.slice(PREFIX.length) : cleaned;
  if (body.length !== GROUP * GROUPS) return cleaned;
  return `${PREFIX}-${body.slice(0, GROUP)}-${body.slice(GROUP)}`;
}
