/**
 * SAMPLE LOCATION DATA.
 *
 * These branches do not exist. They are plausible addresses in real cities, used
 * so the product can be designed and tested end to end. Every surface that
 * renders them carries a visible "Sample locations" marker — KYRO does not
 * imply a pickup point is open somewhere it is not.
 *
 * A real directory implements `LocationProvider` and replaces the export at the
 * bottom. Nothing else in the product reads this file directly.
 */

import type { CryptoCode, FiatCode } from "@/lib/money/currencies";
import type { Direction } from "@/lib/quote/types";

export type CountryCode = "BA" | "RS" | "HR" | "ME" | "MK";

export const COUNTRIES: Record<CountryCode, { name: string; currency: FiatCode }> = {
  BA: { name: "Bosnia and Herzegovina", currency: "BAM" },
  RS: { name: "Serbia", currency: "RSD" },
  HR: { name: "Croatia", currency: "EUR" },
  ME: { name: "Montenegro", currency: "EUR" },
  MK: { name: "North Macedonia", currency: "MKD" },
};

/** Minutes from midnight, local time. Kept as integers to avoid date maths. */
export interface HourRange {
  readonly open: number;
  readonly close: number;
}

/** Index 0 is Sunday, matching `Date.getDay()`. `null` means closed. */
export type WeekHours = readonly (HourRange | null)[];

export type ServiceLevel =
  /** Both directions, every supported asset, no notice needed. */
  | "full"
  /** Open, but something is restricted — stated in `serviceNote`. */
  | "limited"
  /** Fitted out, not yet trading. Stated with a date. */
  | "opening-soon";

export interface Location {
  readonly slug: string;
  readonly city: string;
  readonly country: CountryCode;
  /** Neighbourhood or building — how a local would describe where it is. */
  readonly branch: string;
  readonly street: string;
  readonly postcode: string;
  readonly transit: string;
  readonly hours: WeekHours;
  readonly directions: readonly Direction[];
  readonly currencies: readonly FiatCode[];
  readonly assets: readonly CryptoCode[];
  readonly serviceLevel: ServiceLevel;
  readonly serviceNote?: string;
  /** Largest cash payout without arranging ahead, in the branch's currency. */
  readonly cashOutCeiling: string;
  readonly opensOn?: string;
  readonly coords: { readonly lat: number; readonly lng: number };
}

const h = (open: string, close: string): HourRange => {
  const [oh = "0", om = "0"] = open.split(":");
  const [ch = "0", cm = "0"] = close.split(":");
  return { open: Number(oh) * 60 + Number(om), close: Number(ch) * 60 + Number(cm) };
};

/** Sun, Mon–Fri, Sat — written in that order to match `Date.getDay()`. */
const weekdays = (
  weekday: HourRange,
  saturday: HourRange | null,
  sunday: HourRange | null = null,
): WeekHours => [sunday, weekday, weekday, weekday, weekday, weekday, saturday];

const BOTH: readonly Direction[] = ["cash-to-crypto", "crypto-to-cash"];

