import Link from "next/link";
import { cn } from "@/lib/cn";
import { COUNTRIES, type Location } from "@/fixtures/locations";
import { COUNTRY_OUTLINES, MAP_BOUNDS } from "@/fixtures/borders";

/**
 * The map.
 *
 * Real country outlines, a real projection, and every pickup point placed by
 * its actual coordinates. What it deliberately is not is a tile map: no third
 * party gets a request on every page view, there is no key in the client, and
 * — the part that matters — the detail stops exactly where KYRO's knowledge
 * stops. A slippy map invites you to zoom until you can see the street, and
 * these addresses are sample data. This draws the region, not the pavement.
 *
 * Rendered on the server as static SVG. No client JavaScript at all.
 */

/**
 * Web Mercator, which is what everyone's mental image of a map is drawn in.
 *
 * Both axes are in radians. That is not a detail: the y here is a logarithm of
 * a tangent and comes out around 0.15 for this region, so pairing it with a
 * longitude still in degrees — around 13 — squashes the whole map to a strip a
 * few pixels tall. Same projection, same numbers, one unit apart.
 */
function mercatorX(lng: number): number {
  return (lng * Math.PI) / 180;
}

function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

const WIDTH = 760;

const X0 = mercatorX(MAP_BOUNDS.west);
const X1 = mercatorX(MAP_BOUNDS.east);
const Y0 = mercatorY(MAP_BOUNDS.north);
const Y1 = mercatorY(MAP_BOUNDS.south);

const SCALE = WIDTH / (X1 - X0);
const HEIGHT = Math.round((Y0 - Y1) * SCALE);

const projectX = (lng: number): number => (mercatorX(lng) - X0) * SCALE;
const projectY = (lat: number): number => (Y0 - mercatorY(lat)) * SCALE;

function pathFor(rings: CountryRings): string {
  let path = "";
  for (const ring of rings) {
    ring.forEach((point, index) => {
      const x = projectX(point[0]).toFixed(1);
      const y = projectY(point[1]).toFixed(1);
      path += `${index === 0 ? "M" : "L"}${x} ${y}`;
    });
    path += "Z";
  }
  return path;
}

type CountryRings = readonly (readonly (readonly [number, number])[])[];

export interface LocationMapProps {
  readonly locations: readonly Location[];
  readonly activeSlug?: string;
  readonly className?: string;
  /** Links each marker to its page. Off for the homepage summary. */
  readonly linked?: boolean;
}

