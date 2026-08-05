import type { Metadata } from "next";
import Link from "next/link";
import { LocationPlot } from "@/components/locations/LocationPlot";
import { LocationRow } from "@/components/locations/LocationRow";
import { PageHeader } from "@/components/site/PageHeader";
import { cn } from "@/lib/cn";
import {
  COUNTRIES,
  counterClock,
  LOCATIONS,
  type CountryCode,
} from "@/fixtures/locations";
import { requestDate } from "@/server/clock";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, graph, locationListSchema } from "@/lib/seo/structured-data";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/locations" },
  title: "Locations",
  description:
    "Every KYRO counter, with opening hours, the directions it handles and how much cash it can pay out.",
};

const COUNTRY_ORDER: readonly CountryCode[] = ["BA", "RS", "HR", "ME", "MK"];

export default async function LocationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly country?: string }>;
}) {
  const params = await searchParams;
  const filter = COUNTRY_ORDER.find((c) => c === params.country);
  const clock = counterClock(requestDate());

  const shown = filter ? LOCATIONS.filter((l) => l.country === filter) : LOCATIONS;

  const grouped = COUNTRY_ORDER.map((code) => ({
    code,
    country: COUNTRIES[code],
    locations: shown.filter((l) => l.country === code),
  })).filter((group) => group.locations.length > 0);

  return (
    <>
      <JsonLd
        data={graph(
          locationListSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations" },
          ]),
        )}
      />

      <PageHeader
        eyebrow="Locations"
        title="Where to pay, and where to collect."
        lead="Each counter lists its hours, which directions it handles, the currencies it holds and how much cash it can pay out without notice."
      />

      <div className="shell pb-6">
        <LocationPlot locations={LOCATIONS} className="max-w-[42rem]" />
      </div>

      <div className="shell">
        <nav aria-label="Filter by country" className="border-t border-rule py-4">
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <li>
              <Link
                href="/locations"
                aria-current={!filter ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-[6px] border px-3 text-small transition-colors",
                  !filter
                    ? "border-ink bg-ink text-paper"
                    : "border-rule-strong text-ink-muted hover:text-ink",
                )}
              >
                All
                <span className="figure-num ms-2 text-micro opacity-70">
                  {LOCATIONS.length}
                </span>
              </Link>
            </li>
            {COUNTRY_ORDER.map((code) => {
              const count = LOCATIONS.filter((l) => l.country === code).length;
              if (count === 0) return null;
              const active = filter === code;
              return (
                <li key={code}>
                  <Link
                    href={`/locations?country=${code}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-[6px] border px-3 text-small transition-colors",
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-rule-strong text-ink-muted hover:text-ink",
                    )}
                  >
                    {COUNTRIES[code].name}
                    <span className="figure-num ms-2 text-micro opacity-70">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="shell pb-20">
        {grouped.length === 0 ? (
          <div className="border-t border-rule py-16 text-center">
            <p className="text-subhead font-medium">No counters there yet.</p>
            <p className="mt-2 text-small text-ink-muted">
              KYRO is opening across the region.{" "}
              <Link href="/locations" className="underline underline-offset-4">
                See every location
              </Link>
              .
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.code} className="mt-8 first:mt-0" aria-labelledby={`c-${group.code}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-2">
                <h2 id={`c-${group.code}`} className="text-subhead font-medium">
                  {group.country.name}
                </h2>
                <p className="label-mono text-ink-faint">
                  {group.country.currency} · {group.locations.length}{" "}
                  {group.locations.length === 1 ? "counter" : "counters"}
                </p>
              </div>
              <ul>
                {group.locations.map((location) => (
                  <LocationRow key={location.slug} location={location} clock={clock} />
                ))}
              </ul>
            </section>
          ))
        )}

        <p className="mt-10 border-t border-rule pt-4 text-micro text-ink-faint">
          Sample locations. These branches are illustrative and are not yet trading.
          Opening hours are given in Central European Time.
        </p>
      </div>
    </>
  );
}
