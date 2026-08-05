import Link from "next/link";
import type { SupportItem } from "@/components/help/SupportAccordion";

/**
 * The questions people actually ask at a counter, answered the way a person
 * would answer them. Shared by the homepage and /help so the two can never
 * drift apart.
 */

export const FAQ_ITEMS: readonly SupportItem[] = [
  {
    id: "fee",
    question: "How does the 4% fee work?",
    answer: (
      <>
        <p>
          KYRO takes 4% of the cash side of the exchange. On €1 000 that is €40, every
          time, whichever way the exchange runs. There is no spread hidden in the rate
          and no second fee at the counter.
        </p>
        <p className="mt-3">
          The network charges its own fee to move crypto, which is separate and shown on
          its own line. On cash to crypto KYRO pays it and deducts it from your payout.
          On crypto to cash your own wallet pays it when you send, so KYRO deducts
          nothing. <Link href="/fees" className="underline underline-offset-4">See the worked example</Link>.
        </p>
      </>
    ),
  },
  {
    id: "how-long",
    question: "How long does an exchange take?",
    answer: (
      <>
        <p>
          At the counter, a few minutes. The wait is the network, not us.
        </p>
        <p className="mt-3">
          Cash to crypto: once you have paid, the transfer is sent immediately and
          arrives when the network confirms it — about a minute on Base, Arbitrum, Tron
          or Solana, and up to twenty on Bitcoin. Crypto to cash: we wait for the agreed
          number of confirmations before the cash is ready, so send early if you are
          coming from far.
        </p>
      </>
    ),
  },
  {
    id: "bring",
    question: "What should I bring to the location?",
    answer: (
      <>
        <p>Your order code and photo ID. That is all.</p>
        <p className="mt-3">
          A passport, national ID card or driving licence all work. The order code is on
          your confirmation and on the order page — reading it out is enough, you do not
          need to print anything. If you are paying in cash, bring the exact amount on
          the ticket.
        </p>
      </>
    ),
  },
  {
    id: "assets",
    question: "Which cryptocurrencies are supported?",
    answer: (
      <>
        <p>Bitcoin, Ethereum, Tether, USD Coin and Solana.</p>
        <p className="mt-3">
          Which networks are available depends on the coin: Tether moves on Tron,
          Ethereum and Arbitrum; USD Coin on Base, Ethereum, Arbitrum and Solana. The
          calculator only offers combinations that actually work, and shows the network
          fee for each before you choose.
        </p>
      </>
    ),
  },
  {
    id: "wallet",
    question: "Can I change my wallet address?",
    answer: (
      <>
        <p>Until the crypto is sent, yes. After that, no — nobody can.</p>
        <p className="mt-3">
          You can edit the address at any point in the order flow, and at the counter
          before you pay. Once a transfer is broadcast it is final: a blockchain has no
          recall. This is why the review step shows the address in full, in mono, split
          into groups you can read out loud and check.
        </p>
      </>
    ),
  },
  {
    id: "track",
    question: "How do I track my order?",
    answer: (
      <>
        <p>
          With your order code, on the{" "}
          <Link href="/track" className="underline underline-offset-4">
            track page
          </Link>
          .
        </p>
        <p className="mt-3">
          It shows exactly which stage the order has reached and what happens next. No
          account is needed for an exchange — the code is enough.
        </p>
      </>
    ),
  },
];
