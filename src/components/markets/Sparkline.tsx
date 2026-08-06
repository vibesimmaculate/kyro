import { resample, type Direction } from "@/lib/markets/format";

/**
 * A week of prices, as a line.
 *
 * Deliberately axis-less and label-less. This is a shape, not a chart: it
 * answers "which way has this been going" at a glance and nothing more, and
 * putting a grid and ticks on something 32 pixels tall would be decoration
 * pretending to be data.
 *
 * The path is generated server-side and shipped as static markup. No canvas, no
 * charting library, no client JavaScript — a sparkline that costs 40kb of
 * bundle to draw twelve line segments is a bad trade.
 */

export function Sparkline({
  series,
  direction,
  width = 132,
  height = 34,
  label,
}: {
  readonly series: readonly number[];
  readonly direction: Direction;
  readonly width?: number;
  readonly height?: number;
  readonly label: string;
}) {
  const points = resample(series, 96);
  if (points.length < 2) {
    return <div className="h-[34px]" aria-hidden="true" />;
  }

  let low = Infinity;
  let high = -Infinity;
  for (const value of points) {
    if (value < low) low = value;
    if (value > high) high = value;
  }

  // A flat week would otherwise divide by zero and draw nothing; give it a
  // hairline of range so the line lands in the middle of the box.
  const span = high - low || Math.max(1e-9, Math.abs(high) * 0.001);
  const inset = 2;
  const usable = height - inset * 2;

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (value: number) => inset + (1 - (value - low) / span) * usable;

  const line = points.map((value, i) => `${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const last = points[points.length - 1] ?? low;

  const stroke =
    direction === "up"
      ? "var(--color-green)"
      : direction === "down"
        ? "var(--color-red)"
        : "var(--color-ink-muted)";

  const id = `spark-${label.replace(/\W+/g, "-")}`;
  // With no label it is decorative — in the tape the figure beside it already
  // says everything the shape does. An empty `aria-label` on a role="img" is
  // worse than no role at all: it announces an image with no description.
  const described = label.length > 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role={described ? "img" : undefined}
      aria-label={described ? label : undefined}
      aria-hidden={described ? undefined : true}
      // Fixed and clipped. Left free to stretch in a flex row it will scale its
      // contents past its own box and paint over whatever sits beside it.
      className="block flex-none overflow-hidden"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The present, marked, inset by its own radius so clipping cannot halve
          it. Without it the eye has to work out which end is today, which is
          the one thing the shape must never leave ambiguous. */}
      <circle cx={width - 2.4} cy={y(last)} r="2.4" fill={stroke} />
    </svg>
  );
}
