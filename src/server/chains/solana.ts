import "server-only";

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { CRYPTO, type CryptoCode } from "@/lib/money/currencies";
import { chainConfig, type SolanaChainConfig } from "./config";
import { deriveEd25519Seed, ed25519Path } from "./keys";
import type {
  AddressCheck,
  ChainAdapter,
  DerivedAddress,
  SeenDeposit,
  SignedTransfer,
  WithdrawalRequest,
} from "./types";

/**
 * Solana.
 *
 * Two wrinkles the other chains do not have. Keys are ed25519 over SLIP-0010,
 * not secp256k1 over BIP-32. And a token balance lives in an associated token
 * account that must exist before anything can be sent to it — so a withdrawal
 * to a wallet that has never held this token has to create that account first,
 * and pay the rent for it.
 */

const LAMPORTS_PER_SIGNATURE = 5_000n;
/** Rent-exempt minimum for a token account, in lamports. */
const TOKEN_ACCOUNT_RENT = 2_039_280n;

function keypairFor(cfg: SolanaChainConfig, purse: "deposit" | "hot", index: number): Keypair {
  return Keypair.fromSeed(deriveEd25519Seed(cfg.coinType, purse, index));
}

export function createSolanaAdapter(): ChainAdapter {
  const config = chainConfig("solana");
  if (config.family !== "solana") throw new Error("solana config missing");
  const cfg: SolanaChainConfig = config;

  const connection = () => new Connection(cfg.rpcUrl, "confirmed");

  return {
    network: "solana",
    family: "solana",

    async deriveAddress(index: number): Promise<DerivedAddress> {
      return {
        address: keypairFor(cfg, "deposit", index).publicKey.toBase58(),
        index,
        path: ed25519Path(cfg.coinType, "deposit", index),
      };
    },

    validateAddress(address: string): AddressCheck {
      const trimmed = address.trim();
      if (trimmed.length === 0) return { ok: false, reason: "Enter a Solana address." };
      if (trimmed.length < 32 || trimmed.length > 44) {
        return { ok: false, reason: "A Solana address is 32 to 44 characters." };
      }
      try {
        const key = new PublicKey(trimmed);
        // A valid-looking address that is not on the ed25519 curve is a program
        // derived address. Sending funds there makes them unspendable.
        if (!PublicKey.isOnCurve(key.toBytes())) {
          return {
            ok: false,
            reason: "That is a program address, not a wallet. Funds sent there cannot be spent.",
          };
        }
        return { ok: true, normalised: key.toBase58() };
      } catch {
        return { ok: false, reason: "That is not a valid Solana address — check for a typo." };
      }
    },

    async getHeight(): Promise<number> {
      return connection().getSlot();
    },

    async scanForDeposits(addresses, fromHeight): Promise<readonly SeenDeposit[]> {
      const rpc = connection();
      const tip = await rpc.getSlot();
      const found: SeenDeposit[] = [];
      const usdcMint = cfg.tokens.USDC;

      for (const address of addresses) {
        const owner = new PublicKey(address);

        // Native SOL, read from the account's own signature history.
        const signatures = await rpc.getSignaturesForAddress(owner, { limit: 25 });
        for (const entry of signatures) {
          if (entry.err) continue;
          if (entry.slot < fromHeight) continue;

          const tx = await rpc.getParsedTransaction(entry.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx?.meta) continue;

          const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
          const position = keys.indexOf(address);
          if (position === -1) continue;

          const before = BigInt(tx.meta.preBalances[position] ?? 0);
          const after = BigInt(tx.meta.postBalances[position] ?? 0);
          if (after > before) {
            found.push({
              chain: "solana",
              asset: "SOL",
              address,
              txHash: entry.signature,
              txIndex: 0,
              amount: after - before,
              blockHeight: entry.slot,
              confirmations: Math.max(0, tip - entry.slot),
            });
          }

          // SPL balances move in their own token accounts, reported separately.
          if (usdcMint) {
            for (const post of tx.meta.postTokenBalances ?? []) {
              if (post.owner !== address || post.mint !== usdcMint) continue;
              const pre = (tx.meta.preTokenBalances ?? []).find(
                (b) => b.accountIndex === post.accountIndex,
              );
              const delta =
                BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? "0");
              if (delta > 0n) {
                found.push({
                  chain: "solana",
                  asset: "USDC",
                  address,
                  txHash: entry.signature,
                  // Distinguished from the SOL leg of the same signature.
                  txIndex: post.accountIndex,
                  amount: delta,
                  blockHeight: entry.slot,
                  confirmations: Math.max(0, tip - entry.slot),
                });
              }
            }
          }
        }
      }

      return found;
    },

    async getConfirmations(txHash: string): Promise<number> {
      const rpc = connection();
      const status = await rpc.getSignatureStatus(txHash, { searchTransactionHistory: true });
      if (!status.value) return 0;
      if (status.value.err) return -1;
      if (status.value.confirmationStatus === "finalized") return 32;
      return status.value.confirmations ?? 0;
    },

    async buildAndSignWithdrawal(request: WithdrawalRequest): Promise<SignedTransfer> {
      const destination = this.validateAddress(request.to);
      if (!destination.ok) throw new Error(destination.reason);

      const rpc = connection();
      const payer = keypairFor(cfg, "hot", request.fromIndex);
      const recipient = new PublicKey(destination.normalised);
      const transaction = new Transaction();
      let fee = LAMPORTS_PER_SIGNATURE;

      if (request.asset === "SOL") {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient,
            lamports: request.amount,
          }),
        );
      } else {
        const mintAddress = cfg.tokens[request.asset];
        if (!mintAddress) {
          throw new Error(`Solana does not carry ${request.asset} in this network mode.`);
        }
        const mint = new PublicKey(mintAddress);
        const source = await getAssociatedTokenAddress(mint, payer.publicKey);
        const target = await getAssociatedTokenAddress(mint, recipient);

        // If the recipient has never held this token, its account does not
        // exist yet and the transfer would simply fail. KYRO creates it and
        // absorbs the rent rather than bouncing the withdrawal back.
        const exists = await getAccount(rpc, target).then(
          () => true,
          () => false,
        );
        if (!exists) {
          transaction.add(
            createAssociatedTokenAccountInstruction(payer.publicKey, target, recipient, mint),
          );
          fee += TOKEN_ACCOUNT_RENT;
        }

        transaction.add(
          createTransferCheckedInstruction(
            source,
            mint,
            target,
            payer.publicKey,
            request.amount,
            CRYPTO[request.asset].decimals,
          ),
        );
      }

      const { blockhash } = await rpc.getLatestBlockhash("finalized");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;
      transaction.sign(payer);

      const signature = transaction.signature;
      if (!signature) throw new Error("Solana transaction was not signed");

      return {
        raw: transaction.serialize().toString("base64"),
        hash: Buffer.from(signature).toString("base64url"),
        fee,
      };
    },

    async broadcast(signed: SignedTransfer): Promise<string> {
      return connection().sendRawTransaction(Buffer.from(signed.raw, "base64"), {
        skipPreflight: false,
        maxRetries: 3,
      });
    },

    async estimateNetworkFee(asset: CryptoCode): Promise<bigint> {
      if (asset === "SOL") return LAMPORTS_PER_SIGNATURE;
      throw new Error(
        `Live fee estimation for ${asset} on Solana needs a SOL price source. ` +
          "Use the sample fee provider until one is configured.",
      );
    },
  };
}
