import type { Metadata } from "next";
import { StepSequence } from "@/components/exchange/StepSequence";
import { PageHeader } from "@/components/site/PageHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { REQUIRED_CONFIRMATIONS, TYPICAL_CONFIRMATION_MINUTES } from "@/lib/rates/network-fees";
import { NETWORKS, NETWORK_IDS } from "@/lib/money/currencies";

export const metadata: Metadata = {
  alternates: { canonical: "/how-it-works" },
  title: "How it works",
  description:
    "Create your exchange, choose a location, pay or collect your cash. Three steps and what happens at each one.",
};

const STEPS = [
  {
    title: "Create your exchange",
    body: "Choose a direction, enter an amount, pick the coin and the network. Everything is priced before you commit — the rate, the 4% fee and the network fee.",
    detail: "About a minute. No account needed.",
  },
  {
    title: "Choose a location",
    body: "Pick the counter that suits you. Hours, supported directions and the cash it can pay out without notice are listed for each one.",
    detail: "Your order code arrives immediately.",
  },
  {
    title: "Pay or collect your cash",
    body: "Bring your ID and order code. Hand over cash and the crypto is sent, or send crypto and take the cash. The fee is the same either way.",
    detail: "Nothing is charged until you are at the counter.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="Choose a location. Complete your exchange. Done."
        lead="No account, no application, no waiting for approval. The whole thing is meant to be simpler than booking a hotel room."
        aside={
          <ButtonLink href="/exchange" size="md" full>
            Start an exchange
          </ButtonLink>
        }
      />

      <Section index="01" title="The three steps." id="steps">
        <StepSequence steps={STEPS} />
      </Section>

      <Section
        index="02"
        title="Cash to crypto, in detail."
        lead="You bring the money. KYRO sends the coin."
        id="cash-to-crypto"
      >
        <ol className="space-y-6">
          {[
            {
              t: "You create the order and get a code",
              b: "The rate is fixed at the moment you confirm. It does not move while you travel to the counter.",
            },
            {
              t: "You give the counter your wallet address",
              b: "Entered when you create the order, and checked again on screen at the counter before anything is sent. Until the transfer is broadcast, you can change it.",
            },
            {
              t: "You pay the exact amount on the ticket",
              b: "In cash. The cashier counts it in front of you and confirms it against the order.",
            },
            {
              t: "KYRO broadcasts the transfer",
              b: "Immediately, to the network you chose. The transaction ID appears on your order page as soon as it exists.",
            },
            {
              t: "The network confirms it",
              b: "This is the only part nobody controls. Times differ by network — see below.",
            },
          ].map((item, i) => (
            <li key={item.t} className="flex gap-4 border-t border-rule pt-5 first:border-t-0 first:pt-0">
              <span className="section-index mt-1 flex-none text-ink" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-subhead font-medium">{item.t}</h3>
                <p className="mt-1 max-w-[58ch] text-small text-ink-muted">{item.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        index="03"
        title="Crypto to cash, in detail."
        lead="You send the coin. The counter has your money ready."
        id="crypto-to-cash"
        tone="sunk"
      >
        <ol className="space-y-6">
          {[
            {
              t: "You create the order and get a deposit address",
              b: "The address belongs to your order alone. Send from any wallet — the amount must match what the ticket says.",
            },
            {
              t: "You send the crypto",
              b: "Your own wallet pays the network fee for this transfer. KYRO does not deduct it, which is why it appears as a separate line rather than a smaller payout.",
            },
            {
              t: "KYRO waits for confirmations",
              b: "The cash is not released until the transfer is final. Send before you set off if you are travelling any distance.",
            },
            {
              t: "You collect the cash",
              b: "Bring your ID and order code. The counter counts it out in front of you.",
            },
          ].map((item, i) => (
            <li key={item.t} className="flex gap-4 border-t border-rule pt-5 first:border-t-0 first:pt-0">
              <span className="section-index mt-1 flex-none text-ink" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-subhead font-medium">{item.t}</h3>
                <p className="mt-1 max-w-[58ch] text-small text-ink-muted">{item.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        index="04"
        title="How long the network takes."
        lead="The counter takes minutes. The wait, when there is one, belongs to the blockchain."
        id="confirmations"
      >
        <ScrollArea label="Confirmations and typical wait by network">
          <table className="w-full min-w-[26rem] border-collapse text-small">
            <caption className="sr-only">
              Confirmations required and typical waiting time by network
            </caption>
            <thead>
              <tr className="border-b border-rule-strong">
                <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                  Network
                </th>
                <th scope="col" className="label-mono py-2 pe-4 text-end text-ink-faint">
                  Confirmations
                </th>
                <th scope="col" className="label-mono py-2 text-end text-ink-faint">
                  Typical wait
                </th>
              </tr>
            </thead>
            <tbody>
              {NETWORK_IDS.map((id) => (
                <tr key={id} className="border-b border-rule">
                  <th scope="row" className="py-3 pe-4 text-start font-medium">
                    {NETWORKS[id].name}
                    <span className="ms-2 font-normal text-ink-muted">{NETWORKS[id].note}</span>
                  </th>
                  <td className="figure-num py-3 pe-4 text-end">{REQUIRED_CONFIRMATIONS[id]}</td>
                  <td className="figure-num py-3 text-end">
                    ~{TYPICAL_CONFIRMATION_MINUTES[id]} min
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className="mt-4 max-w-[58ch] text-micro text-ink-muted">
          Typical, not guaranteed. A congested network takes longer and nobody — KYRO
          included — can speed it up.
        </p>
      </Section>
    </>
  );
}
