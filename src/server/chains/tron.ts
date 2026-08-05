import "server-only";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58, hex } from "@scure/base";
import type { CryptoCode } from "@/lib/money/currencies";
import { chainConfig, type TronChainConfig } from "./config";
import { derivationPath, derivePrivateKey, derivePublicKey } from "./keys";
import type {
  AddressCheck,
  ChainAdapter,
  DerivedAddress,
  SeenDeposit,
  SignedTransfer,
  WithdrawalRequest,
} from "./types";

/**
 * Tron — the rail most people in the region actually use for USDT.
 *
 * Built against TronGrid's HTTP API directly rather than through TronWeb: the
 * three calls needed here (build, sign, broadcast) are straightforward, and the
 * SDK brings a large dependency tree along with its own bundled crypto. Signing
 * is plain secp256k1 over the transaction id, which Tron defines as the sha256
 * of the raw transaction bytes.
 */

const ADDRESS_PREFIX = 0x41;

/** Tron addresses are base58check over 0x41 ++ last-20-bytes-of-keccak(pubkey). */
function addressFromPublicKey(publicKey: Uint8Array): string {
  // The uncompressed key without its 0x04 marker is what gets hashed.
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false).slice(1);
  const hash = keccak_256(uncompressed);
  const body = new Uint8Array(21);
  body[0] = ADDRESS_PREFIX;
  body.set(hash.slice(-20), 1);
  return base58check(body);
}

function base58check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);
  return base58.encode(full);
}

