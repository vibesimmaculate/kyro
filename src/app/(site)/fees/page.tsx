import type { Metadata } from "next";
import { FeeReceipt } from "@/components/exchange/FeeReceipt";
import { PageHeader } from "@/components/site/PageHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { CRYPTO, NETWORKS } from "@/lib/money/currencies";
import { formatCrypto, formatMoney } from "@/lib/money/format";
import { applyBasisPoints, parseMoney, subMoney } from "@/lib/money/amounts";
import { buildQuote } from "@/lib/quote/engine";
import { SERVICE_FEE_BP } from "@/lib/quote/types";
import { sampleNetworkFeeProvider } from "@/lib/rates/network-fees";
import { requestNow } from "@/server/clock";

export const revalidate = 15;

export const metadata: Metadata = {
  alternates: { canonical: "/fees" },
  title: "Fees",
  description:
    "One fee: 4% of the cash side of the exchange. Worked through with real numbers, plus the network fee shown separately.",
};

const LADDER = ["100", "500", "1000", "5000", "10000"] as const;

export default function FeesPage() {
  const now = requestNow();

  const example = buildQuote({
    direction: "cash-to-crypto",
    give: "1000",
    fiat: "EUR",
    asset: "BTC",
    network: "bitcoin",
    at: now,
  });

  const reverse = buildQuote({
    direction: "crypto-to-cash",
    give: "1000",
    fiat: "EUR",
    asset: "USDT",
    network: "tron",
    at: now,
  });

  return (
    <>
      <PageHeader
        eyebrow="Fees"
        title="One clear fee."
        lead={
          <>
            KYRO charges 4% of the cash side of every exchange. That is the whole
            commercial arrangement. The rate you are quoted is the rate — there is no
            spread hidden inside it, and nothing is added at the counter.
          </>
        }
        aside={
          <div className="rounded-[10px] border border-rule-strong bg-white p-4">
            <p className="label-mono text-ink-faint">Service fee</p>
            <p className="figure-num mt-1 text-[2.5rem] leading-none">4%</p>
            <p className="mt-2 text-small text-ink-muted">
              Of the cash side, in both directions.
            </p>
          </div>
        }
      />

      <Section
        index="01"
        title="€1 000, worked through."
        lead="Cash in, bitcoin out. Every line that affects what you walk away with."
        id="example"
      >
        <div className="max-w-[36rem] rounded-[10px] border border-rule-strong bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <p className="label-mono text-ink-faint">Cash → Crypto</p>
            <p className="label-mono text-ink-faint">EUR → BTC · Bitcoin</p>
          </div>
          <div className="pt-4">
            {example.ok ? (
              <FeeReceipt quote={example.quote} />
            ) : (
              <p className="text-small text-ink-muted">Example unavailable.</p>
            )}
          </div>
        </div>

        <div className="mt-6 max-w-[36rem] rounded-[10px] border border-rule bg-paper-sunk p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <p className="label-mono text-ink-faint">Crypto → Cash</p>
            <p className="label-mono text-ink-faint">USDT → EUR · Tron</p>
          </div>
          <div className="pt-4">
            {reverse.ok ? (
              <FeeReceipt quote={reverse.quote} />
            ) : (
              <p className="text-small text-ink-muted">Example unavailable.</p>
            )}
          </div>
        </div>

        <p className="mt-4 max-w-[58ch] text-micro text-ink-muted">
          Both are produced by the same engine that prices a real order. Rates are
          preview values and network fees are samples — labelled as such wherever they
          appear, here and in the calculator.
        </p>
      </Section>

      <Section
        index="02"
        title="The fee at every size."
        lead="Four percent is four percent. Nothing steps, nothing tiers, nothing gets cheaper if you know someone."
        id="ladder"
        tone="sunk"
      >
        <ScrollArea
          label="Service fee by exchange amount"
          className="rounded-[10px] border border-rule bg-white"
        >
          <table className="w-full min-w-[24rem] border-collapse text-small">
            <caption className="sr-only">Service fee by exchange amount, in euro</caption>
            <thead>
              <tr className="border-b border-rule-strong">
                <th scope="col" className="label-mono px-4 py-3 text-start text-ink-faint">
                  You exchange
                </th>
                <th scope="col" className="label-mono px-4 py-3 text-end text-ink-faint">
                  Service fee
                </th>
                <th scope="col" className="label-mono px-4 py-3 text-end text-ink-faint">
                  Converted
                </th>
              </tr>
            </thead>
            <tbody>
              {LADDER.map((amount) => {
                const gross = parseMoney(amount, "EUR");
                const fee = applyBasisPoints(gross, SERVICE_FEE_BP);
                const net = subMoney(gross, fee);
                return (
                  <tr key={amount} className="border-b border-rule last:border-b-0">
                    <th scope="row" className="figure-num px-4 py-3 text-start font-normal">
                      {formatMoney(gross)}
                    </th>
                    <td className="figure-num px-4 py-3 text-end">{formatMoney(fee)}</td>
                    <td className="figure-num px-4 py-3 text-end text-ink-muted">
                      {formatMoney(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </Section>

      <Section
        index="03"
        title="The network fee is not ours."
        lead="Moving crypto costs something. That cost belongs to the network, and KYRO shows it on its own line rather than burying it."
        id="network"
      >
        <ScrollArea
          label="Sample network fee by asset and network"
          className="rounded-[10px] border border-rule bg-white"
        >
          <table className="w-full min-w-[28rem] border-collapse text-small">
            <caption className="sr-only">Sample network fee by asset and network</caption>
            <thead>
              <tr className="border-b border-rule-strong">
                <th scope="col" className="label-mono px-4 py-3 text-start text-ink-faint">
                  Asset
                </th>
                <th scope="col" className="label-mono px-4 py-3 text-start text-ink-faint">
                  Network
                </th>
                <th scope="col" className="label-mono px-4 py-3 text-end text-ink-faint">
                  Sample fee
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.values(CRYPTO).flatMap((asset) =>
                asset.networks.map((network, i) => (
                  <tr key={`${asset.code}-${network}`} className="border-b border-rule last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-start font-normal">
                      {i === 0 ? (
                        <span className="font-medium">{asset.code}</span>
                      ) : (
                        <span className="text-ink-faint">{asset.code}</span>
                      )}
                    </th>
                    <td className="px-4 py-3">{NETWORKS[network].name}</td>
                    <td className="figure-num px-4 py-3 text-end">
                      {formatCrypto(sampleNetworkFeeProvider.getFee(asset.code, network), {
                        minFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </ScrollArea>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="border-t border-rule pt-4">
            <h3 className="text-subhead font-medium">Cash → crypto</h3>
            <p className="mt-1.5 text-small text-ink-muted">
              KYRO pays the network fee to send your coin, and deducts it from the
              payout. It is a line on your receipt, not a surprise.
            </p>
          </div>
          <div className="border-t border-rule pt-4">
            <h3 className="text-subhead font-medium">Crypto → cash</h3>
            <p className="mt-1.5 text-small text-ink-muted">
              Your own wallet pays to send. KYRO deducts nothing, so the line is shown
              for information — your wallet will charge you a little on top.
            </p>
          </div>
        </div>
      </Section>

      <Section
        index="04"
        title="How the rounding works."
        lead="Stated because it is the sort of thing that should be stated."
        id="rounding"
        tone="sunk"
      >
        <div className="max-w-[58ch] space-y-5">
          <div className="border-t border-rule pt-4">
            <h3 className="text-subhead font-medium">Fees round up at the half</h3>
            <p className="mt-1.5 text-small text-ink-muted">
              The 4% is calculated in whole minor units — cents, fenings — and a value
              landing exactly on a half rounds away from zero. On €12 345.67 the fee is
              €493.83, not €493.82.
            </p>
          </div>
          <div className="border-t border-rule pt-4">
            <h3 className="text-subhead font-medium">Crypto payouts round down</h3>
            <p className="mt-1.5 text-small text-ink-muted">
              Always down, never up, to the precision KYRO quotes at — eight places for
              bitcoin, six for ether, two for the stablecoins. The number printed on
              your ticket is exactly the number that arrives. KYRO never quotes a figure
              it would then have to shave.
            </p>
          </div>
          <div className="border-t border-rule pt-4">
            <h3 className="text-subhead font-medium">Cash is rounded to what exists</h3>
            <p className="mt-1.5 text-small text-ink-muted">
              Dinar, denar and lek are quoted whole, because para, deni and qindarka are
              not in circulation and a cashier cannot hand you one. Euro and convertible
              mark are quoted to two places.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ButtonLink href="/exchange">See it on your own amount</ButtonLink>
        </div>
      </Section>
    </>
  );
}
