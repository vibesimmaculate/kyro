import "server-only";

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CRYPTO, type CryptoCode, type NetworkId } from "@/lib/money/currencies";
import { chainConfig, type EvmChainConfig } from "./config";
import { derivePrivateKey, derivationPath } from "./keys";
import type {
  AddressCheck,
  ChainAdapter,
  DerivedAddress,
  SeenDeposit,
  SignedTransfer,
  WithdrawalRequest,
} from "./types";

/**
 * Ethereum, Base and Arbitrum.
 *
 * One adapter for all three: same address format, same signing, same ERC-20
 * semantics. Only the chain id, the RPC and the token contracts differ, and
 * those come from configuration.
 */

const ERC20 = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/** Public RPCs cap `eth_getLogs` ranges; 2 000 blocks is comfortably inside. */
const MAX_LOG_RANGE = 2_000n;

function client(config: EvmChainConfig): PublicClient {
  return createPublicClient({
    transport: http(config.rpcUrl, { batch: true, retryCount: 2 }),
  }) as PublicClient;
}

export function createEvmAdapter(network: NetworkId): ChainAdapter {
  const config = chainConfig(network);
  if (config.family !== "evm") {
    throw new Error(`${network} is not an EVM chain`);
  }

  const publicClient = () => client(config);

  return {
    network,
    family: "evm",

    async deriveAddress(index: number): Promise<DerivedAddress> {
      const key = derivePrivateKey(config.coinType, "deposit", index);
      const account = privateKeyToAccount(`0x${Buffer.from(key).toString("hex")}`);
      return {
        address: account.address,
        index,
        path: derivationPath(config.coinType, "deposit", index),
      };
    },

    validateAddress(address: string): AddressCheck {
      const trimmed = address.trim();
      if (!trimmed.startsWith("0x")) {
        return { ok: false, reason: "An Ethereum-style address starts with 0x." };
      }
      if (trimmed.length !== 42) {
        return {
          ok: false,
          reason: `That address is ${trimmed.length} characters. It should be 42.`,
        };
      }
      if (!isAddress(trimmed, { strict: false })) {
        return { ok: false, reason: "That is not a valid address — check for a typo." };
      }
      // A mixed-case address carries an EIP-55 checksum. If it fails, a
      // character has been altered and the funds would be unrecoverable.
      const hasMixedCase = /[a-f]/.test(trimmed.slice(2)) && /[A-F]/.test(trimmed.slice(2));
      if (hasMixedCase) {
        try {
          getAddress(trimmed);
        } catch {
          return {
            ok: false,
            reason: "That address fails its checksum. One character is wrong — paste it again.",
          };
        }
      }
      return { ok: true, normalised: getAddress(trimmed.toLowerCase()) };
    },

    async getHeight(): Promise<number> {
      return Number(await publicClient().getBlockNumber());
    },

    async scanForDeposits(addresses, fromHeight, toHeight): Promise<readonly SeenDeposit[]> {
      if (addresses.length === 0) return [];
      const rpc = publicClient();
      const tip = BigInt(toHeight);
      const watched = new Set(addresses.map((a) => a.toLowerCase()));
      const found: SeenDeposit[] = [];

      // ── ERC-20 transfers, read from logs ──────────────────────────────
      const tokenEntries = Object.entries(config.tokens) as Array<[CryptoCode, `0x${string}`]>;
      if (tokenEntries.length > 0) {
        for (let start = BigInt(fromHeight); start <= tip; start += MAX_LOG_RANGE) {
          const end = start + MAX_LOG_RANGE - 1n > tip ? tip : start + MAX_LOG_RANGE - 1n;

          const logs = await rpc.getLogs({
            address: tokenEntries.map(([, contract]) => contract),
            event: ERC20[0],
            fromBlock: start,
            toBlock: end,
          });

          const parsed = parseEventLogs({ abi: ERC20, logs, eventName: "Transfer" });
          for (const log of parsed) {
            const to = log.args.to.toLowerCase();
            if (!watched.has(to)) continue;

            const entry = tokenEntries.find(
              ([, contract]) => contract.toLowerCase() === log.address.toLowerCase(),
            );
            if (!entry) continue;

            found.push({
              chain: network,
              asset: entry[0],
              address: getAddress(log.args.to),
              txHash: log.transactionHash,
              txIndex: log.logIndex,
              amount: log.args.value,
              blockHeight: Number(log.blockNumber),
              confirmations: Number(tip - log.blockNumber) + 1,
            });
          }
        }
      }

      // ── Native ETH, read from blocks ──────────────────────────────────
      //
      // Value transfers leave no log, so there is nothing to filter on: the
      // blocks have to be walked. Public RPCs make this slow over a wide range,
      // which is why the watcher advances its cursor steadily rather than
      // rescanning history.
      const span = Number(tip) - fromHeight;
      if (span >= 0 && span <= 400) {
        for (let height = fromHeight; height <= Number(tip); height += 1) {
          const block = await rpc.getBlock({
            blockNumber: BigInt(height),
            includeTransactions: true,
          });
          for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || tx.value === 0n) continue;
            if (!watched.has(tx.to.toLowerCase())) continue;
            found.push({
              chain: network,
              asset: "ETH",
              address: getAddress(tx.to),
              txHash: tx.hash,
              // Logs own the log-index space; native transfers are marked -1 so
              // the two can never collide on the (hash, index) uniqueness key.
              txIndex: -1,
              amount: tx.value,
              blockHeight: height,
              confirmations: Number(tip) - height + 1,
            });
          }
        }
      }

      return found;
    },

    async getConfirmations(txHash: string): Promise<number> {
      const rpc = publicClient();
      try {
        const receipt = await rpc.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (receipt.status === "reverted") return -1;
        const tip = await rpc.getBlockNumber();
        return Number(tip - receipt.blockNumber) + 1;
      } catch {
        return 0;
      }
    },

    async buildAndSignWithdrawal(request: WithdrawalRequest): Promise<SignedTransfer> {
      const key = derivePrivateKey(config.coinType, "hot", request.fromIndex);
      const account = privateKeyToAccount(`0x${Buffer.from(key).toString("hex")}`);
      const rpc = publicClient();

      const to = getAddress(request.to);
      const token = config.tokens[request.asset];

      const wallet = createWalletClient({
        account,
        transport: http(config.rpcUrl),
      });

      const nonce = await rpc.getTransactionCount({ address: account.address, blockTag: "pending" });
      const fees = await rpc.estimateFeesPerGas();

      const base = {
        account,
        chain: null,
        nonce,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      } as const;

      const call = token
        ? {
            ...base,
            to: token,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC20,
              functionName: "transfer",
              args: [to, request.amount],
            }),
          }
        : { ...base, to, value: request.amount, data: undefined };

      const gas = await rpc.estimateGas({
        account: account.address,
        to: call.to,
        value: call.value,
        data: call.data,
      });

      const raw = await wallet.signTransaction({ ...call, gas, chainId: config.chainId });

      // The hash of a signed transaction is knowable before it is broadcast,
      // which lets the withdrawal row record it before the network sees it —
      // so a broadcast that times out is still traceable rather than lost.
      const { keccak256 } = await import("viem");
      return { raw, hash: keccak256(raw), fee: gas * (fees.maxFeePerGas ?? 0n) };
    },

    async broadcast(signed: SignedTransfer): Promise<string> {
      return publicClient().sendRawTransaction({
        serializedTransaction: signed.raw as `0x${string}`,
      });
    },

    async estimateNetworkFee(asset: CryptoCode): Promise<bigint> {
      const rpc = publicClient();
      const fees = await rpc.estimateFeesPerGas();
      const gasPrice = fees.maxFeePerGas ?? 0n;
      // A plain transfer costs 21 000; an ERC-20 transfer is nearer 65 000.
      const gas = config.tokens[asset] ? 65_000n : 21_000n;
      const weiCost = gas * gasPrice;

      if (asset === "ETH") return weiCost;

      // For a token the fee is paid in ETH but quoted in the token, so it has
      // to cross assets. Without a price oracle here that would be a guess, and
      // a guess in a fee line is exactly the kind of thing this product does
      // not do — the sample table is used instead and labelled as such.
      const decimals = CRYPTO[asset].decimals;
      void formatUnits(weiCost, 18);
      void decimals;
      throw new Error(
        `Live fee estimation for ${asset} on ${network} needs a price source. ` +
          "Use the sample fee provider until one is configured.",
      );
    },
  };
}
