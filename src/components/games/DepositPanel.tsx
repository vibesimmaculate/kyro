"use client";

import { useActionState, useState } from "react";
import { CopyValue } from "@/components/orders/CopyValue";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { NETWORKS, NETWORK_IDS, type NetworkId } from "@/lib/money/currencies";
import { REQUIRED_CONFIRMATIONS } from "@/lib/rates/network-fees";
import { issueDepositAddress } from "@/server/wallet/actions";

/**
 * Deposits.
 *
 * One address per network, derived from the HD wallet and yours permanently —
 * so it can be saved in a wallet's address book rather than fetched again each
 * time. The warning about sending on the wrong network is stated plainly,
 * because it is the single most common way people lose money doing this.
 */
export function DepositPanel({
  addresses,
  disabled,
}: {
  readonly addresses: ReadonlyArray<{ chain: NetworkId; address: string }>;
  readonly disabled?: boolean;
}) {
  const [chain, setChain] = useState<NetworkId>("tron");
  const [state, action, pending] = useActionState(issueDepositAddress, {});

  const existing = addresses.find((a) => a.chain === chain);

  return (
    <section className="rounded-[10px] border border-night-rule-strong bg-night-raised p-5">
      <h2 className="text-subhead font-medium">Deposit</h2>
      <p className="mt-1.5 text-small text-night-muted">
        Send to the address below. It belongs to you and does not change.
      </p>

      <fieldset className="mt-5">
        <legend className="label-mono text-night-muted">Network</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NETWORK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setChain(id)}
              aria-pressed={chain === id}
              className={cn(
                "tap rounded-[6px] border px-3 text-small transition-colors",
                chain === id
                  ? "border-night-blue bg-night-blue/15 text-night-text"
                  : "border-night-rule-strong bg-night-sunk text-night-muted hover:text-night-text",
              )}
            >
              {NETWORKS[id].name}
            </button>
          ))}
        </div>
      </fieldset>

      {existing ? (
        <div className="mt-5">
          <CopyValue value={existing.address} label="Address" tone="night" />
          <p className="mt-3 border-s-2 border-night-amber ps-3 text-small text-night-muted">
            Send only on <span className="text-night-text">{NETWORKS[chain].name}</span>.
            Anything sent on another network arrives at an address nobody controls and
            cannot be recovered — by KYRO or by anyone.
          </p>
          <p className="mt-2 text-micro text-night-muted">
            Credited after {REQUIRED_CONFIRMATIONS[chain]} confirmations.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-5">
          <input type="hidden" name="chain" value={chain} />
          <Button type="submit" tone="night" size="lg" full disabled={disabled || pending}>
            {pending ? "Deriving…" : `Get my ${NETWORKS[chain].name} address`}
          </Button>
          {state.error ? (
            <p role="alert" className="mt-3 text-small text-night-amber">
              {state.error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