export function LocationMap({
  locations,
  activeSlug,
  className,
  linked = true,
}: LocationMapProps) {
  const served = new Set(locations.map((location) => location.country));

  // Cities repeat — Sarajevo has two pickup points — so a city is labelled once
  // and its marker sized by how many sit there.
  const cities = new Map<string, { lat: number; lng: number; items: Location[] }>();
  for (const location of locations) {
    const existing = cities.get(location.city);
    if (existing) {
      existing.items.push(location);
    } else {
      cities.set(location.city, {
        lat: location.coords.lat,
        lng: location.coords.lng,
        items: [location],
      });
    }
  }

  return (
    <figure className={cn("min-w-0", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        // `img` makes an element a leaf, so declaring it while the markers are
        // links hides every one of them from assistive technology. When the
        // markers link it is a group of controls and says so; when they do not,
        // it is a picture.
        role={linked ? "group" : "img"}
        aria-label={`Map of the western Balkans showing ${locations.length} KYRO pickup points across ${served.size} countries.`}
      >
        <defs>
          <linearGradient id="kyro-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-paper-sunk)" />
            <stop offset="100%" stopColor="var(--color-paper-edge)" />
          </linearGradient>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#kyro-sea)" />

        {/* Countries KYRO does not serve, drawn first and quietly. They are
            here so the shape of the region is recognisable — without Italy
            across the Adriatic, the coastline is just a squiggle. */}
        {COUNTRY_OUTLINES.filter((country) => !country.served).map((country) => (
          <path
            key={country.code}
            d={pathFor(country.rings)}
            fill="var(--color-paper-sunk)"
            stroke="var(--color-rule)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        ))}

        {COUNTRY_OUTLINES.filter((country) => country.served).map((country) => {
          const active = served.has(country.code as keyof typeof COUNTRIES);
          return (
            <path
              key={country.code}
              d={pathFor(country.rings)}
              fill={active ? "var(--color-surface-strong)" : "var(--color-paper-edge)"}
              stroke={active ? "var(--color-rule-strong)" : "var(--color-rule)"}
              strokeWidth={active ? 1.4 : 1}
              strokeLinejoin="round"
            />
          );
        })}

        {/* Markers last, so nothing is drawn over them. */}
        {layOut(cities).map(({ city, entry, x, y, labelX, labelY, anchor }) => {
          const isActive = entry.items.some((item) => item.slug === activeSlug);
          const target = entry.items[0];
          if (!target) return null;

          const marker = (
            <g>
              {isActive ? (
                <circle cx={x} cy={y} r="11" fill="var(--color-blue)" opacity="0.16" />
              ) : null}
              {/* A leader when the label had to be moved off the marker, so it
                  is never ambiguous which dot a name belongs to. */}
              {Math.abs(labelY - y) > 3 ? (
                <line
                  x1={x}
                  y1={y}
                  x2={labelX + (anchor === "end" ? 3 : -3)}
                  y2={labelY - 3}
                  stroke="var(--color-rule-strong)"
                  strokeWidth="0.8"
                />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={isActive ? 5.5 : 4.5}
                fill={isActive ? "var(--color-blue)" : "var(--color-ink)"}
                stroke="var(--color-paper)"
                strokeWidth="1.6"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={anchor}
                className="fill-ink text-[12px] font-medium"
                style={{ paintOrder: "stroke", stroke: "var(--color-paper)", strokeWidth: 3.5 }}
              >
                {city}
                {entry.items.length > 1 ? ` (${entry.items.length})` : ""}
              </text>
            </g>
          );

          if (!linked) return <g key={city}>{marker}</g>;

          return (
            <Link
              key={city}
              href={`/locations/${target.slug}`}
              aria-label={`${city} — ${entry.items.length} pickup ${
                entry.items.length === 1 ? "point" : "points"
              }`}
            >
              {marker}
            </Link>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="mark-square" />
          {locations.length} pickup points in {served.size} countries
        </span>
        <span>Borders from Natural Earth. Addresses are sample data.</span>
      </figcaption>
    </figure>
  );
}

interface CityEntry {
  readonly lat: number;
  readonly lng: number;
  readonly items: Location[];
}

interface PlacedLabel {
  readonly city: string;
  readonly entry: CityEntry;
  readonly x: number;
  readonly y: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: "start" | "end";
}

/**
 * Places the city labels so they do not sit on top of each other.
 *
 * Twelve pickup points across five countries put Sarajevo, Tuzla and Zenica
 * within a few dozen pixels of one another, and a label at a fixed offset from
 * each marker produces an unreadable pile. This is the standard greedy
 * approach: take each label in turn, try the right of the marker, then the
 * left, then nudge it up and down, and keep the first position that does not
 * overlap anything already placed.
 *
 * It is not optimal — optimal label placement is NP-hard — and it does not need
 * to be. It needs to be legible for this many markers, and it is.
 */
function layOut(cities: Map<string, CityEntry>): PlacedLabel[] {
  const CHAR = 6.6;
  const LINE = 13;
  const placed: PlacedLabel[] = [];
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  // North to south, so the order is stable and does not depend on Map ordering.
  const ordered = [...cities.entries()].sort((a, b) => b[1].lat - a[1].lat);

  for (const [city, entry] of ordered) {
    const x = projectX(entry.lng);
    const y = projectY(entry.lat);
    const text = `${city}${entry.items.length > 1 ? ` (${entry.items.length})` : ""}`;
    const width = text.length * CHAR;

    let chosen: PlacedLabel | undefined;

    for (const dy of [4, -10, 16, -20, 26]) {
      for (const side of ["start", "end"] as const) {
        const labelX = side === "start" ? x + 9 : x - 9;
        const labelY = y + dy;
        const x0 = side === "start" ? labelX : labelX - width;
        const box = { x0, y0: labelY - LINE + 3, x1: x0 + width, y1: labelY + 3 };

        if (box.x0 < 2 || box.x1 > WIDTH - 2) continue;
        const clashes = boxes.some(
          (other) =>
            box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0,
        );
        if (clashes) continue;

        boxes.push(box);
        chosen = { city, entry, x, y, labelX, labelY, anchor: side };
        break;
      }
      if (chosen) break;
    }

    // Nowhere clean to put it: place it anyway rather than dropping a pickup
    // point off the map entirely.
    placed.push(chosen ?? { city, entry, x, y, labelX: x + 9, labelY: y + 4, anchor: "start" });
  }

  return placed;
}
