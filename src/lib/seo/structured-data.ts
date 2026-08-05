import { LOCATIONS, COUNTRIES, MINUTES_LABEL, type Location } from "@/fixtures/locations";
import { CRYPTO, FIAT } from "@/lib/money/currencies";
import { SERVICE_FEE_BP } from "@/lib/quote/types";
import { KEY_FACTS, SITE, absolute } from "./site";

/**
 * JSON-LD.
 *
 * Two audiences, one source of truth. Search engines use this for rich results;
 * answer and generative engines use it because it is the least ambiguous
 * statement of the same facts the prose makes — a model that has to choose
 * between parsing a sentence and reading a typed field will read the field.
 *
 * Everything here is a fact the product actually holds. There are no invented
 * ratings, review counts or price ranges, which is also why there is no
 * AggregateRating: fabricating one is the single most common way this markup
 * gets abused, and the rich result it buys is not worth lying for.
 */

type Json = Record<string, unknown>;

export function organisationSchema(): Json {
  return {
    "@type": "Organization",
    "@id": absolute("/#organisation"),
    name: SITE.name,
    url: SITE.url,
    description: SITE.summary,
    email: SITE.email,
    areaServed: SITE.areaServed.map((code) => ({ "@type": "Country", identifier: code })),
    knowsLanguage: ["en", "bs", "hr", "sr", "mk"],
  };
}

export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": absolute("/#website"),
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    publisher: { "@id": absolute("/#organisation") },
    inLanguage: "en-GB",
  };
}

/**
 * The exchange itself, as a described service.
 *
 * The fee is expressed as a real number rather than prose so it can be read
 * without interpretation — this is the field most likely to be quoted back at a
 * customer by an assistant, and it needs to be exactly right.
 */
export function serviceSchema(): Json {
  return {
    "@type": "FinancialProduct",
    "@id": absolute("/#service"),
    name: "Cash to crypto exchange",
    description: SITE.summary,
    provider: { "@id": absolute("/#organisation") },
    feesAndCommissionsSpecification: `${SERVICE_FEE_BP / 100}% of the cash side of the exchange, in both directions. Blockchain network fees are separate and itemised.`,
    areaServed: SITE.areaServed.map((code) => ({ "@type": "Country", identifier: code })),
    offers: {
      "@type": "Offer",
      priceSpecification: {
        "@type": "PriceSpecification",
        description: `${SERVICE_FEE_BP / 100}% service fee`,
      },
    },
  };
}

export function faqSchema(
  items: ReadonlyArray<{ question: string; answer: string }> = KEY_FACTS,
): Json {
  return {
    "@type": "FAQPage",
    "@id": absolute("/#faq"),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * A counter, as a place you can walk into.
 *
 * Marked `isAccessibleForFree` false and carrying its real opening hours. These
 * are sample branches, which is stated on every page that renders them — the
 * markup describes what the site says, and the site says they are samples.
 */
export function locationSchema(location: Location): Json {
  const country = COUNTRIES[location.country];

  const hours = location.hours
    .map((range, day) => {
      if (!range) return null;
      const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
        day
      ];
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${name}`,
        opens: MINUTES_LABEL(range.open),
        closes: MINUTES_LABEL(range.close),
      };
    })
    .filter(Boolean);

  return {
    "@type": "FinancialService",
    "@id": absolute(`/locations/${location.slug}#place`),
    name: `${SITE.name} ${location.city} — ${location.branch}`,
    parentOrganization: { "@id": absolute("/#organisation") },
    url: absolute(`/locations/${location.slug}`),
    address: {
      "@type": "PostalAddress",
      streetAddress: location.street,
      addressLocality: location.city,
      postalCode: location.postcode,
      addressCountry: location.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: location.coords.lat,
      longitude: location.coords.lng,
    },
    openingHoursSpecification: hours,
    currenciesAccepted: location.currencies.join(", "),
    paymentAccepted: "Cash",
    areaServed: { "@type": "Country", identifier: location.country, name: country.name },
  };
}

export function breadcrumbSchema(trail: ReadonlyArray<{ name: string; path: string }>): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absolute(step.path),
    })),
  };
}

/** Every counter as one list, for the locations index. */
export function locationListSchema(): Json {
  return {
    "@type": "ItemList",
    "@id": absolute("/locations#list"),
    name: `${SITE.name} counters`,
    numberOfItems: LOCATIONS.length,
    itemListElement: LOCATIONS.map((location, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: locationSchema(location),
    })),
  };
}

/** What KYRO handles, stated as data rather than left in a footer list. */
export function supportedAssetsSchema(): Json {
  return {
    "@type": "ItemList",
    "@id": absolute("/#assets"),
    name: "Supported currencies",
    itemListElement: [
      ...Object.values(CRYPTO).map((asset, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${asset.name} (${asset.code})`,
      })),
      ...Object.values(FIAT).map((currency, index) => ({
        "@type": "ListItem",
        position: Object.keys(CRYPTO).length + index + 1,
        name: `${currency.name} (${currency.code})`,
      })),
    ],
  };
}

/** Wraps one or more nodes into a single graph, ready to render. */
export function graph(...nodes: Json[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}
