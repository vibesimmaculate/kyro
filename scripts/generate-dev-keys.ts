/**
 * Generates the secrets a development install needs.
 *
 *   pnpm keys:dev
 *
 * Writes a TESTNET-ONLY BIP-39 mnemonic and an internal API secret into
 * .env.local, which is gitignored. It refuses to overwrite an existing mnemonic,
 * because doing so would orphan every deposit address already derived from it —
 * and on mainnet that means losing the funds sitting at those addresses.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const ENV_PATH = join(process.cwd(), ".env.local");

function readEnv(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(ENV_PATH)) return map;
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key) continue;
    map.set(key, (rawValue ?? "").replace(/^"|"$/g, ""));
  }
  return map;
}

function main() {
  const existing = readEnv();
  const lines: string[] = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
    : [];

  const updates = new Map<string, string>();

  const currentMnemonic = existing.get("KYRO_HD_MNEMONIC");
  if (currentMnemonic && currentMnemonic.length > 0) {
    console.log("KYRO_HD_MNEMONIC already set — left untouched.");
    console.log("  Replacing it would orphan every address already derived from it.");
  } else {
    // 128 bits → 12 words. Enough for a development wallet; use a hardware
    // signer and a secret manager for anything holding real value.
    updates.set("KYRO_HD_MNEMONIC", generateMnemonic(wordlist, 128));
    console.log("KYRO_HD_MNEMONIC generated (12 words, testnet use only).");
  }

  const currentSecret = existing.get("KYRO_INTERNAL_SECRET");
  if (currentSecret && currentSecret.length > 0) {
    console.log("KYRO_INTERNAL_SECRET already set — left untouched.");
  } else {
    updates.set("KYRO_INTERNAL_SECRET", randomBytes(32).toString("hex"));
    console.log("KYRO_INTERNAL_SECRET generated.");
  }

  if (updates.size === 0) {
    console.log("\nNothing to do.");
    return;
  }

  const output = [...lines];
  for (const [key, value] of updates) {
    const index = output.findIndex((l) => l.trim().startsWith(`${key}=`));
    const entry = `${key}="${value}"`;
    if (index >= 0) output[index] = entry;
    else output.push(entry);
  }

  writeFileSync(ENV_PATH, `${output.join("\n").replace(/\n+$/, "")}\n`, "utf8");

  console.log(`\nWritten to ${ENV_PATH}`);
  console.log("\n  This file is gitignored. Keep it that way.");
  console.log("  The mnemonic controls every deposit address KYRO issues.");
  console.log("  It is generated for TESTNET. Do not point it at mainnet.\n");
}

main();