export const LOCATIONS: readonly Location[] = [
  {
    slug: "sarajevo-bascarsija",
    city: "Sarajevo",
    country: "BA",
    branch: "Baščaršija",
    street: "Sarači 14",
    postcode: "71000",
    transit: "Tram 1, 2, 3 — Baščaršija stop",
    hours: weekdays(h("09:00", "20:00"), h("09:00", "17:00")),
    directions: BOTH,
    currencies: ["BAM", "EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC", "SOL"],
    serviceLevel: "full",
    cashOutCeiling: "8000",
    coords: { lat: 43.8594, lng: 18.4312 },
  },
  {
    slug: "sarajevo-marijin-dvor",
    city: "Sarajevo",
    country: "BA",
    branch: "Marijin Dvor",
    street: "Zmaja od Bosne 4",
    postcode: "71000",
    transit: "Tram — Marijin Dvor stop",
    hours: weekdays(h("08:30", "19:00"), h("09:00", "14:00")),
    directions: BOTH,
    currencies: ["BAM", "EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC"],
    serviceLevel: "full",
    cashOutCeiling: "12000",
    coords: { lat: 43.8563, lng: 18.4064 },
  },
  {
    slug: "banja-luka-gospodska",
    city: "Banja Luka",
    country: "BA",
    branch: "Gospodska",
    street: "Veselina Masleše 22",
    postcode: "78000",
    transit: "Central pedestrian zone",
    hours: weekdays(h("09:00", "18:00"), h("09:00", "13:00")),
    directions: BOTH,
    currencies: ["BAM", "EUR"],
    assets: ["BTC", "ETH", "USDT"],
    serviceLevel: "limited",
    serviceNote: "Cash out above 5 000 KM needs one working day's notice.",
    cashOutCeiling: "5000",
    coords: { lat: 44.7722, lng: 17.191 },
  },
  {
    slug: "mostar-rondo",
    city: "Mostar",
    country: "BA",
    branch: "Rondo",
    street: "Kralja Petra Krešimira IV 3",
    postcode: "88000",
    transit: "Rondo roundabout",
    hours: weekdays(h("09:00", "17:00"), null),
    directions: ["cash-to-crypto"],
    currencies: ["BAM", "EUR"],
    assets: ["BTC", "USDT"],
    serviceLevel: "limited",
    serviceNote: "Cash to crypto only at this pickup point for now.",
    cashOutCeiling: "0",
    coords: { lat: 43.3438, lng: 17.8078 },
  },
  {
    slug: "belgrade-vracar",
    city: "Belgrade",
    country: "RS",
    branch: "Vračar",
    street: "Njegoševa 45",
    postcode: "11000",
    transit: "Slavija — 10 minutes on foot",
    hours: weekdays(h("09:00", "20:00"), h("10:00", "16:00")),
    directions: BOTH,
    currencies: ["RSD", "EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC", "SOL"],
    serviceLevel: "full",
    cashOutCeiling: "600000",
    coords: { lat: 44.7999, lng: 20.4746 },
  },
  {
    slug: "belgrade-dorcol",
    city: "Belgrade",
    country: "RS",
    branch: "Dorćol",
    street: "Cara Dušana 28",
    postcode: "11000",
    transit: "Studentski trg — 6 minutes on foot",
    hours: weekdays(h("10:00", "19:00"), h("10:00", "15:00")),
    directions: BOTH,
    currencies: ["RSD", "EUR"],
    assets: ["BTC", "ETH", "USDT"],
    serviceLevel: "full",
    cashOutCeiling: "400000",
    coords: { lat: 44.8225, lng: 20.4589 },
  },
  {
    slug: "novi-sad-centar",
    city: "Novi Sad",
    country: "RS",
    branch: "Centar",
    street: "Zmaj Jovina 12",
    postcode: "21000",
    transit: "Trg slobode",
    hours: weekdays(h("09:00", "18:00"), h("09:00", "14:00")),
    directions: BOTH,
    currencies: ["RSD", "EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC"],
    serviceLevel: "full",
    cashOutCeiling: "350000",
    coords: { lat: 45.2551, lng: 19.845 },
  },
  {
    slug: "zagreb-donji-grad",
    city: "Zagreb",
    country: "HR",
    branch: "Donji Grad",
    street: "Preradovićeva 17",
    postcode: "10000",
    transit: "Cvjetni trg — tram 6, 13",
    hours: weekdays(h("09:00", "20:00"), h("09:00", "15:00")),
    directions: BOTH,
    currencies: ["EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC", "SOL"],
    serviceLevel: "full",
    cashOutCeiling: "10000",
    coords: { lat: 45.8109, lng: 15.9764 },
  },
  {
    slug: "split-varos",
    city: "Split",
    country: "HR",
    branch: "Varoš",
    street: "Šperun 9",
    postcode: "21000",
    transit: "Riva — 5 minutes on foot",
    hours: weekdays(h("09:00", "19:00"), h("09:00", "13:00")),
    directions: BOTH,
    currencies: ["EUR"],
    assets: ["BTC", "ETH", "USDT"],
    serviceLevel: "full",
    cashOutCeiling: "6000",
    coords: { lat: 43.5074, lng: 16.4358 },
  },
  {
    slug: "podgorica-preko-morace",
    city: "Podgorica",
    country: "ME",
    branch: "Preko Morače",
    street: "Bulevar Svetog Petra Cetinjskog 56",
    postcode: "81000",
    transit: "Delta City — 8 minutes on foot",
    hours: weekdays(h("09:00", "18:00"), h("09:00", "13:00")),
    directions: BOTH,
    currencies: ["EUR"],
    assets: ["BTC", "ETH", "USDT", "USDC"],
    serviceLevel: "full",
    cashOutCeiling: "7000",
    coords: { lat: 42.4396, lng: 19.2531 },
  },
  {
    slug: "skopje-centar",
    city: "Skopje",
    country: "MK",
    branch: "Centar",
    street: "Makedonija 15",
    postcode: "1000",
    transit: "Ploštad Makedonija",
    hours: weekdays(h("09:00", "19:00"), h("09:00", "14:00")),
    directions: BOTH,
    currencies: ["MKD", "EUR"],
    assets: ["BTC", "ETH", "USDT"],
    serviceLevel: "full",
    cashOutCeiling: "400000",
    coords: { lat: 41.9954, lng: 21.4316 },
  },
  {
    slug: "tuzla-korzo",
    city: "Tuzla",
    country: "BA",
    branch: "Korzo",
    street: "Turalibegova 8",
    postcode: "75000",
    transit: "Trg slobode",
    hours: weekdays(h("09:00", "17:00"), null),
    directions: BOTH,
    currencies: ["BAM", "EUR"],
    assets: ["BTC", "USDT"],
    serviceLevel: "opening-soon",
    serviceNote: "Fitted out and waiting on final sign-off.",
    opensOn: "2026-09-01",
    cashOutCeiling: "4000",
    coords: { lat: 44.5384, lng: 18.6739 },
  },
];

/* ── Opening hours ──────────────────────────────────────────────────────── */

/** Every branch keeps Central European time, so one zone covers the network. */
export const COUNTER_TIME_ZONE = "Europe/Sarajevo";

