import { formatPrice, resample } from "@/lib/markets/format";
import type { PriceHistory } from "@/server/prices";

/**
 * The full chart.
 *
 * Server-rendered SVG, no charting library, no client JavaScript. A line chart
 * is a path, an axis is six pieces of text, and shipping forty kilobytes of
 * library to draw them would be a strange trade.
 *
 * What it deliberately does not have: crosshairs, drawing tools, indicators, a
 * volume pane. This is a page for someone about to change money who wants to
 * know whether now looks like a reasonable moment — not a trading terminal, and
 * every affordance that suggests otherwise is one this product has said from
 * the beginning it would not add.
 */

const WIDTH = 900;
const HEIGHT = 300;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

export function PriceChart({
  history,
  label,
}: {
  readonly history: PriceHistory;
  readonly label: string;
}) {
  // One point per two pixels is past what the eye can resolve; beyond that the
  // path is just bytes. Averaged into buckets rather than sampled, so a spike
  // cannot be dropped and a calm week drawn that never happened.
  const values = resample(
    history.points.map((point) => point[1]),
    Math.min(history.points.length, 420),
  );

  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (value < low) low = value;
    if (value > high) high = value;
  }

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const up = last >= first;
  const stroke = up ? "var(--color-green)" : "var(--color-red)";

  // A little headroom top and bottom, so the line never touches the frame.
  const pad = (high - low) * 0.12 || Math.max(1e-9, Math.abs(high) * 0.01);
  const top = high + pad;
  const bottom = Math.max(0, low - pad);
  const span = top - bottom || 1;

  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_X + (i / Math.max(1, values.length - 1)) * (WIDTH - PAD_X * 2);
  const y = (value: number) => PAD_TOP + (1 - (value - bottom) / span) * plotHeight;

  const line = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");

  const firstAt = history.points[0]?.[0];
  const lastAt = history.points[history.points.length - 1]?.[0];

  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`fill-${history.asset}-${history.days}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Four horizontals, labelled. Enough to read a level off, few enough
            that the line is still the thing you look at. */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = bottom + span * (1 - fraction);
          const py = PAD_TOP + fraction * plotHeight;
          return (
            <g key={fraction}>
              <line
                x1={PAD_X}
                y1={py}
                x2={WIDTH - PAD_X}
                y2={py}
                stroke="var(--color-rule-faint)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD_X + 2}
                y={py - 5}
                className="fill-ink-faint"
                style={{ fontSize: 11, fontFamily: "var(--font-mono, ui-monospace)" }}
              >
                {formatPrice(value)}
              </text>
            </g>
          );
        })}

        <polygon
          points={`${PAD_X},${HEIGHT - PAD_BOTTOM} ${line} ${WIDTH - PAD_X},${HEIGHT - PAD_BOTTOM}`}
          fill={`url(#fill-${history.asset}-${history.days})`}
        />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-1 flex items-baseline justify-between text-micro text-ink-faint">
        <span className="figure-num">{firstAt ? stamp(firstAt, history.days) : ""}</span>
        <span className="figure-num">{lastAt ? stamp(lastAt, history.days) : "now"}</span>
      </div>
    </figure>
  );
}

/**
 * Axis labels, at a precision that suits the range.
 *
 * A time on a 24-hour chart and a date on a yearly one. Showing the date on the
 * day chart tells you nothing; showing the time on the year chart is noise.
 */
function stamp(at: number, days: string): string {
  const date = new Date(at);
  if (days === "1") {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(days === "365" ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}
