import Link from "next/link";
import { ExchangeCalculator } from "@/components/exchange/ExchangeCalculator";
import { FeeReceipt } from "@/components/exchange/FeeReceipt";
import { StepSequence } from "@/components/exchange/StepSequence";
import { SupportAccordion } from "@/components/help/SupportAccordion";
import { LocationPlot } from "@/components/locations/LocationPlot";
import { LocationRow } from "@/components/locations/LocationRow";
import { MarketTape } from "@/components/markets/MarketTape";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { FAQ_ITEMS } from "@/content/faq";
import { counterClock, LOCATIONS } from "@/fixtures/locations";
import { buildQuote } from "@/lib/quote/engine";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  faqSchema,
  graph,
  organisationSchema,
  serviceSchema,
  supportedAssetsSchema,
  websiteSchema,
} from "@/lib/seo/structured-data";
import { requestNow } from "@/server/clock";
import { liveAnchors } from "@/server/prices/anchors";

/**
 * Rates move, so the page is regenerated rather than frozen at build time. The
 * quote itself carries an absolute expiry, so even a cached copy tells the
 * truth: an old one simply arrives already expired and offers a refresh.
 */
export const revalidate = 15;

const STEPS = [
  {
    title: "Create your exchange",
    body: "Pick a direction, enter an amount, choose the coin and network. The rate, the 4% fee and the network fee are all on screen before you commit to anything.",
    detail: "Takes about a minute. No account needed.",
  },
  {
    title: "Choose a location",
    body: "Pick the counter you want to use. You will see its hours, which directions it handles and how much cash it can pay out without notice.",
    detail: "Your order code arrives straight away.",
  },
  {
    title: "Pay or collect your cash",
    body: "Bring your ID and order code. Hand over the cash and the crypto is sent, or send the crypto and take the cash. Same fee either way.",
    detail: "Nothing is charged until you are at the counter.",
  },
];

