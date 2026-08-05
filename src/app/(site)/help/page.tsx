import type { Metadata } from "next";
import Link from "next/link";
import { SupportAccordion } from "@/components/help/SupportAccordion";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { FAQ_ITEMS } from "@/content/faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqSchema, graph } from "@/lib/seo/structured-data";
import { KEY_FACTS } from "@/lib/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: "/help" },
  title: "Help",
  description:
    "How the 4% fee works, how long an exchange takes, what to bring to the counter, and how to reach a person.",
};

export default function HelpPage() {
  return (
    <>
      <JsonLd
        data={graph(
          faqSchema(KEY_FACTS),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Help", path: "/help" },
          ]),
        )}
      />

      <PageHeader
        eyebrow="Help"
        title="Questions people actually ask."
        lead="If the answer you need is not here, write to us. A person reads it."
        aside={
          <ButtonLink href="#contact" variant="secondary" size="md" full>
            Get in touch
          </ButtonLink>
        }
      />

      <Section index="01" title="Before you go." id="questions">
        <SupportAccordion items={FAQ_ITEMS} />
      </Section>

      <Section
        index="02"
        title="If something has gone wrong."
        lead="Three situations worth knowing about before they happen."
        id="problems"
        tone="sunk"
      >
        <div className="space-y-6">
          {[
            {
              t: "You sent to the wrong address",
              b: "Nobody can reverse a blockchain transfer — not KYRO, not the network, not the wallet you used. This is why the review step prints the address in full and asks you to check it. If the transfer has not been broadcast yet, tell the counter and it can be changed.",
            },
            {
              t: "You sent on the wrong network",
              b: "Tell us before you send if you are unsure. If it has already happened, contact us with the transaction ID: recovery is sometimes possible and sometimes not, and we will tell you honestly which it is rather than keep you waiting.",
            },
            {
              t: "Your quote expired on the way to the counter",
              b: "Nothing is lost. Quotes hold for two minutes on screen, but an order locks its rate when you confirm it. If an order itself expires before you arrive, the counter will re-quote you at the current rate and you can walk away if you do not like it.",
            },
          ].map((item) => (
            <div key={item.t} className="border-t border-rule pt-4">
              <h3 className="text-subhead font-medium">{item.t}</h3>
              <p className="mt-1.5 max-w-[62ch] text-small text-ink-muted">{item.b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        index="03"
        title="Reach a person."
        lead="No ticket numbers, no chatbot."
        id="contact"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-[10px] border border-rule-strong bg-white p-5">
            <h3 className="label-mono text-ink-faint">Email</h3>
            <p className="mt-2">
              <a
                href="mailto:help@kyro.example"
                className="figure-num text-subhead underline underline-offset-4"
              >
                help@kyro.example
              </a>
            </p>
            <p className="mt-2 text-small text-ink-muted">
              Include your order code if you have one. Replies within one working day.
            </p>
          </div>

          <div className="rounded-[10px] border border-rule bg-paper-sunk p-5">
            <h3 className="label-mono text-ink-faint">At the counter</h3>
            <p className="mt-2 text-body">
              Every branch can answer questions about an order in person.
            </p>
            <p className="mt-2 text-small text-ink-muted">
              <Link href="/locations" className="underline underline-offset-4">
                Find your nearest counter
              </Link>{" "}
              and its opening hours.
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-[62ch] text-micro text-ink-muted">
          KYRO is a preview build. The address above is a placeholder and the locations
          are sample data — nothing here takes real customer money yet.
        </p>
      </Section>
    </>
  );
}
