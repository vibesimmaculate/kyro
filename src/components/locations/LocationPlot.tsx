import { cn } from "@/lib/cn";
import { COUNTRIES, type Location } from "@/fixtures/locations";

/**
 * A plot, not a map.
 *
 * Counters placed by their real coordinates on a plain equirectangular grid —
 * no tiles, no borders, no roads. Drawing a convincing map would imply a
 * precision KYRO does not have about invented branches; a plot says "here is
 * roughly where these are, relative to one another" and means it.
 */

const PADDING = 26;
const WIDTH = 520;
const HEIGHT = 420;

interface Placed {
  readonly location: Location;
  readonly x: number;
  readonly y: number;
}

function place(locations: readonly Location[]): Placed[] {
  const lats = locations.map((l) => l.coords.lat);
  const lngs = locations.map((l) => l.coords.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Latitude degrees are longer than longitude degrees at this latitude; the
  // cosine keeps the shape of the region honest rather than stretched.
  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);

  const spanLng = Math.max(0.0001, (maxLng - minLng) * lngScale);
  const spanLat = Math.max(0.0001, maxLat - minLat);
  const scale = Math.min((WIDTH - PADDING * 2) / spanLng, (HEIGHT - PADDING * 2) / spanLat);

  const offsetX = (WIDTH - spanLng * scale) / 2;
  const offsetY = (HEIGHT - spanLat * scale) / 2;

  return locations.map((location) => ({
    location,
    x: offsetX + (location.coords.lng - minLng) * lngScale * scale,
    // Screen y grows downward; latitude grows northward.
    y: offsetY + (maxLat - location.coords.lat) * scale,
  }));
}

export interface LocationPlotProps {
  readonly locations: readonly Location[];
  readonly activeSlug?: string;
  readonly className?: string;
}

export function LocationPlot({ locations, activeSlug, className }: LocationPlotProps) {
  const placed = place(locations);

  // Cities repeat (Sarajevo has two counters); label each city once.
  const labelled = new Set<string>();

  return (
    <figure className={cn("m-0", className)}>
      <div className="relative overflow-hidden rounded-[8px] border border-rule bg-white">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Schematic plot of ${locations.length} sample counters across ${
            new Set(locations.map((l) => l.country)).size
          } countries.`}
        >
          <defs>
            <pattern id="kyro-plot-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path
                d="M26 0H0V26"
                fill="none"
                stroke="var(--color-rule-faint)"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect width={WIDTH} height={HEIGHT} fill="url(#kyro-plot-grid)" />

          {placed.map(({ location, x, y }) => {
            const active = location.slug === activeSlug;
            const showLabel = !labelled.has(location.city) && labelled.add(location.city) !== null;
            const opening = location.serviceLevel === "opening-soon";

            return (
              <g key={location.slug}>
                {/* Crosshair ties the mark to the grid it sits on. */}
                <line
                  x1={x}
                  y1={y - 7}
                  x2={x}
                  y2={y + 7}
                  stroke={active ? "var(--color-blue)" : "var(--color-rule-strong)"}
                  strokeWidth="1"
                />
                <line
                  x1={x - 7}
                  y1={y}
                  x2={x + 7}
                  y2={y}
                  stroke={active ? "var(--color-blue)" : "var(--color-rule-strong)"}
                  strokeWidth="1"
                />
                <rect
                  x={x - 3}
                  y={y - 3}
                  width="6"
                  height="6"
                  fill={
                    opening
                      ? "var(--color-white)"
                      : active
                        ? "var(--color-blue)"
                        : "var(--color-ink)"
                  }
                  stroke={opening ? "var(--color-blue)" : "none"}
                  strokeWidth="1.25"
                />
                {showLabel ? (
                  <text
                    x={x + 10}
                    y={y + 4}
                    fill={active ? "var(--color-blue)" : "var(--color-ink-muted)"}
                    style={{
                      font: "500 11px var(--font-mono)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {location.city}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-ink-faint">
        <span>Schematic. Positioned by coordinate, not drawn to a map.</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 bg-ink" /> Trading
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 border border-blue bg-white" /> Opening
          soon
        </span>
        <span>
          {Object.entries(COUNTRIES)
            .filter(([code]) => locations.some((l) => l.country === code))
            .map(([, meta]) => meta.name)
            .join(" · ")}
        </span>
      </figcaption>
    </figure>
  );
}