export default async function HomePage() {
  // Primed before any quote is built on this page, so the ticker above the
  // calculator and the figure inside it can never disagree about a price.
  const anchors = await liveAnchors();
  const now = requestNow();
  const clock = counterClock(new Date(now));

  // The worked example on this page is a real quote from the same engine that
  // prices a real order — not a screenshot and not hand-written numbers.
  const example = buildQuote({
    direction: "cash-to-crypto",
    give: "1000",
    fiat: "EUR",
    asset: "BTC",
    network: "bitcoin",
    at: now,
  });

  const featured = LOCATIONS.filter((l) => l.serviceLevel !== "opening-soon").slice(0, 5);

  return (
    <>
      <JsonLd
        data={graph(
          organisationSchema(),
          websiteSchema(),
          serviceSchema(),
          supportedAssetsSchema(),
          faqSchema(),
        )}
      />

      {/* The tape sits above the hero rather than inside it: it answers the
          question people arrive with, and then gets out of the way. */}
      <MarketTape />

      {/* ── Hero: the calculator is the hero ──────────────────────────── */}
      {/* Splits at lg, not md: below 1024 the ticket needs the full column or
          its figures start fighting the receipt labels for room. */}
      <section className="shell pt-10 pb-14 md:pt-14 lg:pt-16 lg:pb-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-5 lg:pt-6">
            <p className="label-mono flex items-center gap-2 text-ink-muted">
              <span aria-hidden="true" className="mark-square" />
              Cash ↔ crypto exchange
            </p>

            <h1 className="mt-5 text-display">Cash to crypto. Crypto to cash.</h1>

            <p className="mt-5 max-w-[40ch] text-lead text-ink-muted">
              Walk into a counter in Sarajevo, Belgrade or Zagreb, hand over cash and
              leave with crypto. Or the other way round. See exactly what you&rsquo;ll
              get before you go.
            </p>

            <ul className="mt-8 space-y-3 border-t border-rule pt-6">
              <li className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.5rem]" />
                <p className="max-w-[42ch] text-small text-ink">
                  <strong className="font-medium">One fee, 4%.</strong>{" "}
                  <span className="text-ink-muted">
                    Charged on the cash side, shown in full before you commit, and not
                    changed afterwards.
                  </span>
                </p>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.5rem]" />
                <p className="max-w-[42ch] text-small text-ink">
                  <strong className="font-medium">Quotes hold for two minutes.</strong>{" "}
                  <span className="text-ink-muted">
                    When one expires you are shown the new figures before anything moves.
                  </span>
                </p>
              </li>
            </ul>
          </div>

          <div className="mx-auto w-full min-w-0 max-w-[30rem] lg:col-span-6 lg:col-start-7 lg:max-w-none">
            <ExchangeCalculator anchor={now} anchors={anchors} variant="hero" />
          </div>
        </div>
      </section>

      {/* ── 01 How it works ───────────────────────────────────────────── */}
      <Section
        id="how-it-works"
        index="01"
        title="Three steps, then you are done."
        lead="Choose a location. Complete your exchange. Done."
        aside={
          <ButtonLink href="/how-it-works" variant="secondary" size="sm">
            Read the detail
          </ButtonLink>
        }
      >
        <StepSequence steps={STEPS} />
      </Section>

      {/* ── 02 Locations ──────────────────────────────────────────────── */}
      <Section
        id="locations"
        index="02"
        title="Counters across the region."
        lead="Every branch lists its hours, the directions it handles and how much cash it keeps on hand."
        aside={
          <div className="space-y-4">
            <LocationPlot locations={LOCATIONS} />
            <ButtonLink href="/locations" variant="secondary" size="sm">
              All locations
            </ButtonLink>
          </div>
        }
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
          <p className="label-mono text-ink-faint">Sample locations</p>
          <p className="label-mono text-ink-faint">{LOCATIONS.length} counters</p>
        </div>
        <ul>
          {featured.map((location) => (
            <LocationRow key={location.slug} location={location} clock={clock} compact />
          ))}
        </ul>
        <p className="mt-4 text-micro text-ink-faint">
          Sample data. These branches are illustrative and not yet trading.
        </p>
      </Section>

      {/* ── 03 The fee ────────────────────────────────────────────────── */}
      <Section
        id="fees"
        index="03"
        title="One clear fee."
        lead={
          <>
            Four percent of the cash side. No spread in the rate, nothing added at the
            counter, no surprises.
          </>
        }
        aside={
          <ButtonLink href="/fees" variant="secondary" size="sm">
            How the fee is calculated
          </ButtonLink>
        }
        tone="sunk"
      >
        <div className="max-w-[34rem] rounded-[10px] border border-rule-strong bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <p className="label-mono text-ink-faint">Worked example</p>
            <p className="label-mono text-ink-faint">Cash → Crypto</p>
          </div>

          <div className="pt-4">
            {example.ok ? (
              <FeeReceipt quote={example.quote} />
            ) : (
              <p className="text-small text-ink-muted">
                Example unavailable — the calculator above still works.
              </p>
            )}
          </div>

          <p className="mt-5 border-t border-rule pt-4 text-micro text-ink-muted">
            Priced by the same engine that prices a real order. Rates are preview values
            and the network fee is a sample, both labelled wherever they appear.
          </p>
        </div>
      </Section>

      {/* ── 04 Order status ───────────────────────────────────────────── */}
      <Section
        id="status"
        index="04"
        title="You always know where it stands."
        lead="Six stages, in plain words, from the moment you create an order to the moment it is finished."
        aside={
          <ButtonLink href="/track" variant="secondary" size="sm">
            Track an order
          </ButtonLink>
        }
      >
        <div className="max-w-[34rem] rounded-[10px] border border-rule bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <p className="label-mono text-ink-faint">Example order</p>
            <p className="figure-num text-small">KYR-4H2N-8QX1</p>
          </div>
          <OrderTimeline
            className="pt-5"
            stages={[
              {
                key: "created",
                title: "Order created",
                body: "Your rate is locked and the counter has been told to expect you.",
                state: "done",
                at: "11:02",
              },
              {
                key: "identity",
                title: "Identity confirmed",
                body: "ID checked at the counter against the name on the order.",
                state: "done",
                at: "11:41",
              },
              {
                key: "waiting",
                title: "Waiting for exchange",
                body: "The cashier is counting and confirming your cash.",
                state: "current",
              },
              {
                key: "cash",
                title: "Cash received",
                body: "The counter has the money and the transfer is authorised.",
                state: "upcoming",
              },
              {
                key: "sent",
                title: "Crypto sent",
                body: "Broadcast to the network. You get the transaction ID here.",
                state: "upcoming",
              },
              {
                key: "complete",
                title: "Complete",
                body: "Confirmed on-chain and in your wallet.",
                state: "upcoming",
              },
            ]}
          />
        </div>
      </Section>

      {/* ── 05 Questions ──────────────────────────────────────────────── */}
      <Section
        id="questions"
        index="05"
        title="Questions people ask."
        lead={
          <>
            If yours is not here,{" "}
            <Link href="/help#contact" className="text-ink underline underline-offset-4">
              write to us
            </Link>{" "}
            and a person will answer.
          </>
        }
      >
        <SupportAccordion items={FAQ_ITEMS} />
      </Section>
    </>
  );
}
