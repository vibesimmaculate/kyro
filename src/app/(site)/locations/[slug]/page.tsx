import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationMap } from "@/components/locations/LocationMap";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  availabilityOf,
  COUNTRIES,
  pickupClock,
  LOCATIONS,
  sampleLocationProvider,
  summariseHours,
  type Availability,
} from "@/fixtures/locations";
import { CRYPTO, FIAT } from "@/lib/money/currencies";
import { formatMoney } from "@/lib/money/format";
import { parseMoney } from "@/lib/money/amounts";
import { requestDate } from "@/server/clock";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, graph, locationSchema } from "@/lib/seo/structured-data";

export const revalidate = 60;

export function generateStaticParams() {
  return LOCATIONS.map((location) => ({ slug: location.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const location = sampleLocationProvider.bySlug(slug);
  if (!location) return { title: "Location not found" };
  return {
    alternates: { canonical: `/locations/${location.slug}` },
    title: `${location.city} — ${location.branch}`,
    description: `KYRO pickup point at ${location.street}, ${location.city}. Opening hours, supported exchange directions and cash limits.`,
  };
}

const MARK: Record<Availability["state"], string> = {
  open: "bg-green",
  "closing-soon": "bg-amber",
  closed: "bg-ink-faint",
  "opening-soon": "bg-blue",
};

export default async function LocationPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const location = sampleLocationProvider.bySlug(slug);
  if (!location) notFound();

  const clock = pickupClock(requestDate());
  const availability = availabilityOf(location, clock);
  const hours = summariseHours(location.hours);
  const country = COUNTRIES[location.country];
  const both = location.directions.length === 2;
  const primaryCurrency = location.currencies[0] ?? country.currency;
  const nearby = LOCATIONS.filter(
    (l) => l.slug !== location.slug && l.country === location.country,
  ).slice(0, 3);

  return (
    <div className="shell py-10 md:py-14">
      <JsonLd
        data={graph(
          locationSchema(location),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations" },
            { name: `${location.city} — ${location.branch}`, path: `/locations/${location.slug}` },
          ]),
        )}
      />

      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
          <li>
            <Link href="/locations" className="transition-colors hover:text-ink">
              Locations
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/locations?country=${location.country}`}
              className="transition-colors hover:text-ink"
            >
              {country.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink">{location.branch}</li>
        </ol>
      </nav>

      <div className="grid gap-10 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-7">
          <p className="label-mono text-ink-muted">{location.city}</p>
          <h1 className="mt-3 text-title">{location.branch}</h1>

          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-lead text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 flex-none", MARK[availability.state])}
              />
              <span className="text-ink">{availability.label}</span>
            </span>
            <span aria-hidden="true" className="text-rule-strong">
              ·
            </span>
            <span>{availability.detail}</span>
          </p>

          {location.serviceNote ? (
            <p className="mt-5 border-s-2 border-amber bg-amber-wash/60 py-3 ps-4 pe-4 text-small text-ink">
              {location.serviceNote}
            </p>
          ) : null}

          <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Address</dt>
              <dd className="mt-1.5 text-body">
                {location.street}
                <br />
                {location.postcode} {location.city}
                <br />
                <span className="text-ink-muted">{country.name}</span>
              </dd>
            </div>

            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Getting there</dt>
              <dd className="mt-1.5 text-body text-ink-muted">{location.transit}</dd>
            </div>

            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Handles</dt>
              <dd className="mt-1.5 text-body">
                {both ? (
                  "Cash → crypto and crypto → cash"
                ) : location.directions[0] === "cash-to-crypto" ? (
                  "Cash → crypto only"
                ) : (
                  "Crypto → cash only"
                )}
              </dd>
            </div>

            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Cash on hand</dt>
              <dd className="mt-1.5 text-body">
                {location.cashOutCeiling === "0" ? (
                  <span className="text-ink-muted">No cash payouts at this pickup point</span>
                ) : (
                  <>
                    <span className="figure-num">
                      {formatMoney(parseMoney(location.cashOutCeiling, primaryCurrency))}
                    </span>
                    <span className="block text-small text-ink-muted">
                      Above this, give us a working day&rsquo;s notice.
                    </span>
                  </>
                )}
              </dd>
            </div>

            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Currencies</dt>
              <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {location.currencies.map((code) => (
                  <span key={code} className="text-body">
                    <span className="figure-num">{code}</span>{" "}
                    <span className="text-ink-muted">{FIAT[code].name}</span>
                  </span>
                ))}
              </dd>
            </div>

            <div className="border-t border-rule pt-3">
              <dt className="label-mono text-ink-faint">Coins</dt>
              <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {location.assets.map((code) => (
                  <span key={code} className="text-body">
                    <span className="figure-num">{code}</span>{" "}
                    <span className="text-ink-muted">{CRYPTO[code].name}</span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>

        <div className="md:col-span-4 md:col-start-9">
          <div className="rounded-[10px] border border-rule-strong bg-white p-5">
            <h2 className="label-mono text-ink-faint">Opening hours</h2>
            <dl className="mt-3">
              {hours.map((row) => {
                const isToday =
                  (row.days === "Sat" && clock.day === 6) ||
                  (row.days === "Sun" && clock.day === 0) ||
                  (row.days.includes("–") && clock.day >= 1 && clock.day <= 5) ||
                  row.days === (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][clock.day] ?? "");
                return (
                  <div
                    key={row.days}
                    className={cn(
                      "flex items-baseline gap-1.5 border-t border-rule-faint py-2 first:border-t-0",
                      isToday && "font-medium",
                    )}
                  >
                    <dt className="flex-none text-small">{row.days}</dt>
                    <span aria-hidden="true" className="leader" />
                    <dd className="figure-num flex-none text-small">{row.time}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 border-t border-rule pt-3 text-micro text-ink-muted">
              Central European Time. Sample hours.
            </p>
          </div>

          <div className="mt-5 space-y-2">
            <ButtonLink href={`/exchange?location=${location.slug}`} size="lg" full>
              Start an exchange here
            </ButtonLink>
            <ButtonLink href="/locations" variant="secondary" size="lg" full>
              Other locations
            </ButtonLink>
          </div>

          <LocationMap
            locations={LOCATIONS}
            activeSlug={location.slug}
            className="mt-6"
          />
        </div>
      </div>

      {nearby.length > 0 ? (
        <section className="mt-14 border-t border-rule pt-8" aria-labelledby="nearby">
          <h2 id="nearby" className="text-subhead font-medium">
            Other pickup points in {country.name}
          </h2>
          <ul className="mt-4 grid gap-px bg-rule sm:grid-cols-3">
            {nearby.map((other) => {
              const otherAvailability = availabilityOf(other, clock);
              return (
                <li key={other.slug} className="bg-paper">
                  <Link
                    href={`/locations/${other.slug}`}
                    className="group flex h-full flex-col gap-1 p-4 transition-colors hover:bg-paper-sunk"
                  >
                    <span className="text-subhead font-medium">{other.city}</span>
                    <span className="text-small text-ink-muted">{other.branch}</span>
                    <span className="mt-2 inline-flex items-center gap-2 text-small">
                      <span
                        aria-hidden="true"
                        className={cn("h-1.5 w-1.5 flex-none", MARK[otherAvailability.state])}
                      />
                      {otherAvailability.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
