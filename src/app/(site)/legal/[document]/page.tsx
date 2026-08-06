import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { SERVICE_FEE_BP } from "@/lib/quote/types";

/**
 * Terms and Privacy.
 *
 * The footer has linked to both of these on every page since the beginning and
 * neither existed, so every visit to either was a 404 — including from the
 * middle of the exchange flow, which is exactly where somebody checks.
 *
 * What these pages are not is a terms of service or a privacy policy. KYRO has
 * no legal entity, no licence and no counsel behind it yet, and publishing
 * something shaped like a legal instrument would be inventing one — the same
 * category of thing as an invented licence number, and the product has said
 * from the start that it will not do that.
 *
 * So each page says plainly that the document does not exist yet, and then
 * states what the software verifiably does, which is the part that is true
 * today and the part a visitor actually wants. Everything below is a claim that
 * can be checked against the code in this repository.
 */

const DOCUMENTS = {
  terms: {
    eyebrow: "Terms",
    title: "There are no terms yet.",
    lead: "KYRO is a preview. No company stands behind it, no licence has been issued to it, and nothing here is an offer to do business.",
    body: [
      {
        heading: "What that means for you",
        points: [
          "Nothing you do on this site creates a contract, because there is no counterparty able to enter one.",
          "The exchange flow will produce an order code and a receipt. Those are the software working, not a booking anybody is obliged to honour.",
          `The ${SERVICE_FEE_BP / 100}% fee, the network fee and the rate shown on a quote are all computed exactly as they would be in a live product. They are honest arithmetic on a service that is not yet trading.`,
          "The pickup points listed under Locations are sample data. No KYRO counter exists at any of those addresses.",
        ],
      },
      {
        heading: "The games",
        points: [
          "KYRO holds no gaming licence in any jurisdiction. The games section is not open to the public.",
          "Every game states its house edge on its own page — 1% — and every outcome is committed to by a published seed hash before the bet and can be recomputed afterwards by anyone.",
          "Demo mode is explicitly not provably fair, because your own browser generates both seeds. The banner on every demo board says so.",
        ],
      },
      {
        heading: "When this changes",
        points: [
          "Real terms will be published here before anyone can exchange real money at a real pickup point, and they will be dated.",
          "Until then, treating this page as a legal document would be a mistake, and pretending otherwise would be the first dishonest thing on the site.",
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "No privacy policy yet — here is what the software does.",
    lead: "A policy is a promise made by an organisation, and there is not one yet. What can be stated today is exactly what this software collects and why, which is checkable against the source.",
    body: [
      {
        heading: "What the exchange collects",
        points: [
          "An email address, at the point you ask for an order code, so the code can be sent to you. Nothing else about you is asked for.",
          "The exchange needs no account. There is no password, no profile and no tracking of who you are between visits.",
          "Your in-progress order is held in a cookie so the flow survives a refresh. It contains the choices you made — amount, asset, network, pickup point — and no identifiers beyond the order itself.",
          "A wallet address, when you give one, because the crypto has to be sent somewhere. It is stored against the order and used for that.",
        ],
      },
      {
        heading: "What it does not do",
        points: [
          "There is no analytics script, no advertising pixel, no session recorder and no third-party tag anywhere on this site.",
          "Prices come from a public market feed. That request is made by KYRO's server, not by your browser, so the feed never sees you.",
          "Nothing is sold, shared or brokered, because there is nobody to sell it to and no arrangement to do so.",
        ],
      },
      {
        heading: "The games, which are different",
        points: [
          "Playing requires an account, because real balances need an age check and limits attached to a person.",
          "That account holds an email address, an age confirmation, the limits you set and your own game history — the seeds and nonces that make each round verifiable.",
          "Demo mode stores its balance in your browser and sends nothing anywhere.",
        ],
      },
    ],
  },
} as const;

type DocumentId = keyof typeof DOCUMENTS;

const isDocument = (value: string): value is DocumentId => value in DOCUMENTS;

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  if (!isDocument(document)) return {};
  const meta = DOCUMENTS[document];

  return {
    alternates: { canonical: `/legal/${document}` },
    title: meta.eyebrow,
    description: meta.lead,
    // Not indexed: an "our terms" result that turns out to say there are no
    // terms is a worse search result than none at all.
    robots: { index: false, follow: true },
  };
}

export default async function LegalPage({
  params,
}: {
  readonly params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  if (!isDocument(document)) notFound();
  const meta = DOCUMENTS[document];

  return (
    <>
      <PageHeader eyebrow={meta.eyebrow} title={meta.title} lead={meta.lead} />

      {meta.body.map((section, index) => (
        <Section
          key={section.heading}
          index={String(index + 1).padStart(2, "0")}
          title={section.heading}
        >
          <ul className="grid max-w-[68ch] gap-3">
            {section.points.map((point) => (
              <li key={point} className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.55rem] flex-none" />
                <span className="text-ink-muted">{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section index={String(meta.body.length + 1).padStart(2, "0")} title="Questions">
        <p className="max-w-[60ch] text-ink-muted">
          The{" "}
          <Link href="/help" className="text-ink underline underline-offset-4">
            help page
          </Link>{" "}
          answers what people actually ask, and{" "}
          <Link href="/fees" className="text-ink underline underline-offset-4">
            fees
          </Link>{" "}
          works the 4% through with real numbers in both directions.
        </p>
      </Section>
    </>
  );
}
