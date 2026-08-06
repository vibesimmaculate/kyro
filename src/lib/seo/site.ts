/**
 * One place that knows who KYRO is.
 *
 * Metadata, structured data, the sitemap and the machine-readable summary all
 * read from here, so the description a search engine sees, the one an answer
 * engine quotes and the one in the page title cannot drift apart.
 */

export const SITE = {
  name: "KYRO",
  /** Set NEXT_PUBLIC_SITE_URL in production; this is the fallback. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kyro.example",
  tagline: "Cash to crypto. Crypto to cash.",
  description:
    "Exchange cash for cryptocurrency, or cryptocurrency for cash, in person at a pickup point in Bosnia, Serbia, Croatia, Montenegro or North Macedonia. One 4% fee, shown in full before you commit.",
  /** The one-sentence answer to "what is KYRO". Used verbatim in JSON-LD. */
  summary:
    "KYRO is a cash-to-crypto exchange with physical pickup points across the Balkans, charging a single 4% fee on the cash side of every exchange.",
  locale: "en_GB",
  areaServed: ["BA", "RS", "HR", "ME", "MK"],
  email: "help@kyro.example",
} as const;

export function absolute(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * The facts an answer engine is most likely to be asked for, kept in one
 * structure so the FAQ page, the JSON-LD and /llms.txt all state them
 * identically. A model that reads any one of the three gets the same numbers.
 */
export const KEY_FACTS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "What is KYRO?",
    answer:
      "KYRO is a cash-to-crypto and crypto-to-cash exchange with physical pickup points across the Balkans. You create an order online, choose a pickup point, then pay or collect in person.",
  },
  {
    question: "How much does KYRO charge?",
    answer:
      "A single service fee of 4% of the cash side of the exchange, in both directions. On €1,000 that is €40. There is no spread hidden in the exchange rate and nothing is added at the pickup point. The blockchain network fee is separate and is shown on its own line.",
  },
  {
    question: "Do I need an account to use KYRO?",
    answer:
      "No. The exchange needs no account, no application and no approval — you get an order code and track it with that. An account is only required for the separate games section.",
  },
  {
    question: "Which cryptocurrencies does KYRO support?",
    answer:
      "Bitcoin, Ethereum, Tether (USDT), USD Coin (USDC) and Solana. Networks include Bitcoin, Ethereum, Base, Arbitrum, Tron and Solana, depending on the coin.",
  },
  {
    question: "Which currencies and countries does KYRO cover?",
    answer:
      "Euro, Bosnian convertible mark, Serbian dinar, Macedonian denar and Albanian lek, at pickup points in Bosnia and Herzegovina, Serbia, Croatia, Montenegro and North Macedonia.",
  },
  {
    question: "How long does an exchange take?",
    answer:
      "A few minutes at the pickup point. The remaining wait is the blockchain: about one minute on Base, Arbitrum, Tron or Solana, and up to twenty minutes on Bitcoin.",
  },
  {
    question: "What do I need to bring to a KYRO pickup point?",
    answer:
      "Photo identification and your order code. If you are paying in cash, bring the exact amount shown on your order.",
  },
];