function decodeBase58Check(address: string): Uint8Array | undefined {
  try {
    const decoded = base58.decode(address);
    if (decoded.length !== 25) return undefined;
    const payload = decoded.slice(0, 21);
    const checksum = decoded.slice(21);
    const expected = sha256(sha256(payload)).slice(0, 4);
    for (let i = 0; i < 4; i += 1) {
      if (checksum[i] !== expected[i]) return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

/** Contract calls want the 20-byte hex form, not base58. */
function toHexAddress(address: string): string {
  const payload = decodeBase58Check(address);
  if (!payload) throw new Error(`Not a Tron address: ${address}`);
  return hex.encode(payload);
}

/** ABI-encodes transfer(address,uint256) for a TRC-20 call. */
function encodeTransfer(to: string, amount: bigint): string {
  const selector = "a9059cbb";
  const addressWord = toHexAddress(to).slice(2).padStart(64, "0");
  const amountWord = amount.toString(16).padStart(64, "0");
  return `${selector}${addressWord}${amountWord}`;
}

interface TronTrc20Transfer {
  transaction_id: string;
  token_info: { address: string; decimals: number };
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
}

export function createTronAdapter(): ChainAdapter {
  const config = chainConfig("tron");
  if (config.family !== "tron") throw new Error("tron config missing");
  const cfg: TronChainConfig = config;

  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${cfg.apiUrl}${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(cfg.apiKey ? { "TRON-PRO-API-KEY": cfg.apiKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error(`TronGrid ${path} → ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  return {
    network: "tron",
    family: "tron",

    async deriveAddress(index: number): Promise<DerivedAddress> {
      return {
        address: addressFromPublicKey(derivePublicKey(cfg.coinType, "deposit", index)),
        index,
        path: derivationPath(cfg.coinType, "deposit", index),
      };
    },

    validateAddress(address: string): AddressCheck {
      const trimmed = address.trim();
      if (trimmed.length === 0) return { ok: false, reason: "Enter a Tron address." };
      if (!trimmed.startsWith("T")) {
        return { ok: false, reason: "A Tron address starts with T." };
      }
      if (trimmed.length !== 34) {
        return {
          ok: false,
          reason: `That address is ${trimmed.length} characters. A Tron address is 34.`,
        };
      }
      const payload = decodeBase58Check(trimmed);
      if (!payload || payload[0] !== ADDRESS_PREFIX) {
        return {
          ok: false,
          reason: "That address fails its checksum. One character is wrong — paste it again.",
        };
      }
      return { ok: true, normalised: trimmed };
    },

    async getHeight(): Promise<number> {
      const block = await api<{ block_header: { raw_data: { number: number } } }>(
        "/wallet/getnowblock",
        {},
      );
      return block.block_header.raw_data.number;
    },

    async scanForDeposits(addresses, fromHeight): Promise<readonly SeenDeposit[]> {
      const tip = await this.getHeight();
      const found: SeenDeposit[] = [];
      const usdt = cfg.tokens.USDT?.toLowerCase();

      for (const address of addresses) {
        const result = await api<{ data?: TronTrc20Transfer[] }>(
          `/v1/accounts/${address}/transactions/trc20?limit=50&only_to=true`,
        );

        for (const transfer of result.data ?? []) {
          if (transfer.to !== address) continue;
          if (usdt && transfer.token_info.address.toLowerCase() !== usdt) continue;

          // TronGrid's TRC-20 endpoint returns no block height, so
          // confirmations are derived from the transaction itself.
          const info = await api<{ blockNumber?: number }>(
            `/wallet/gettransactioninfobyid`,
            { value: transfer.transaction_id },
          ).catch(() => ({ blockNumber: undefined }));

          const height = info.blockNumber;
          if (height !== undefined && height < fromHeight) continue;

          found.push({
            chain: "tron",
            asset: "USDT",
            address,
            txHash: transfer.transaction_id,
            txIndex: 0,
            amount: BigInt(transfer.value),
            blockHeight: height,
            confirmations: height === undefined ? 0 : tip - height + 1,
          });
        }
      }

      return found;
    },

    async getConfirmations(txHash: string): Promise<number> {
      try {
        const info = await api<{ blockNumber?: number; receipt?: { result?: string } }>(
          "/wallet/gettransactioninfobyid",
          { value: txHash },
        );
        if (info.receipt?.result && info.receipt.result !== "SUCCESS") return -1;
        if (info.blockNumber === undefined) return 0;
        const tip = await this.getHeight();
        return tip - info.blockNumber + 1;
      } catch {
        return 0;
      }
    },

    async buildAndSignWithdrawal(request: WithdrawalRequest): Promise<SignedTransfer> {
      const destination = this.validateAddress(request.to);
      if (!destination.ok) throw new Error(destination.reason);

      const contract = cfg.tokens[request.asset];
      if (!contract) {
        throw new Error(`Tron does not carry ${request.asset} in this network mode.`);
      }

      const privateKey = derivePrivateKey(cfg.coinType, "hot", request.fromIndex);
      const from = addressFromPublicKey(derivePublicKey(cfg.coinType, "hot", request.fromIndex));

      // TronGrid builds the unsigned transaction; only the signature is ours.
      const built = await api<{
        transaction?: { txID: string; raw_data_hex: string };
        result?: { result?: boolean; message?: string };
      }>("/wallet/triggersmartcontract", {
        owner_address: toHexAddress(from),
        contract_address: toHexAddress(contract),
        function_selector: "transfer(address,uint256)",
        parameter: encodeTransfer(destination.normalised, request.amount).slice(8),
        fee_limit: 30_000_000,
        call_value: 0,
      });

      const transaction = built.transaction;
      if (!transaction) {
        throw new Error(`Tron refused to build the transfer: ${built.result?.message ?? "unknown"}`);
      }

      // Tron wants r ‖ s ‖ v. noble returns the recovered form as v ‖ r ‖ s,
      // so the recovery byte moves from the front to the back.
      const recovered = secp256k1.sign(hex.decode(transaction.txID), privateKey, {
        prehash: false,
        format: "recovered",
      });
      const signature = hex.encode(
        Uint8Array.from([...recovered.slice(1), recovered[0] ?? 0]),
      );

      return {
        raw: JSON.stringify({ ...transaction, signature: [signature] }),
        hash: transaction.txID,
        // Tron charges bandwidth and energy rather than a fee in the token; the
        // ceiling above is what the account is willing to burn.
        fee: 0n,
      };
    },

    async broadcast(signed: SignedTransfer): Promise<string> {
      const payload = JSON.parse(signed.raw) as Record<string, unknown>;
      const result = await api<{ result?: boolean; txid?: string; message?: string }>(
        "/wallet/broadcasttransaction",
        payload,
      );
      if (result.result !== true) {
        const message = result.message ? Buffer.from(result.message, "hex").toString("utf8") : "";
        throw new Error(`Tron rejected the broadcast: ${message || "unknown reason"}`);
      }
      return result.txid ?? signed.hash;
    },

    async estimateNetworkFee(asset: CryptoCode): Promise<bigint> {
      // Tron's cost is energy and bandwidth, denominated in TRX, not in the
      // token being moved. Converting it into USDT needs a price source, and
      // KYRO will not invent one — the sample table covers this until a real
      // oracle is configured.
      throw new Error(
        `Live fee estimation for ${asset} on Tron needs a TRX price source. ` +
          "Use the sample fee provider until one is configured.",
      );
    },
  };
}
