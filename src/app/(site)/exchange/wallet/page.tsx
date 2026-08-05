import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Field, monoInputClass } from "@/components/exchange/Field";
import { FlowShell } from "@/components/exchange/FlowShell";
import { StepForm } from "@/components/exchange/StepForm";
import { CRYPTO, NETWORKS, networksFor } from "@/lib/money/currencies";
import { buildQuote } from "@/lib/quote/engine";
import { formatCrypto } from "@/lib/money/format";
import { sampleNetworkFeeProvider } from "@/lib/rates/network-fees";
import { submitWallet } from "@/server/exchange/actions";
import { readDraft } from "@/server/exchange/draft";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet and network" };

const ADDRESS_HINT: Record<string, string> = {
  bitcoin: "Starts with bc1, or 1 or 3 for an older wallet.",
  ethereum: "Starts with 0x, 42 characters.",
  base: "Starts with 0x, 42 characters.",
  arbitrum: "Starts with 0x, 42 characters.",
  tron: "Starts with T, 34 characters.",
  solana: "32 to 44 characters, no prefix.",
};

export default async function WalletPage() {
  const draft = await readDraft();
  if (!draft || !draft.done.includes("details")) redirect("/exchange");

  const priced = buildQuote({
    direction: draft.direction,
    give: draft.amount,
    fiat: draft.fiat,
    asset: draft.asset,
    network: draft.network,
    at: requestNow(),
  });
  if (!priced.ok) redirect("/exchange");

  const cashToCrypto = draft.direction === "cash-to-crypto";
  const networks = networksFor(draft.asset);

  return (
    <FlowShell
      step={2}
      completed={draft.done}
      title={cashToCrypto ? "Where should the crypto go?" : "Which network will you send on?"}
      lead={
        cashToCrypto
          ? "Paste the address from your own wallet. Check it twice — once a transfer is broadcast, nobody can bring it back."
          : "Pick the network you will send from. Your deposit address is issued once the order exists, and it only accepts this network."
      }
      quote={priced.quote}
      locationSlug={draft.location}
    >
      <StepForm
        action={submitWallet}
        submitLabel="Continue"
        backHref="/exchange/details"
        backLabel="Back to details"
        footnote={
          cashToCrypto
            ? "You can still change this at the counter, right up until the transfer is sent."
            : "Sending on a different network than the one chosen here can lose the funds permanently."
        }
      >
        <fieldset>
              <legend className="label-mono text-ink-muted">Network</legend>
              <p className="mt-1.5 text-small text-ink-muted">
                {CRYPTO[draft.asset].name} moves on{" "}
                {networks.length === 1 ? "one network" : `${networks.length} networks`}. The
                fee differs between them.
              </p>

              <div className="mt-3 space-y-2">
                {networks.map((network) => {
                  const fee = sampleNetworkFeeProvider.getFee(draft.asset, network.id);
                  return (
                    <label
                      key={network.id}
                      className="tap flex cursor-pointer items-start gap-3 rounded-[8px] border border-rule-strong bg-white p-3 transition-colors hover:border-ink/40 has-[:checked]:border-blue has-[:checked]:bg-blue-wash"
                    >
                      <input
                        type="radio"
                        name="network"
                        value={network.id}
                        defaultChecked={network.id === draft.network}
                        className="mt-1 h-4 w-4 flex-none accent-[var(--color-blue)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{network.name}</span>
                          <span className="figure-num text-small text-ink-muted">
                            {formatCrypto(fee)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-small text-ink-muted">
                          {network.note} · {ADDRESS_HINT[network.id]}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {cashToCrypto ? (
              <Field
                id="walletAddress"
                label={`Your ${draft.asset} address`}
                hint="Paste it rather than typing it. A single wrong character sends the money somewhere nobody can reach."
                className="mt-8"
              >
                <input
                  id="walletAddress"
                  name="walletAddress"
                  type="text"
                  required
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="none"
                  defaultValue={draft.walletAddress ?? ""}
                  placeholder={
                    draft.network === "bitcoin"
                      ? "bc1…"
                      : draft.network === "tron"
                        ? "T…"
                        : draft.network === "solana"
                          ? "…"
                          : "0x…"
                  }
                  aria-describedby="walletAddress-hint"
                  className={monoInputClass}
                />
              </Field>
            ) : (
              <div className="mt-8 rounded-[8px] border border-rule bg-paper-sunk p-4">
                <p className="label-mono text-ink-faint">What happens next</p>
                <p className="mt-2 text-small text-ink-muted">
                  When you confirm the order, KYRO issues a deposit address that belongs to
                  this order alone, on {NETWORKS[draft.network].name}. Send the exact amount
                  shown, then collect your cash once it confirms.
                </p>
              </div>
            )}
      </StepForm>
    </FlowShell>
  );
}
