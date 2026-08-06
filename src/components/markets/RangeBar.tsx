/**
 * Where today's price sits inside today's range.
 *
 * A number and a percentage tell you what happened; this tells you where you
 * are standing. A price at the top of its day's range and a price at the bottom
 * read completely differently to anyone about to change money, and neither the
 * spot figure nor the 24-hour percentage says which it is.
 */

export function RangeBar({
  low,
  high,
  current,
  label,
}: {
  readonly low: number | undefined;
  readonly high: number | undefined;
  readonly current: number;
  readonly label: string;
}) {
  if (low === undefined || high === undefined || high <= low) {
    return <div className="h-1.5" aria-hidden="true" />;
  }

  const position = Math.max(0, Math.min(1, (current - low) / (high - low)));

  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-rule-faint"
      role="img"
      aria-label={label}
    >
      <span
        className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-ink"
        style={{ left: `${(position * 100).toFixed(2)}%` }}
      />
    </div>
  );
}
