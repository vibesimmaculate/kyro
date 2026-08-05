import "server-only";

import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import type { CryptoCode, NetworkId } from "@/lib/money/currencies";
import { chainConfig, type BitcoinChainConfig } from "./config";
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
 * Bitcoin.
 *
 * The odd one out: UTXOs rather than balances, so a withdrawal has to select
 * inputs, calculate its own fee from the resulting size, and hand the remainder
 * back to itself as change. Getting the change output wrong pays the difference
 * to miners, which is why the fee is derived from a size estimate rather than
 * guessed at.
 *
 * Native SegWit (P2WPKH, bc1…) throughout — cheapest to spend, and universally
 * accepted by now.
 */

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
}

interface EsploraTx {
  txid: string;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
  status: { confirmed: boolean; block_height?: number };
}

/** Rough vbytes for a P2WPKH spend: overhead + inputs + two outputs. */
function estimateVbytes(inputs: number, outputs: number): number {
  return Math.ceil(10.5 + inputs * 68 + outputs * 31);
}

const DUST_LIMIT = 294n;

export function createBitcoinAdapter(): ChainAdapter {
  const config = chainConfig("bitcoin");
  if (config.family !== "bitcoin") throw new Error("bitcoin config missing");
  const cfg: BitcoinChainConfig = config;

  const network =
    cfg.bech32Prefix === "bc"
      ? btc.NETWORK
      : { ...btc.TEST_NETWORK, bech32: cfg.bech32Prefix };

  async function esplora<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${cfg.esploraUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { accept: "application/json", ...init?.headers },
    });
    if (!response.ok) {
      throw new Error(`Esplora ${path} → ${response.status} ${await response.text()}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  function addressFor(purse: "deposit" | "hot", index: number): string {
    const pubkey = derivePublicKey(cfg.coinType, purse, index);
    const payment = btc.p2wpkh(pubkey, network);
    if (!payment.address) throw new Error("Could not derive a bitcoin address");
    return payment.address;
  }

  return {
    network: "bitcoin",
    family: "bitcoin",

    async deriveAddress(index: number): Promise<DerivedAddress> {
      return {
        address: addressFor("deposit", index),
        index,
        path: derivationPath(cfg.coinType, "deposit", index),
      };
    },

    validateAddress(address: string): AddressCheck {
      const trimmed = address.trim();
      if (trimmed.length === 0) return { ok: false, reason: "Enter a bitcoin address." };

      try {
        btc.Address(network).decode(trimmed);
        return { ok: true, normalised: trimmed };
      } catch {
        // Distinguish the two failures properly rather than guessing from the
        // prefix. Telling someone their perfectly good mainnet address is
        // "invalid" sends them hunting for a typo that does not exist; telling
        // someone their typo is "the wrong network" is just as unhelpful. So
        // the address is decoded against the other network to find out which
        // it actually is.
        const other = cfg.bech32Prefix === "bc" ? btc.TEST_NETWORK : btc.NETWORK;
        const otherName = cfg.bech32Prefix === "bc" ? "testnet" : "mainnet";
        const thisName = cfg.bech32Prefix === "bc" ? "mainnet" : "testnet";

        try {
          btc.Address(other).decode(trimmed);
          return {
            ok: false,
            reason: `That is a valid ${otherName} address, but this counter is on ${thisName}. Sending there would lose the funds.`,
          };
        } catch {
          return {
            ok: false,
            reason:
              "That is not a valid bitcoin address — check for a missing or altered character.",
          };
        }
      }
    },

    async getHeight(): Promise<number> {
      return Number(await esplora<string>("/blocks/tip/height"));
    },

    async scanForDeposits(addresses, fromHeight): Promise<readonly SeenDeposit[]> {
      const tip = Number(await esplora<string>("/blocks/tip/height"));
      const found: SeenDeposit[] = [];

      // Esplora indexes by address, so the history is fetched directly rather
      // than by walking blocks — far cheaper, and the same answer.
      for (const address of addresses) {
        const txs = await esplora<EsploraTx[]>(`/address/${address}/txs`);
        for (const tx of txs) {
          const height = tx.status.block_height;
          if (height !== undefined && height < fromHeight) continue;

          tx.vout.forEach((out, index) => {
            if (out.scriptpubkey_address !== address) return;
            found.push({
              chain: "bitcoin",
              asset: "BTC",
              address,
              txHash: tx.txid,
              txIndex: index,
              amount: BigInt(out.value),
              blockHeight: height,
              confirmations: height === undefined ? 0 : tip - height + 1,
            });
          });
        }
      }

      return found;
    },

    async getConfirmations(txHash: string): Promise<number> {
      try {
        const tx = await esplora<EsploraTx>(`/tx/${txHash}`);
        if (!tx.status.confirmed || tx.status.block_height === undefined) return 0;
        const tip = Number(await esplora<string>("/blocks/tip/height"));
        return tip - tx.status.block_height + 1;
      } catch {
        return 0;
      }
    },

    async buildAndSignWithdrawal(request: WithdrawalRequest): Promise<SignedTransfer> {
      const destination = this.validateAddress(request.to);
      if (!destination.ok) throw new Error(destination.reason);

      const fromAddress = addressFor("hot", request.fromIndex);
      const privateKey = derivePrivateKey(cfg.coinType, "hot", request.fromIndex);
      const publicKey = derivePublicKey(cfg.coinType, "hot", request.fromIndex);
      const payment = btc.p2wpkh(publicKey, network);

      const utxos = await esplora<EsploraUtxo[]>(`/address/${fromAddress}/utxo`);
      const spendable = utxos
        .filter((u) => u.status.confirmed)
        .sort((a, b) => b.value - a.value);

      if (spendable.length === 0) {
        throw new Error("The hot wallet has no confirmed UTXOs to spend.");
      }

      const feeRates = await esplora<Record<string, number>>("/fee-estimates");
      // Target ~3 blocks; fall back to a floor rather than to zero, because a
      // zero-fee transaction is simply never mined.
      const satPerVbyte = BigInt(Math.max(2, Math.ceil(feeRates["3"] ?? feeRates["6"] ?? 5)));

      // Accumulate inputs until the amount plus the fee for the resulting size
      // is covered. The fee grows with each input, so it is recalculated inside
      // the loop rather than assumed.
      const selected: EsploraUtxo[] = [];
      let total = 0n;
      let fee = 0n;

      for (const utxo of spendable) {
        selected.push(utxo);
        total += BigInt(utxo.value);
        fee = satPerVbyte * BigInt(estimateVbytes(selected.length, 2));
        if (total >= request.amount + fee) break;
      }

      if (total < request.amount + fee) {
        throw new Error(
          `Hot wallet holds ${total} sat; this withdrawal needs ${request.amount + fee} sat including fee.`,
        );
      }

      const tx = new btc.Transaction();
      for (const utxo of selected) {
        tx.addInput({
          txid: utxo.txid,
          index: utxo.vout,
          witnessUtxo: { script: payment.script, amount: BigInt(utxo.value) },
        });
      }

      tx.addOutputAddress(destination.normalised, request.amount, network);

      const change = total - request.amount - fee;
      if (change > DUST_LIMIT) {
        tx.addOutputAddress(fromAddress, change, network);
      }
      // Change at or below the dust limit costs more to spend than it is worth,
      // so it goes to the miner rather than creating an unspendable output.

      tx.sign(privateKey);
      tx.finalize();

      return { raw: hex.encode(tx.extract()), hash: tx.id, fee };
    },

    async broadcast(signed: SignedTransfer): Promise<string> {
      return esplora<string>("/tx", {
        method: "POST",
        body: signed.raw,
        headers: { "content-type": "text/plain" },
      });
    },

    async estimateNetworkFee(asset: CryptoCode): Promise<bigint> {
      if (asset !== "BTC") throw new Error(`Bitcoin does not carry ${asset}`);
      const feeRates = await esplora<Record<string, number>>("/fee-estimates");
      const satPerVbyte = BigInt(Math.max(2, Math.ceil(feeRates["3"] ?? 5)));
      return satPerVbyte * BigInt(estimateVbytes(2, 2));
    },
  };
}

export type { NetworkId };
