"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount } from "@/lib/money/amounts";
import { CRYPTO, NETWORKS, type CryptoCode } from "@/lib/money/currencies";
import { formatCrypto } from "@/lib/money/format";
import { submitWithdrawal } from "@/server/wallet/actions";

const field = cn(
  "tap w-full rounded-[8px] border border-night-rule-strong bg-night-sunk px-3 py-2.5",
  "text-body text-night-text outline-none transition-colors",
  "placeholder:text-night-muted focus:border-night-blue",
);

/**
 * Withdrawals.
 *
 * The address is validated for the chosen network before anything is signed,
 * and larger amounts are held for a person to approve. Both facts are stated on
 * the form rather than discovered afterwards.
 */
export function WithdrawForm({
  balances,
  disabled,
}: {
  readonly balances: ReadonlyArray<readonly [CryptoCode, bigint]>;
  readonly disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(submitWithdrawal, {});
  const [asset, setAsset] = useState<CryptoCode>("USDT");

  const available = balances.find(([code]) => code === asset)?.[1] ?? 0n;
  const networks = CRYPTO[asset].networks;
  const [network, setNetwork] = useState(networks[0] ?? "tron");

  return (
    <section className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <h2 className="text-subhead font-medium">Withdraw</h2>
      <p className="mt-1.5 text-small text-night-muted">
        Sent from the hot wallet on the next run of the payout job.
      </p>

      <form action={action} className="mt-5">
        <div>
          <label htmlFor="asset" className="label-mono block text-night-muted">
            Asset
          </label>
          <select
            id="asset"
            name="asset"
            value={asset}
            onChange={(event) => {
              const next = event.target.value as CryptoCode;
              setAsset(next);
              setNetwork(CRYPTO[next].networks[0] ?? "tron");
            }}
            className={`${field} mt-2`}
          >
            {(Object.keys(CRYPTO) as CryptoCode[]).map((code) => (
              <option key={code} value={code}>
                {code} — {CRYPTO[code].name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-micro text-night-muted">
            Available{" "}
            <span className="figure-num">{formatCrypto(cryptoAmount(available, asset))}</span>
          </p>
        </div>

        <div className="mt-4">
          <label htmlFor="network" className="label-mono block text-night-muted">
            Network
          </label>
          <select
            id="network"
            name="network"
            value={network}
            onChange={(event) => setNetwork(event.target.value as typeof network)}
            className={`${field} mt-2`}
          >
            {networks.map((id) => (
              <option key={id} value={id}>
                {NETWORKS[id].name} — {NETWORKS[id].note}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="address" className="label-mono block text-night-muted">
            Send to
          </label>
          <input
            id="address"
            name="address"
            required
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            placeholder={network === "bitcoin" ? "bc1…" : network === "tron" ? "T…" : "0x…"}
            className={`${field} figure-num mt-2 text-small`}
          />
          <p className="mt-1.5 text-micro text-night-muted">
            Checked against {NETWORKS[network].name} before anything is signed. A blockchain
            transfer cannot be recalled.
          </p>
        </div>

        <div className="mt-4">
          <label htmlFor="amount" className="label-mono block text-night-muted">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="0"
            className={`${field} figure-num mt-2`}
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-[8px] border border-night-red/40 bg-night-red/10 px-3 py-2.5 text-small"
          >
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p
            role="status"
            className="mt-4 rounded-[8px] border border-night-green/40 bg-night-green/10 px-3 py-2.5 text-small"
          >
            {state.notice}
          </p>
        ) : null}

        <Button
          type="submit"
          tone="night"
          size="lg"
          full
          disabled={disabled || pending || available <= 0n}
          className="mt-5"
        >
          {pending ? "Requesting…" : "Request withdrawal"}
        </Button>

        <p className="mt-3 text-micro text-night-muted">
          Larger withdrawals are held for a person to approve. Your balance is reserved the
          moment you request one, so it cannot be staked while it waits.
        </p>
      </form>
    </section>
  );
}