export interface LocalClock {
  /** 0 = Sunday, matching `Date.getDay()`. */
  readonly day: number;
  /** Minutes since local midnight. */
  readonly minutes: number;
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Reads the wall clock at the pickup point, not on the visitor's device. Someone
 * checking from London must still see Sarajevo's opening hours.
 */
export function pickupClock(at: Date, timeZone: string = COUNTER_TIME_ZONE): LocalClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const day = DAY_INDEX[get("weekday")] ?? 0;
  const hour = Number(get("hour"));
  // Some ICU builds render midnight as 24.
  const normalisedHour = hour === 24 ? 0 : hour;
  return { day, minutes: normalisedHour * 60 + Number(get("minute")) };
}

export const MINUTES_LABEL = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type AvailabilityState = "open" | "closing-soon" | "closed" | "opening-soon";

export interface Availability {
  readonly state: AvailabilityState;
  /** Short, human, and never colour-dependent. */
  readonly label: string;
  /** The longer form: "Opens Monday 09:00". */
  readonly detail: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function availabilityOf(location: Location, clock: LocalClock): Availability {
  if (location.serviceLevel === "opening-soon") {
    const when = location.opensOn
      ? new Date(`${location.opensOn}T00:00:00Z`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "soon";
    return { state: "opening-soon", label: "Opening soon", detail: `Opens ${when}` };
  }

  const today = location.hours[clock.day] ?? null;

  if (today && clock.minutes >= today.open && clock.minutes < today.close) {
    const untilClose = today.close - clock.minutes;
    if (untilClose <= 60) {
      return {
        state: "closing-soon",
        label: "Closing soon",
        detail: `Closes at ${MINUTES_LABEL(today.close)}`,
      };
    }
    return { state: "open", label: "Open now", detail: `Until ${MINUTES_LABEL(today.close)}` };
  }

  // Find the next day that has hours, starting with the rest of today.
  if (today && clock.minutes < today.open) {
    return {
      state: "closed",
      label: "Closed",
      detail: `Opens today at ${MINUTES_LABEL(today.open)}`,
    };
  }

  for (let step = 1; step <= 7; step += 1) {
    const day = (clock.day + step) % 7;
    const range = location.hours[day];
    if (range) {
      const name = step === 1 ? "tomorrow" : DAY_NAMES[day];
      return {
        state: "closed",
        label: "Closed",
        detail: `Opens ${name} at ${MINUTES_LABEL(range.open)}`,
      };
    }
  }

  return { state: "closed", label: "Closed", detail: "Hours not set" };
}

/** "Mon–Fri 09:00–20:00 · Sat 09:00–17:00 · Sun closed" */
export function summariseHours(hours: WeekHours): Array<{ days: string; time: string }> {
  const rows: Array<{ days: string; time: string }> = [];
  const fmt = (r: HourRange | null) =>
    r ? `${MINUTES_LABEL(r.open)}–${MINUTES_LABEL(r.close)}` : "Closed";

  let runStart = 1;
  for (let day = 1; day <= 5; day += 1) {
    const current = hours[day] ?? null;
    const next = day < 5 ? (hours[day + 1] ?? null) : undefined;
    const same =
      next !== undefined &&
      ((current === null && next === null) ||
        (current !== null && next !== null && current.open === next.open && current.close === next.close));
    if (!same) {
      const label =
        runStart === day
          ? (DAY_NAMES[runStart] ?? "").slice(0, 3)
          : `${(DAY_NAMES[runStart] ?? "").slice(0, 3)}–${(DAY_NAMES[day] ?? "").slice(0, 3)}`;
      rows.push({ days: label, time: fmt(current) });
      runStart = day + 1;
    }
  }
  rows.push({ days: "Sat", time: fmt(hours[6] ?? null) });
  rows.push({ days: "Sun", time: fmt(hours[0] ?? null) });
  return rows;
}

/* ── Provider seam ──────────────────────────────────────────────────────── */

export interface LocationProvider {
  readonly id: string;
  /** False while these are invented branches, and shown as such in the UI. */
  readonly isReal: boolean;
  list(): readonly Location[];
  bySlug(slug: string): Location | undefined;
}

export const sampleLocationProvider: LocationProvider = {
  id: "sample",
  isReal: false,
  list: () => LOCATIONS,
  bySlug: (slug) => LOCATIONS.find((l) => l.slug === slug),
};

export function locationsForCountry(country: CountryCode): readonly Location[] {
  return LOCATIONS.filter((l) => l.country === country);
}

export function citiesWithCounters(): readonly string[] {
  return [...new Set(LOCATIONS.map((l) => l.city))];
}

/** Branches that can hand over cash in this currency, for the picker. */
export function locationsSupporting(
  direction: Direction,
  currency: FiatCode,
  asset: CryptoCode,
): readonly Location[] {
  return LOCATIONS.filter(
    (l) =>
      l.directions.includes(direction) &&
      l.currencies.includes(currency) &&
      l.assets.includes(asset) &&
      l.serviceLevel !== "opening-soon",
  );
}
